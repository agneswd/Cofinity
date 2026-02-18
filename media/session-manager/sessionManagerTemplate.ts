import { escapeHtml, formatTime, messageStateLabel } from './sessionManagerFormat';
import type { SessionChatMessage, SessionListItem, SessionSnapshot } from './sessionManagerModels';

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
        <button id="settings-toggle" class="icon-button" aria-label="Open session settings">⚙</button>
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
