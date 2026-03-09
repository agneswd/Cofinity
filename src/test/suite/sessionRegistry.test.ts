import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { SessionRegistry } from '../../features/session-runtime/SessionRegistry';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition.');
    }

    await wait(10);
  }
}

suite('SessionRegistry', () => {
  let registry: SessionRegistry;

  setup(() => {
    registry = new SessionRegistry();
  });

  teardown(() => {
    registry.dispose();
  });

  test('isolates concurrent sessions and resolves the correct pending request', async () => {
    const tokenA = new vscode.CancellationTokenSource();
    const tokenB = new vscode.CancellationTokenSource();

    const promiseA = registry.handleToolInvocation({
      question: 'alpha session pending question',
      requestKind: 'question',
      token: tokenA.token
    });
    const promiseB = registry.handleToolInvocation({
      question: 'beta session pending question',
      requestKind: 'question',
      token: tokenB.token
    });

    await waitFor(() => registry.buildManagerSnapshot().sessions.length === 2);

    const snapshot = registry.buildManagerSnapshot();
    const alphaSession = snapshot.sessions.find((session) => session.title.includes('alpha'));
    const betaSession = snapshot.sessions.find((session) => session.title.includes('beta'));

    assert.ok(alphaSession);
    assert.ok(betaSession);
    assert.notEqual(alphaSession.sessionId, betaSession.sessionId);

    registry.selectSession(alphaSession.sessionId);
    const alphaDetail = registry.getSelectedSessionSnapshot();
    assert.ok(alphaDetail?.pendingRequest);
    const alphaResolved = registry.respondToPendingRequest(
      alphaSession.sessionId,
      alphaDetail.pendingRequest.requestId,
      'answer alpha'
    );

    registry.selectSession(betaSession.sessionId);
    const betaDetail = registry.getSelectedSessionSnapshot();
    assert.ok(betaDetail?.pendingRequest);
    const betaResolved = registry.respondToPendingRequest(
      betaSession.sessionId,
      betaDetail.pendingRequest.requestId,
      'answer beta'
    );

    assert.equal(alphaResolved, true);
    assert.equal(betaResolved, true);

    const resultA = await promiseA;
    const resultB = await promiseB;

    assert.equal(resultA.response, 'answer alpha');
    assert.equal(resultB.response, 'answer beta');
    assert.equal(resultA.sessionId, alphaSession.sessionId);
    assert.equal(resultB.sessionId, betaSession.sessionId);
  });

  test('returns queued prompts for the correct session only', async () => {
    const token = new vscode.CancellationTokenSource();

    const firstRequest = registry.handleToolInvocation({
      question: 'queue owner session',
      requestKind: 'question',
      token: token.token
    });

    await waitFor(() => registry.buildManagerSnapshot().sessions.length === 1);
    const sessionId = registry.buildManagerSnapshot().sessions[0].sessionId;

    registry.selectSession(sessionId);
    const detail = registry.getSelectedSessionSnapshot();
    assert.ok(detail?.pendingRequest);
    registry.respondToPendingRequest(sessionId, detail.pendingRequest.requestId, 'initial response');
    await firstRequest;

    registry.enqueuePrompt(sessionId, 'queued follow up');

    registry.selectSession(sessionId);
    const detailBeforeRelease = registry.getSelectedSessionSnapshot();
    assert.equal(detailBeforeRelease?.chatMessages.some((message) => message.content === 'queued follow up'), false);
    assert.equal(detailBeforeRelease?.queuedCount, 1);

    const passiveToken = new vscode.CancellationTokenSource();

    const queuedResult = await registry.handleToolInvocation({
      sessionId,
      question: 'use the queued prompt',
      requestKind: 'question',
      token: passiveToken.token
    });

    assert.equal(queuedResult.source, 'queue');
    assert.equal(queuedResult.response, 'queued follow up');
    assert.equal(queuedResult.queuedRemaining, 0);

    registry.selectSession(sessionId);
    const detailAfterRelease = registry.getSelectedSessionSnapshot();
    assert.equal(detailAfterRelease?.chatMessages.at(-1)?.content, 'queued follow up');
    assert.equal(detailAfterRelease?.chatMessages.at(-1)?.state, 'delivered');
  });

  test('supports editing and drag-style reordering for queued prompts', async () => {
    const token = new vscode.CancellationTokenSource();

    const initialRequest = registry.handleToolInvocation({
      question: 'queue controls session',
      requestKind: 'question',
      token: token.token
    });

    await waitFor(() => registry.buildManagerSnapshot().sessions.length === 1);
    const sessionId = registry.buildManagerSnapshot().sessions[0].sessionId;

    registry.selectSession(sessionId);
    const detail = registry.getSelectedSessionSnapshot();
    assert.ok(detail?.pendingRequest);
    registry.respondToPendingRequest(sessionId, detail.pendingRequest.requestId, 'initial response');
    await initialRequest;

    registry.enqueuePrompt(sessionId, 'first prompt');
    registry.enqueuePrompt(sessionId, 'second prompt');

    const firstSnapshot = registry.getSessionSnapshot(sessionId);
    assert.ok(firstSnapshot);
    const firstItemId = firstSnapshot.queuedPrompts[0].itemId;
    const secondItemId = firstSnapshot.queuedPrompts[1].itemId;

    assert.equal(registry.updateQueuedPrompt(sessionId, firstItemId, 'first prompt edited'), true);
    assert.equal(registry.reorderQueuedPrompt(sessionId, secondItemId, firstItemId), true);

    const reorderedSnapshot = registry.getSessionSnapshot(sessionId);
    assert.equal(reorderedSnapshot?.queuedPrompts[0].content, 'second prompt');
    assert.equal(reorderedSnapshot?.queuedPrompts[1].content, 'first prompt edited');
  });

  test('persists settings and marks cleared queued messages as skipped', async () => {
    const token = new vscode.CancellationTokenSource();

    const initialRequest = registry.handleToolInvocation({
      question: 'settings and queue behavior',
      requestKind: 'question',
      token: token.token
    });

    await waitFor(() => registry.buildManagerSnapshot().sessions.length === 1);
    const sessionId = registry.buildManagerSnapshot().sessions[0].sessionId;

    registry.selectSession(sessionId);
    const detail = registry.getSelectedSessionSnapshot();
    assert.ok(detail?.pendingRequest);
    registry.respondToPendingRequest(sessionId, detail.pendingRequest.requestId, 'ack');
    await initialRequest;

    registry.updateSettings(sessionId, {
      notificationSoundEnabled: false,
      autoQueuePrompts: false
    });
    registry.enqueuePrompt(sessionId, 'queued then cleared');
    registry.clearQueue(sessionId);

    registry.selectSession(sessionId);
    const updatedDetail = registry.getSelectedSessionSnapshot();
    assert.equal(updatedDetail?.settings.notificationSoundEnabled, false);
    assert.equal(updatedDetail?.settings.autoQueuePrompts, false);
    assert.equal(updatedDetail?.queuedCount, 0);
    assert.equal(updatedDetail?.chatMessages.some((message) => message.content === 'queued then cleared'), false);

    const restoredRegistry = new SessionRegistry();

    try {
      restoredRegistry.restoreSessions(registry.exportPersistedSessions());
      const restoredSnapshot = restoredRegistry.buildManagerSnapshot();
      restoredRegistry.selectSession(restoredSnapshot.sessions[0].sessionId);
      const restoredDetail = restoredRegistry.getSelectedSessionSnapshot();

      assert.equal(restoredDetail?.settings.notificationSoundEnabled, false);
      assert.equal(restoredDetail?.settings.autoQueuePrompts, false);
      assert.equal(restoredDetail?.queuedCount, 0);
    } finally {
      restoredRegistry.dispose();
    }
  });

  test('restores interrupted session summaries without restoring pending requests', async () => {
    const token = new vscode.CancellationTokenSource();

    void registry.handleToolInvocation({
      question: 'restore me later',
      requestKind: 'question',
      token: token.token
    });

    await waitFor(() => registry.buildManagerSnapshot().sessions.length === 1);

    const restoredRegistry = new SessionRegistry();

    try {
      const persisted = registry.exportPersistedSessions().map((record) => ({
        ...record,
        status: 'interrupted' as const
      }));

      restoredRegistry.restoreSessions(persisted);

      const restoredSnapshot = restoredRegistry.buildManagerSnapshot();
      assert.equal(restoredSnapshot.sessions.length, 1);
      assert.equal(restoredSnapshot.sessions[0].status, 'interrupted');

      restoredRegistry.selectSession(restoredSnapshot.sessions[0].sessionId);
      const restoredDetail = restoredRegistry.getSelectedSessionSnapshot();
      assert.equal(restoredDetail?.pendingRequest, null);
    } finally {
      restoredRegistry.dispose();
      token.cancel();
    }
  });

  test('pauses autopilot when the configured turn limit is reached', async () => {
    const token = new vscode.CancellationTokenSource();

    const initialRequest = registry.handleToolInvocation({
      question: 'autopilot session bootstrap',
      requestKind: 'question',
      token: token.token
    });

    await waitFor(() => registry.buildManagerSnapshot().sessions.length === 1);
    const sessionId = registry.buildManagerSnapshot().sessions[0].sessionId;

    registry.selectSession(sessionId);
    const firstDetail = registry.getSelectedSessionSnapshot();
    assert.ok(firstDetail?.pendingRequest);
    registry.respondToPendingRequest(sessionId, firstDetail.pendingRequest.requestId, 'bootstrap response');
    await initialRequest;

    registry.setAutopilotEnabled(sessionId, true);
    for (let index = 0; index < 21; index += 1) {
      registry.enqueuePrompt(sessionId, `queued ${index}`);
    }

    const passiveToken = new vscode.CancellationTokenSource();

    for (let index = 0; index < 20; index += 1) {
      const result = await registry.handleToolInvocation({
        sessionId,
        question: `autopilot turn ${index}`,
        requestKind: 'question',
        token: passiveToken.token
      });

      assert.equal(result.source, 'autopilot');
      assert.equal(result.response, `queued ${index}`);
    }

    const blockedByLimit = registry.handleToolInvocation({
      sessionId,
      question: 'autopilot should now pause',
      requestKind: 'question',
      token: passiveToken.token
    });

    await waitFor(() => {
      registry.selectSession(sessionId);
      return registry.getSelectedSessionSnapshot()?.pendingRequest !== null;
    });

    const finalDetail = registry.getSelectedSessionSnapshot();
    assert.ok(finalDetail?.pendingRequest);
    registry.respondToPendingRequest(sessionId, finalDetail.pendingRequest.requestId, 'manual override');

    const finalResult = await blockedByLimit;
    assert.equal(finalResult.source, 'user');
    assert.equal(finalResult.response, 'manual override');

    registry.selectSession(sessionId);
    const snapshotAfterPause = registry.getSelectedSessionSnapshot();
    assert.equal(snapshotAfterPause?.queuedCount, 1);
  });

  test('cancels only the affected pending session', async () => {
    const tokenA = new vscode.CancellationTokenSource();
    const tokenB = new vscode.CancellationTokenSource();

    const promiseA = registry.handleToolInvocation({
      question: 'cancel alpha',
      requestKind: 'question',
      token: tokenA.token
    });
    const promiseB = registry.handleToolInvocation({
      question: 'keep beta',
      requestKind: 'question',
      token: tokenB.token
    });

    await waitFor(() => registry.buildManagerSnapshot().sessions.length === 2);

    const snapshot = registry.buildManagerSnapshot();
    const cancelSession = snapshot.sessions.find((session) => session.title.includes('cancel alpha'));
    const keepSession = snapshot.sessions.find((session) => session.title.includes('keep beta'));

    assert.ok(cancelSession);
    assert.ok(keepSession);

    tokenA.cancel();
    await assert.rejects(promiseA, (error: unknown) => error instanceof vscode.CancellationError);

    registry.selectSession(keepSession.sessionId);
    const keepDetail = registry.getSelectedSessionSnapshot();
    assert.ok(keepDetail?.pendingRequest);
    registry.respondToPendingRequest(keepSession.sessionId, keepDetail.pendingRequest.requestId, 'beta survives');

    const resultB = await promiseB;
    assert.equal(resultB.response, 'beta survives');
  });

  test('marks a session interrupted when a handed-off follow up never returns', async () => {
    const stalledRegistry = new SessionRegistry();
    const token = new vscode.CancellationTokenSource();

    try {
      const request = stalledRegistry.handleToolInvocation({
        question: 'watch for interruption',
        requestKind: 'question',
        token: token.token
      });

      await waitFor(() => stalledRegistry.buildManagerSnapshot().sessions.length === 1);
      const sessionId = stalledRegistry.buildManagerSnapshot().sessions[0].sessionId;

      stalledRegistry.selectSession(sessionId);
      const detail = stalledRegistry.getSelectedSessionSnapshot();
      assert.ok(detail?.pendingRequest);
      stalledRegistry.respondToPendingRequest(sessionId, detail.pendingRequest.requestId, 'continue');
      await request;

      assert.equal(stalledRegistry.markSessionInterrupted(sessionId), true);
      assert.equal(stalledRegistry.getSessionSnapshot(sessionId)?.status, 'interrupted');
    } finally {
      stalledRegistry.dispose();
      token.cancel();
    }
  });
});