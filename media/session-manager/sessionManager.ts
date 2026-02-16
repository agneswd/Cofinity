declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type SessionsSnapshotPayload = {
  selectedSessionId: string | null;
  sessions: Array<{
    sessionId: string;
    title: string;
    status: string;
    queuedCount: number;
    hasPendingRequest: boolean;
    lastActiveAtMs: number;
  }>;
};

type SessionSnapshotPayload = {
  session: {
    sessionId: string;
    title: string;
    status: string;
    queuedCount: number;
    queuedPrompts: Array<{
      itemId: string;
      content: string;
      source: 'user' | 'system';
    }>;
    pendingRequest: null | {
      requestId: string;
      prompt: string;
      kind: string;
      options?: string[];
      createdAtMs: number;
    };
    autopilotMode: 'off' | 'drainQueue';
    lastActiveAtMs: number;
  } | null;
};

type ExtensionMessage =
  | { type: 'sessionsSnapshot'; payload: SessionsSnapshotPayload }
  | { type: 'sessionSnapshot'; payload: SessionSnapshotPayload }
  | { type: 'error'; payload: { message: string } };

const vscode = acquireVsCodeApi();
const sessionsListElement = document.getElementById('sessions-list');
const sessionDetailElement = document.getElementById('session-detail');

let selectedSessionId: string | null = null;
let currentSession: SessionSnapshotPayload['session'] = null;

function renderSessions(payload: SessionsSnapshotPayload): void {
  if (!sessionsListElement) {
    return;
  }

  selectedSessionId = payload.selectedSessionId;

  if (payload.sessions.length === 0) {
    sessionsListElement.className = 'session-list empty-state';
    sessionsListElement.textContent = 'No active sessions yet.';
    return;
  }

  sessionsListElement.className = 'session-list';
  sessionsListElement.innerHTML = payload.sessions
    .map((session) => {
      return `
        <div class="session-card" data-session-id="${session.sessionId}">
          <div class="session-card ${session.sessionId === selectedSessionId ? 'is-selected' : ''}" data-session-id="${session.sessionId}">
            <div class="session-card-title">${session.title}</div>
            <div class="session-card-meta">
              ${session.status} · queued ${session.queuedCount} · pending ${String(session.hasPendingRequest)}
            </div>
          </div>
      `;
    })
    .join('');

  sessionsListElement.querySelectorAll<HTMLElement>('.session-card').forEach((element) => {
    element.addEventListener('click', () => {
      const sessionId = element.dataset.sessionId ?? null;
      vscode.postMessage({
        protocolVersion: 1,
        type: 'selectSession',
        payload: { sessionId }
      });
    });
  });
}

function renderSession(payload: SessionSnapshotPayload): void {
  if (!sessionDetailElement) {
    return;
  }

  currentSession = payload.session;

  if (!payload.session) {
    sessionDetailElement.className = 'session-detail empty-state';
    sessionDetailElement.textContent = 'Select a session once the runtime starts emitting snapshots.';
    return;
  }

  sessionDetailElement.className = 'session-detail';
  sessionDetailElement.innerHTML = `
    <div class="detail-block">
      <div class="detail-label">Title</div>
      <div>${payload.session.title}</div>
    </div>
    <div class="detail-block">
      <div class="detail-label">Status</div>
      <div>${payload.session.status}</div>
    </div>
    <div class="detail-block">
      <div class="detail-label">Pending Request</div>
      <div>${payload.session.pendingRequest?.prompt ?? 'No pending request.'}</div>
    </div>
    <div class="detail-block">
      <div class="detail-label">Respond</div>
      <div class="detail-form">
        <textarea id="response-textarea" class="detail-textarea" placeholder="Type a response for the pending request" ${payload.session.pendingRequest ? '' : 'disabled'}></textarea>
        <div class="detail-actions">
          <button id="submit-response-button" class="detail-button" ${payload.session.pendingRequest ? '' : 'disabled'}>Submit Response</button>
        </div>
      </div>
    </div>
    <div class="detail-block">
      <div class="detail-label">Queue</div>
      <div class="detail-form">
        <textarea id="queue-textarea" class="detail-textarea" placeholder="Queue the next prompt for this session"></textarea>
        <div class="detail-actions">
          <button id="enqueue-button" class="detail-button">Queue Prompt</button>
          <button id="clear-queue-button" class="detail-button secondary">Clear Queue</button>
        </div>
      </div>
      <div class="queue-list">
        ${payload.session.queuedPrompts.length > 0
          ? payload.session.queuedPrompts
              .map((item) => `<div class="queue-item">${item.content}</div>`)
              .join('')
          : '<div class="empty-state">No queued prompts for this session.</div>'}
      </div>
    </div>
    <div class="detail-block">
      <div class="detail-label">Autopilot</div>
      <label class="toggle-row">
        <input id="autopilot-checkbox" type="checkbox" ${payload.session.autopilotMode === 'drainQueue' ? 'checked' : ''} />
        <span>Drain queue on the next tool call</span>
      </label>
    </div>
    <div class="detail-block">
      <div class="detail-label">Session Actions</div>
      <div class="detail-actions">
        <button id="dispose-session-button" class="detail-button secondary">Dispose Session</button>
      </div>
    </div>
  `;

  bindDetailActions(payload.session);
}

function bindDetailActions(session: NonNullable<SessionSnapshotPayload['session']>): void {
  const responseTextarea = document.getElementById('response-textarea') as HTMLTextAreaElement | null;
  const submitResponseButton = document.getElementById('submit-response-button') as HTMLButtonElement | null;
  const queueTextarea = document.getElementById('queue-textarea') as HTMLTextAreaElement | null;
  const enqueueButton = document.getElementById('enqueue-button') as HTMLButtonElement | null;
  const clearQueueButton = document.getElementById('clear-queue-button') as HTMLButtonElement | null;
  const autopilotCheckbox = document.getElementById('autopilot-checkbox') as HTMLInputElement | null;
  const disposeSessionButton = document.getElementById('dispose-session-button') as HTMLButtonElement | null;

  submitResponseButton?.addEventListener('click', () => {
    if (!session.pendingRequest || !responseTextarea) {
      return;
    }

    vscode.postMessage({
      protocolVersion: 1,
      type: 'respondToRequest',
      sessionId: session.sessionId,
      payload: {
        requestId: session.pendingRequest.requestId,
        response: responseTextarea.value
      }
    });

    responseTextarea.value = '';
  });

  enqueueButton?.addEventListener('click', () => {
    if (!queueTextarea || queueTextarea.value.trim().length === 0) {
      return;
    }

    vscode.postMessage({
      protocolVersion: 1,
      type: 'enqueuePrompt',
      sessionId: session.sessionId,
      payload: {
        content: queueTextarea.value
      }
    });

    queueTextarea.value = '';
  });

  clearQueueButton?.addEventListener('click', () => {
    vscode.postMessage({
      protocolVersion: 1,
      type: 'clearQueue',
      sessionId: session.sessionId,
      payload: {}
    });
  });

  autopilotCheckbox?.addEventListener('change', () => {
    vscode.postMessage({
      protocolVersion: 1,
      type: 'toggleAutopilot',
      sessionId: session.sessionId,
      payload: {
        enabled: autopilotCheckbox.checked
      }
    });
  });

  disposeSessionButton?.addEventListener('click', () => {
    vscode.postMessage({
      protocolVersion: 1,
      type: 'disposeSession',
      sessionId: session.sessionId,
      payload: {}
    });
  });
}

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'sessionsSnapshot':
      renderSessions(message.payload);
      break;
    case 'sessionSnapshot':
      renderSession(message.payload);
      break;
    case 'error':
      console.error('[Cofinity]', message.payload.message);
      if (sessionDetailElement && currentSession) {
        const errorBlock = document.createElement('div');
        errorBlock.className = 'detail-block';
        errorBlock.innerHTML = `<div class="detail-label">Error</div><div>${message.payload.message}</div>`;
        sessionDetailElement.prepend(errorBlock);
      }
      break;
    default:
      break;
  }
});

vscode.postMessage({
  protocolVersion: 1,
  type: 'uiReady',
  payload: {}
});