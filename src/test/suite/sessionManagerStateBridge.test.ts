import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { GlobalSettings } from '../../features/global-settings/globalSettings';
import { SessionManagerStateBridge } from '../../features/session-manager-view/sessionManagerStateBridge';
import type { SessionManagerSnapshot, SessionSnapshot } from '../../features/session-runtime/sessionSnapshot';
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

suite('SessionManagerStateBridge', () => {
  test('keeps the sidebar selection in sync with the auto-revealed chat session', async () => {
    const registry = new SessionRegistry();
    const settings: GlobalSettings = {
      notificationSoundEnabled: false,
      autoOpenView: 'session',
      autoQueuePrompts: true,
      enterSends: false,
      autopilotPrompts: ['Continue'],
      autopilotDelayMinMs: 2000,
      autopilotDelayMaxMs: 5000
    };

    let lastSessionsSnapshot: SessionManagerSnapshot | null = null;
    let lastSessionSnapshot: SessionSnapshot | null = null;

    const provider = {
      postSessionsSnapshot(snapshot: SessionManagerSnapshot) {
        lastSessionsSnapshot = snapshot;
      },
      postSessionSnapshot(session: SessionSnapshot | null) {
        lastSessionSnapshot = session;
      },
      reveal() {
        return;
      }
    };

    const settingsManager = {
      get() {
        return settings;
      }
    };

    const bridge = new SessionManagerStateBridge(
      registry,
      provider as never,
      settingsManager as never
    );

    const tokenOne = new vscode.CancellationTokenSource();
    const tokenTwo = new vscode.CancellationTokenSource();
    const tokenThree = new vscode.CancellationTokenSource();

    try {
      const sessionOneRequest = registry.handleToolInvocation({
        question: 'session one',
        requestKind: 'question',
        token: tokenOne.token
      });

      await waitFor(() => registry.buildManagerSnapshot().sessions.length === 1);
      const sessionOneId = registry.buildManagerSnapshot().sessions[0].sessionId;
      const sessionOneDetail = registry.getSessionSnapshot(sessionOneId);
      assert.ok(sessionOneDetail?.pendingRequest);
      registry.respondToPendingRequest(sessionOneId, sessionOneDetail.pendingRequest.requestId, 'done one');
      await sessionOneRequest;

      const sessionTwoRequest = registry.handleToolInvocation({
        question: 'session two',
        requestKind: 'question',
        token: tokenTwo.token
      });

      await waitFor(() => registry.buildManagerSnapshot().sessions.length === 2);
      const sessionTwoId = registry.buildManagerSnapshot().sessions.find((session) => session.sessionId !== sessionOneId)?.sessionId;
      assert.ok(sessionTwoId);
      const sessionTwoDetail = registry.getSessionSnapshot(sessionTwoId);
      assert.ok(sessionTwoDetail?.pendingRequest);
      registry.respondToPendingRequest(sessionTwoId, sessionTwoDetail.pendingRequest.requestId, 'done two');
      await sessionTwoRequest;

      void registry.handleToolInvocation({
        sessionId: sessionOneId,
        question: 'session one again',
        requestKind: 'question',
        token: tokenThree.token
      });

      await waitFor(() => registry.getSessionSnapshot(sessionOneId)?.pendingRequest !== null);
      bridge.sync();

      if (!lastSessionsSnapshot || !lastSessionSnapshot) {
        throw new Error('Expected the state bridge to publish both snapshots.');
      }

      const sessionsSnapshot: SessionManagerSnapshot = lastSessionsSnapshot;
      const sessionSnapshot: SessionSnapshot = lastSessionSnapshot;

      assert.equal(sessionsSnapshot.selectedSessionId, sessionOneId);
      assert.equal(sessionSnapshot.sessionId, sessionOneId);
    } finally {
      bridge.dispose();
      registry.dispose();
      tokenOne.cancel();
      tokenTwo.cancel();
      tokenThree.cancel();
    }
  });
});