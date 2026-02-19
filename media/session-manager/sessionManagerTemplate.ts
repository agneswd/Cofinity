import { escapeHtml, formatTime, messageStateLabel } from './sessionManagerFormat';
import type { SessionChatMessage, SessionListItem, SessionSnapshot } from './sessionManagerModels';

function settingsIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.3 2.76a1 1 0 0 1 1.4 0l.98.99a7.9 7.9 0 0 1 1.89.79l1.36-.3a1 1 0 0 1 1.16.67l.56 1.67a7.6 7.6 0 0 1 1.45 1.44l1.67.56a1 1 0 0 1 .67 1.17l-.3 1.35c.33.6.6 1.23.79 1.89l.99.98a1 1 0 0 1 0 1.41l-.99.98a7.9 7.9 0 0 1-.79 1.89l.3 1.36a1 1 0 0 1-.67 1.16l-1.67.56a7.6 7.6 0 0 1-1.44 1.45l-.56 1.67a1 1 0 0 1-1.17.67l-1.35-.3a7.9 7.9 0 0 1-1.89.79l-.98.99a1 1 0 0 1-1.41 0l-.98-.99a7.9 7.9 0 0 1-1.89-.79l-1.36.3a1 1 0 0 1-1.16-.67l-.56-1.67A7.6 7.6 0 0 1 4.4 18.6l-1.67-.56a1 1 0 0 1-.67-1.17l.3-1.35a7.9 7.9 0 0 1-.79-1.89l-.99-.98a1 1 0 0 1 0-1.41l.99-.98c.18-.66.45-1.29.79-1.89l-.3-1.36a1 1 0 0 1 .67-1.16l1.67-.56A7.6 7.6 0 0 1 5.84 5.3l.56-1.67a1 1 0 0 1 1.17-.67l1.35.3c.6-.33 1.23-.6 1.89-.79l.98-.99ZM12 8.75A3.25 3.25 0 1 0 12 15.25A3.25 3.25 0 1 0 12 8.75Z" fill="currentColor"/>
    </svg>
  `;
}

function renderChatMessages(messages: SessionChatMessage[]): string {
  if (messages.length === 0) {
    return '<div class="empty-state">No messages in this session yet.</div>';
  }

  return messages
    .map((message) => {
      return `
        <article class="chat-message role-${message.role}">
          <div class="chat-message-body">
            ${escapeHtml(message.content)}
          </div>
          <div class="chat-message-meta">
            <span>${escapeHtml(message.role)}</span>
            <span>${escapeHtml(messageStateLabel(message))}</span>
            <span>${formatTime(message.createdAtMs)}</span>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderQueuedPrompts(session: SessionSnapshot): string {
  if (session.queuedPrompts.length === 0) {
    return '';
  }

  return `
    <section class="queue-stack">
      <div class="queue-stack-label">Queued prompts</div>
      <div class="queue-stack-list">
        ${session.queuedPrompts
          .map((item) => {
            return `
              <div class="queue-stack-item">
                <div class="queue-stack-item-text">${escapeHtml(item.content)}</div>
              </div>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

export function renderSessionsList(sessions: SessionListItem[], selectedSessionId: string | null): string {
  if (sessions.length === 0) {
    return 'No active sessions yet.';
  }

  return sessions
    .map((session) => {
      return `
        <button class="session-card ${session.sessionId === selectedSessionId ? 'is-selected' : ''}" data-session-id="${session.sessionId}">
          <div class="session-card-topline">
            <div class="session-card-title">${escapeHtml(session.title)}</div>
            <div class="status-chip">${escapeHtml(session.status)}</div>
          </div>
          <div class="session-card-meta">
            queued ${session.queuedCount} · pending ${String(session.hasPendingRequest)}
          </div>
        </button>
      `;
    })
    .join('');
}

export function renderSessionDetail(session: SessionSnapshot, settingsOpen: boolean): string {
  const composerHint = session.pendingRequest
    ? 'Reply to the current agent request'
    : session.settings.autoQueuePrompts
      ? 'Send a prompt. It will queue until the agent asks for input.'
      : 'Send a prompt to this session';

  return `
    <div class="chat-shell">
      <header class="chat-header">
        <div>
          <div class="chat-title">${escapeHtml(session.title)}</div>
          <div class="chat-subtitle">
            <span class="status-chip">${escapeHtml(session.status)}</span>
            <span>tool calls ${session.stats.toolCalls}</span>
            <span>queued ${session.queuedCount}</span>
          </div>
        </div>
        <button id="settings-toggle" class="icon-button" aria-label="Open session settings">${settingsIcon()}</button>
      </header>
      <section class="settings-panel ${settingsOpen ? '' : 'is-hidden'}">
        <div class="settings-grid">
          <label class="setting-row">
            <span>Autopilot</span>
            <input id="autopilot-checkbox" type="checkbox" ${session.autopilotMode === 'drainQueue' ? 'checked' : ''} />
          </label>
          <label class="setting-row">
            <span>Autopilot turn limit</span>
            <input id="autopilot-max-turns" class="setting-input" type="number" min="1" max="100" value="${session.autopilotMaxTurns ?? 20}" />
          </label>
          <label class="setting-row">
            <span>Notification sound</span>
            <input id="sound-checkbox" type="checkbox" ${session.settings.notificationSoundEnabled ? 'checked' : ''} />
          </label>
          <label class="setting-row">
            <span>Auto queue prompts</span>
            <input id="auto-queue-checkbox" type="checkbox" ${session.settings.autoQueuePrompts ? 'checked' : ''} />
          </label>
        </div>
        <div class="settings-actions">
          <button id="clear-queue-button" class="secondary-button">Clear queue</button>
          <button id="dispose-session-button" class="secondary-button">Dispose session</button>
        </div>
      </section>
      <section class="chat-transcript">
        ${renderChatMessages(session.chatMessages)}
      </section>
      ${renderQueuedPrompts(session)}
      <footer class="composer-shell">
        <div class="composer-hint">${escapeHtml(composerHint)}</div>
        <div class="composer-row">
          <textarea id="composer-textarea" class="composer-textarea" placeholder="${escapeHtml(composerHint)}"></textarea>
          <button id="send-button" class="composer-button">Send</button>
        </div>
      </footer>
    </div>
  `;
}
