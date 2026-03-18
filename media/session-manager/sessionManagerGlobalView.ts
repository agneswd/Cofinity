import { escapeHtml, formatStatusLabel, formatTime } from './sessionManagerFormat';
import { renderMarkdown } from './sessionManagerMarkdown';
import { renderPendingOptions } from './sessionManagerTemplate';
import { renderSettingsModal } from './sessionManagerSettingsModal';
import type { GlobalSettings, SessionListItem } from './sessionManagerModels';

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

export function renderGlobalPendingView(
  sessions: SessionListItem[],
  draftComposerBySession: ReadonlyMap<string, string>,
  inlineErrorMessage: string | null = null,
  settingsOpen = false,
  globalSettings?: GlobalSettings
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
      ${globalSettings ? renderSettingsModal(settingsOpen, globalSettings, null) : ''}
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
      ${renderInlineError(inlineErrorMessage)}
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
                ${renderPendingOptions(pendingRequest.options, session.sessionId)}
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
    ${globalSettings ? renderSettingsModal(settingsOpen, globalSettings, null) : ''}
  `;
}