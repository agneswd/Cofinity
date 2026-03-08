import { escapeHtml, formatStatusLabel, formatTime } from './sessionManagerFormat';
import { renderMarkdown } from './sessionManagerMarkdown';
import type { SessionListItem } from './sessionManagerModels';

function renderPendingOptions(options?: string[]): string {
  if (!options || options.length === 0) {
    return '';
  }

  return `
    <div class="global-view-options">
      ${options.map((option) => `<span class="global-view-option-chip">${escapeHtml(option)}</span>`).join('')}
    </div>
  `;
}

export function renderGlobalPendingView(
  sessions: SessionListItem[],
  draftComposerBySession: ReadonlyMap<string, string>
): string {
  const pendingSessions = sessions.filter(
    (session): session is SessionListItem & { pendingRequest: NonNullable<SessionListItem['pendingRequest']> } => session.pendingRequest !== null
  );

  if (pendingSessions.length === 0) {
    return `
      <div class="global-view-shell global-view-empty empty-state">
        <div class="empty-state-brand">
          <span>No pending tool calls right now.</span>
        </div>
      </div>
    `;
  }

  const countLabel = `${pendingSessions.length} waiting`;
  return `
    <div class="global-view-shell">
      <header class="global-view-header">
        <div>
          <div class="global-view-eyebrow">Global view</div>
          <div class="global-view-title">Pending tool calls</div>
        </div>
        <div class="global-view-count-label">${escapeHtml(countLabel)}</div>
      </header>
      <div class="global-view-list">
        ${pendingSessions
          .map((session) => {
            const draftValue = draftComposerBySession.get(session.sessionId) ?? '';
            const pendingRequest = session.pendingRequest;

            return `
              <section class="global-view-card" data-global-session-id="${session.sessionId}">
                <div class="global-view-card-header">
                  <div class="global-view-card-heading">
                    <div class="status-dot is-pending"></div>
                    <button class="global-view-open-session" data-global-open-session-id="${session.sessionId}" title="Open ${escapeHtml(session.title)}">
                      ${escapeHtml(session.title)}
                    </button>
                  </div>
                  <div class="global-view-card-meta">${escapeHtml(formatTime(pendingRequest.createdAtMs))}</div>
                </div>
                <div class="global-view-prompt markdown-content">${renderMarkdown(pendingRequest.prompt)}</div>
                ${renderPendingOptions(pendingRequest.options)}
                <div class="composer-card global-view-response-card">
                  <div class="composer-row">
                    <textarea
                      class="composer-textarea global-view-response-input"
                      data-global-session-id="${session.sessionId}"
                      placeholder="Reply to agent"
                    >${escapeHtml(draftValue)}</textarea>
                  </div>
                  <div class="composer-footer-row global-view-response-footer">
                    <div class="global-view-response-meta">${escapeHtml(formatStatusLabel(pendingRequest.kind))}${session.queuedCount > 0 ? ` · ${session.queuedCount} queued` : ''}</div>
                    <button class="composer-footer-button composer-send-button" data-global-send-session-id="${session.sessionId}" title="Send response" aria-label="Send response">
                      <i data-lucide="send" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              </section>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}