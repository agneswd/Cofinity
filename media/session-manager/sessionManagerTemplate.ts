import { escapeHtml, formatDuration, formatStatusLabel, formatTime, messageStateLabel } from './sessionManagerFormat';
import { renderMarkdown } from './sessionManagerMarkdown';
import type { AttachmentInfo, GlobalSettings, SessionChatMessage, SessionListItem, SessionSnapshot } from './sessionManagerModels';
import { renderSettingsModal } from './sessionManagerSettingsModal';

function renderChatMessages(messages: SessionChatMessage[]): string {
  if (messages.length === 0) {
    return '<div class="empty-state">No messages yet.</div>';
  }

  return messages
    .map((message, index) => {
      const stateLabel = messageStateLabel(message);

      // For assistant messages, compute how long the agent took since the last user/system message
      let durationLabel = '';
      if (message.role === 'assistant') {
        for (let i = index - 1; i >= 0; i--) {
          const prev = messages[i];
          if (prev.role === 'user' || prev.role === 'system') {
            const elapsed = message.createdAtMs - prev.createdAtMs;
            if (elapsed > 500) {
              durationLabel = formatDuration(elapsed);
            }
            break;
          }
        }
      }

      return `
        <article class="chat-message role-${message.role}">
          <div class="chat-message-body markdown-content">${renderMarkdown(message.content)}</div>
          ${renderAttachmentChips(message.attachments)}
          <div class="chat-message-meta">
            <span>${formatTime(message.createdAtMs)}</span>
            <span>${escapeHtml(stateLabel)}</span>
            ${durationLabel ? `<span class="chat-message-duration" title="Agent response time">${escapeHtml(durationLabel)}</span>` : ''}
          </div>
        </article>
      `;
    })
    .join('');
}

function renderAttachmentChips(attachments?: AttachmentInfo[], removable = false): string {
  if (!attachments || attachments.length === 0) {
    return '';
  }

  return `
    <div class="attachment-chips">
      ${attachments
        .map(
          (attachment) => {
            const icon = attachment.mimeType.startsWith('image/') ? 'image' : 'file';
            return `
            <div class="attachment-chip" title="${escapeHtml(attachment.name)}">
              <span class="attachment-chip-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span>
              <span class="attachment-chip-text">${escapeHtml(attachment.name)}</span>
              ${
                removable
                  ? `<button class="attachment-chip-remove" data-attachment-id="${attachment.id}" data-attachment-uri="${escapeHtml(attachment.uri)}" data-attachment-temporary="${attachment.isTemporary ? 'true' : 'false'}" aria-label="Remove attachment">&times;</button>`
                  : ''
              }
            </div>
          `;
          }
        )
        .join('')}
    </div>
  `;
}

function renderQueuedPrompts(session: SessionSnapshot): string {
  if (session.queuedPrompts.length === 0) {
    return '';
  }

  const count = session.queuedPrompts.length;
  return `
    <section class="queue-stack">
      <div class="queue-stack-header">
        <button id="queue-collapse-toggle" class="queue-collapse-toggle" aria-label="Toggle queue" title="Collapse / expand">
          <span class="queue-stack-label">Queued prompts</span>
          <span class="queue-count-badge">${count}</span>
          <span class="queue-collapse-chevron">&#9650;</span>
        </button>
        <button id="clear-queue-button" class="queue-clear-button" title="Clear all queued prompts" aria-label="Clear queue">&times; Clear</button>
      </div>
      <div class="queue-stack-list">
        ${session.queuedPrompts
          .map((item) => {
            return `
              <div class="queue-stack-item" data-item-id="${item.itemId}" draggable="true">
                <div class="queue-stack-item-body">
                  <div class="queue-stack-item-text">${escapeHtml(item.content)}</div>
                  ${item.attachments?.length ? `<div class="queue-item-attachment-badge" title="${item.attachments.length} attachment${item.attachments.length === 1 ? '' : 's'}">${item.attachments.length} attachment${item.attachments.length === 1 ? '' : 's'}</div>` : ''}
                  <textarea class="queue-inline-editor is-hidden" data-item-id="${item.itemId}" rows="2">${escapeHtml(item.content)}</textarea>
                </div>
                <div class="queue-stack-item-actions">
                  <button class="queue-edit-button" data-item-id="${item.itemId}" title="Edit queued prompt">Edit</button>
                  <button class="queue-delete-button" data-item-id="${item.itemId}" title="Delete queued prompt" aria-label="Delete queued prompt">
                    <i data-lucide="trash-2" aria-hidden="true"></i>
                  </button>
                  <button class="queue-save-button is-hidden" data-item-id="${item.itemId}" title="Save queued prompt">Save</button>
                  <button class="queue-cancel-button is-hidden" data-item-id="${item.itemId}" title="Cancel editing queued prompt">Cancel</button>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderWorkingIndicator(session: SessionSnapshot, showProcessingResponse: boolean): string {
  if (showProcessingResponse) {
    return '<div class="working-indicator">Working...</div>';
  }

  if (session.pendingRequest) {
    return '';
  }

  if (session.status !== 'running') {
    return '';
  }

  return '<div class="working-indicator">Working...</div>';
}

function renderInlineError(message: string | null): string {
  if (!message) {
    return '';
  }

  return `
    <div class="inline-error" role="alert">
      <span class="inline-error-text">${escapeHtml(message)}</span>
      <button id="inline-error-dismiss" class="inline-error-dismiss" aria-label="Dismiss error" title="Dismiss error">&times;</button>
    </div>
  `;
}

export function renderSessionsList(sessions: SessionListItem[], selectedSessionId: string | null): string {
  if (sessions.length === 0) {
    return '<div class="empty-state">No active sessions.</div>';
  }

  return sessions
    .map((session) => {
      const dotClass = session.hasPendingRequest
        ? 'is-pending'
        : session.status === 'active'
          ? 'is-active'
          : session.status === 'interrupted'
            ? 'is-interrupted'
            : '';
      const attentionClass = session.hasPendingRequest ? 'is-pending-attention' : '';
      const initials = escapeHtml(session.title.slice(0, 3));
      const statusLabel = formatStatusLabel(session.status);
      return `
        <div class="session-card ${session.sessionId === selectedSessionId ? 'is-selected' : ''} ${attentionClass}" data-session-id="${session.sessionId}">
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
            <div class="session-card-meta">${escapeHtml(statusLabel)}${session.queuedCount > 0 ? ` · ${session.queuedCount} queued` : ''}</div>
          </button>
          <div class="session-card-actions">
            <button class="session-action-btn" data-action="rename" data-session-id="${session.sessionId}" title="Rename session">
              <i data-lucide="pencil" aria-hidden="true"></i>
            </button>
            <button class="session-action-btn" data-action="dispose" data-session-id="${session.sessionId}" title="Dispose session">
              <i data-lucide="trash-2" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderSessionDetail(
  session: SessionSnapshot,
  settingsOpen: boolean,
  globalSettings: GlobalSettings,
  draftAttachments: AttachmentInfo[],
  showProcessingResponse = false,
  inlineErrorMessage: string | null = null
): string {
  const statusLabel = formatStatusLabel(session.status);
  const hint = session.pendingRequest
    ? 'Agent is waiting for your reply'
    : session.queuedPrompts.length > 0
      ? `${session.queuedPrompts.length} prompt${session.queuedPrompts.length > 1 ? 's' : ''} queued`
      : null;

  const composerPlaceholder = session.pendingRequest
    ? 'Reply to agent'
    : globalSettings.autoQueuePrompts
      ? 'Will queue until agent asks for input'
      : 'Send a prompt';

  return `
    <div class="chat-shell">
      <header class="chat-header">
        <div class="chat-header-left">
          <span class="chat-title">${escapeHtml(session.title)}</span>
          <span class="status-chip">${escapeHtml(statusLabel)}</span>
          <span class="chat-header-stats">${session.stats.toolCalls} calls${session.queuedCount > 0 ? ` · ${session.queuedCount} queued` : ''}</span>
        </div>
      </header>

      ${renderSettingsModal(settingsOpen, globalSettings, {
        autopilotMode: session.autopilotMode,
        autopilotMaxTurns: session.autopilotMaxTurns
      })}

      <section class="chat-transcript">
        ${renderChatMessages(session.chatMessages)}
      </section>
      ${renderWorkingIndicator(session, showProcessingResponse)}
      ${renderQueuedPrompts(session)}
      ${renderInlineError(inlineErrorMessage)}
      <footer class="composer-shell">
        ${hint ? `<div class="composer-hint">${escapeHtml(hint)}</div>` : ''}
        <div class="composer-card">
          ${renderAttachmentChips(draftAttachments, true)}
          <div class="composer-row">
            <textarea id="composer-textarea" class="composer-textarea" placeholder="${escapeHtml(composerPlaceholder)}"></textarea>
          </div>
          <div class="composer-footer-row">
            <div class="composer-footer-left">
              <label class="autopilot-toggle">
                <input id="autopilot-bar-checkbox" type="checkbox" ${session.autopilotMode === 'drainQueue' ? 'checked' : ''} />
                <span class="autopilot-toggle-track"></span>
                <span class="autopilot-toggle-thumb"></span>
              </label>
              <span class="autopilot-bar-label">Autopilot</span>
            </div>
            <div class="composer-footer-actions">
              <input id="composer-image-input" class="is-hidden" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" multiple />
              <button id="attach-file-button" class="composer-footer-button" title="Attach workspace file" aria-label="Attach workspace file"><i data-lucide="file" aria-hidden="true"></i></button>
              <button id="attach-image-button" class="composer-footer-button" title="Attach image" aria-label="Attach image"><i data-lucide="image-plus" aria-hidden="true"></i></button>
              <button id="send-button" class="composer-footer-button composer-send-button" title="Send" aria-label="Send">
                <i data-lucide="send" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
      </footer>
    </div>
  `;
}
