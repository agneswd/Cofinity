import assert from 'node:assert/strict';
import { renderSessionDetail } from '../../../media/session-manager/sessionManagerTemplate';
import type { GlobalSettings, SessionSnapshot } from '../../../media/session-manager/sessionManagerModels';

function createGlobalSettings(): GlobalSettings {
  return {
    notificationSoundEnabled: true,
    autoOpenView: 'session',
    autoQueuePrompts: true,
    enterSends: true,
    autopilotPrompts: [],
    autopilotDelayMinMs: 2000,
    autopilotDelayMaxMs: 5000
  };
}

function createSessionSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    sessionId: 'session_1',
    title: 'Test session',
    status: 'active',
    queuedCount: 0,
    queuedPrompts: [],
    chatMessages: [],
    awaitingAgentResponse: false,
    pendingRequest: null,
    autopilotMode: 'off',
    autopilotTurnsUsed: 0,
    autopilotMaxTurns: 20,
    history: [],
    stats: {
      toolCalls: 1,
      userResponses: 0,
      cancellations: 0
    },
    lastActiveAtMs: Date.now(),
    ...overrides
  };
}

suite('sessionManagerTemplate', () => {
  test('renders a working indicator while the session is running', () => {
    const html = renderSessionDetail(
      createSessionSnapshot({ status: 'running' }),
      false,
      createGlobalSettings(),
      []
    );

    assert.match(html, /class="working-indicator"/);
    assert.match(html, /Working\.\.\./);
  });

  test('renders a processing indicator after the user has replied', () => {
    const html = renderSessionDetail(
      createSessionSnapshot({
        status: 'waitingForUser',
        awaitingAgentResponse: true,
        pendingRequest: {
          requestId: 'request_1',
          prompt: 'Need input',
          kind: 'question',
          createdAtMs: Date.now()
        }
      }),
      false,
      createGlobalSettings(),
      [],
      true
    );

    assert.match(html, /class="working-indicator"/);
    assert.match(html, /Working\.\.\./);
  });

  test('renders a working indicator while waiting on the agent response after submit', () => {
    const html = renderSessionDetail(
      createSessionSnapshot({
        status: 'active',
        awaitingAgentResponse: true
      }),
      false,
      createGlobalSettings(),
      []
    );

    assert.match(html, /class="working-indicator"/);
    assert.match(html, /Working\.\.\./);
  });

  test('does not render a working indicator when the session is waiting for input', () => {
    const html = renderSessionDetail(
      createSessionSnapshot({
        status: 'waitingForUser',
        pendingRequest: {
          requestId: 'request_1',
          prompt: 'Need input',
          kind: 'question',
          createdAtMs: Date.now()
        }
      }),
      false,
      createGlobalSettings(),
      []
    );

    assert.doesNotMatch(html, /class="working-indicator"/);
  });

  test('renders a dismissible inline error above the composer', () => {
    const html = renderSessionDetail(
      createSessionSnapshot(),
      false,
      createGlobalSettings(),
      [],
      false,
      'No workspace files available to attach.'
    );

    assert.match(html, /class="inline-error"/);
    assert.match(html, /inline-error-dismiss/);
    assert.match(html, /No workspace files available to attach\./);
  });

  test('renders clickable pending options in the session view', () => {
    const html = renderSessionDetail(
      createSessionSnapshot({
        pendingRequest: {
          requestId: 'request_1',
          prompt: 'Pick one',
          kind: 'pick',
          options: ['Yes', 'No'],
          createdAtMs: Date.now()
        }
      }),
      false,
      createGlobalSettings(),
      []
    );

    assert.match(html, /pending-option-button/);
    assert.match(html, /data-pending-option-value="Yes"/);
    assert.match(html, /data-pending-option-value="No"/);
  });
});