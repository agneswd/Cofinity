import assert from 'node:assert/strict';
import { renderGlobalPendingView } from '../../../media/session-manager/sessionManagerGlobalView';
import type { SessionListItem } from '../../../media/session-manager/sessionManagerModels';

function createPendingSession(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    sessionId: 'session_1',
    title: 'Alpha session',
    status: 'waitingForUser',
    queuedCount: 0,
    hasPendingRequest: true,
    pendingRequest: {
      requestId: 'request_1',
      prompt: 'Need your approval',
      kind: 'approval',
      createdAtMs: Date.now()
    },
    toolCalls: 3,
    lastActiveAtMs: Date.now(),
    ...overrides
  };
}

suite('sessionManagerGlobalView', () => {
  test('renders all pending sessions in the global view', () => {
    const html = renderGlobalPendingView(
      [
        createPendingSession(),
        createPendingSession({
          sessionId: 'session_2',
          title: 'Beta session',
          pendingRequest: {
            requestId: 'request_2',
            prompt: 'Choose one option',
            kind: 'pick',
            options: ['Yes', 'No'],
            createdAtMs: Date.now()
          }
        })
      ],
      new Map([['session_2', 'draft response']])
    );

    assert.match(html, /Pending tool calls/);
    assert.match(html, /Alpha session/);
    assert.match(html, /Beta session/);
    assert.match(html, /Need your approval/);
    assert.match(html, /draft response/);
    assert.match(html, /Yes/);
  });

  test('renders an empty state when nothing is waiting', () => {
    const html = renderGlobalPendingView([], new Map());

    assert.match(html, /No pending tool calls right now/);
  });

  test('renders one dismissible inline error banner', () => {
    const html = renderGlobalPendingView(
      [createPendingSession()],
      new Map(),
      'No workspace files available to attach.'
    );

    assert.match(html, /class="inline-error"/);
    assert.match(html, /inline-error-dismiss/);
  });
});