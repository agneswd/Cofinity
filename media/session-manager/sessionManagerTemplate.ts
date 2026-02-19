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
    return '<div class="empty-state">No messages yet.</div>';
  }

  return messages
    .map((message) => {
      const stateLabel = messageStateLabel(message);
      return `
        <article class="chat-message role-${message.role}">
          <div class="chat-message-body">${escapeHtml(message.content)}</div>
          <div class="chat-message-meta">
            <span>${escapeHtml(stateLabel)}</span>
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
    return '<div class="empty-state">No active sessions.</div>';
  }

  return sessions
    .map((session) => {
      const dotClass = session.hasPendingRequest ? 'is-pending' : session.status === 'active' ? 'is-active' : '';
      const initials = escapeHtml(session.title.slice(0, 3));
      return `
        <div class="session-card ${session.sessionId === selectedSessionId ? 'is-selected' : ''}" data-session-id="${session.sessionId}">
          <!-- mini view (shown when sidebar is collapsed) -->
          <button class="session-card-mini session-card-select" data-session-id="${session.sessionId}" title="${escapeHtml(session.title)}">
            <div class="status-dot ${dotClass}"></div>
            <span class="session-card-mini-label">${initials}</span>
          </button>
          <!-- full view -->
          <button class="session-card-select" data-session-id="${session.sessionId}">
            <div class="session-card-topline">
              <div class="status-dot ${dotClass}"></div>
              <div class="session-card-title">${escapeHtml(session.title)}</div>
            </div>
            <div class="session-card-meta">${escapeHtml(session.status)}${session.queuedCount > 0 ? ` · ${session.queuedCount} queued` : ''}</div>
          </button>
          <div class="session-card-actions">
            <button class="session-action-btn" data-action="rename" data-session-id="${session.sessionId}" title="Rename session">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.23 1a1.1 1.1 0 0 1 .78.33l.66.66a1.1 1.1 0 0 1 0 1.56L5.5 12.73 2 14l1.27-3.5L12.45 1.33A1.1 1.1 0 0 1 13.23 1ZM3.5 11.5l-.5 1.5 1.5-.5 8.5-8.5-1-1L3.5 11.5Z"/></svg>
            </button>
            <button class="session-action-btn" data-action="dispose" data-session-id="${session.sessionId}" title="Dispose session">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7 3h2v1H7V3ZM3 5h10v1h-1v7H4V6H3V5Zm2 1v6h6V6H5Z"/></svg>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderSessionDetail(session: SessionSnapshot, settingsOpen: boolean): string {
  const hint = session.pendingRequest
    ? 'Agent is waiting for your reply'
    : session.queuedPrompts.length > 0
      ? `${session.queuedPrompts.length} prompt${session.queuedPrompts.length > 1 ? 's' : ''} queued`
      : null;

  const composerPlaceholder = session.pendingRequest
    ? 'Reply to agent'
    : session.settings.autoQueuePrompts
      ? 'Will queue until agent asks for input'
      : 'Send a prompt';

  return `
    <div class="chat-shell">
      <header class="chat-header">
        <div class="chat-header-left">
          <span class="chat-title">${escapeHtml(session.title)}</span>
          <span class="status-chip">${escapeHtml(session.status)}</span>
          <span class="chat-header-stats">${session.stats.toolCalls} calls${session.queuedCount > 0 ? ` · ${session.queuedCount} queued` : ''}</span>
        </div>
      </header>

      <!-- Settings modal (opened by native VS Code gear button) -->
      <div id="settings-modal-backdrop" class="settings-modal-backdrop ${settingsOpen ? '' : 'is-hidden'}">
        <div class="settings-modal" role="dialog" aria-label="Session settings">
          <div class="settings-modal-header">
            <span>Session settings</span>
            <button id="settings-modal-close" class="settings-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="settings-modal-body">
            <label class="setting-row">
              <span>Autopilot</span>
              <input id="autopilot-checkbox" type="checkbox" ${session.autopilotMode === 'drainQueue' ? 'checked' : ''} />
            </label>
            <label class="setting-row">
              <span>Turn limit</span>
              <input id="autopilot-max-turns" class="setting-input" type="number" min="1" max="100" value="${session.autopilotMaxTurns ?? 20}" />
            </label>
            <label class="setting-row">
              <span>Sound</span>
              <input id="sound-checkbox" type="checkbox" ${session.settings.notificationSoundEnabled ? 'checked' : ''} />
            </label>
            <label class="setting-row">
              <span>Auto-queue prompts</span>
              <input id="auto-queue-checkbox" type="checkbox" ${session.settings.autoQueuePrompts ? 'checked' : ''} />
            </label>
            <label class="setting-row">
              <span>Enter sends</span>
              <input id="enter-sends-checkbox" type="checkbox" ${session.settings.enterSends ? 'checked' : ''} />
            </label>
          </div>
          <div class="settings-modal-actions">
            <button id="clear-queue-button" class="secondary-button">Clear queue</button>
            <button id="dispose-session-button" class="secondary-button">Dispose</button>
          </div>
        </div>
      </div>

      <section class="chat-transcript">
        ${renderChatMessages(session.chatMessages)}
      </section>
      ${renderQueuedPrompts(session)}
      <footer class="composer-shell">
        ${hint ? `<div class="composer-hint">${escapeHtml(hint)}</div>` : ''}
        <div class="composer-row">
          <textarea id="composer-textarea" class="composer-textarea" placeholder="${escapeHtml(composerPlaceholder)}"></textarea>
          <button id="send-button" class="composer-button">Send</button>
        </div>
      </footer>
      <div class="autopilot-bar">
        <span class="autopilot-bar-label">Autopilot</span>
        <label class="autopilot-toggle">
          <input id="autopilot-bar-checkbox" type="checkbox" ${session.autopilotMode === 'drainQueue' ? 'checked' : ''} />
          <span class="autopilot-toggle-track"></span>
          <span class="autopilot-toggle-thumb"></span>
        </label>
      </div>
    </div>
  `;
}
