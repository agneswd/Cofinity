import { escapeHtml } from './sessionManagerFormat';
import type { GlobalSettings } from './sessionManagerModels';

interface SessionSettingsContext {
  autopilotMode: 'off' | 'drainQueue';
  autopilotMaxTurns?: number;
}

function renderAutopilotPrompts(prompts: string[]): string {
  return prompts.map((prompt, idx) => `
    <div class="autopilot-prompt-item" data-prompt-index="${idx}" draggable="true" title="Drag to reorder this autopilot prompt.">
      <div class="autopilot-prompt-number">${idx + 1}</div>
      <div class="autopilot-prompt-body">
        <div class="autopilot-prompt-text">${escapeHtml(prompt)}</div>
        <textarea class="autopilot-prompt-editor is-hidden" data-prompt-index="${idx}" rows="3">${escapeHtml(prompt)}</textarea>
      </div>
      <div class="autopilot-prompt-actions">
        <button class="autopilot-prompt-edit" data-prompt-index="${idx}" title="Edit this autopilot prompt">Edit</button>
        <button class="autopilot-prompt-delete" data-prompt-index="${idx}" aria-label="Remove prompt" title="Delete this autopilot prompt">&times;</button>
        <button class="autopilot-prompt-save is-hidden" data-prompt-index="${idx}" title="Save this autopilot prompt">Save</button>
        <button class="autopilot-prompt-cancel is-hidden" data-prompt-index="${idx}" title="Cancel editing this autopilot prompt">Cancel</button>
      </div>
    </div>
  `).join('');
}

export function renderSettingsModal(
  settingsOpen: boolean,
  globalSettings: GlobalSettings,
  sessionContext: SessionSettingsContext | null
): string {
  return `
    <div id="settings-modal-backdrop" class="settings-modal-backdrop ${settingsOpen ? '' : 'is-hidden'}">
      <div class="settings-modal" role="dialog" aria-label="Session settings">
        <div class="settings-modal-header">
          <span>Global settings</span>
          <button id="settings-modal-close" class="settings-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="settings-modal-body">
          ${sessionContext ? `
            <label class="setting-row" title="Automatically answers pending user questions using your autopilot prompts.">
              <span title="Automatically answers pending user questions using your autopilot prompts.">Autopilot auto-reply</span>
              <label class="setting-toggle">
                <input id="autopilot-checkbox" type="checkbox" ${sessionContext.autopilotMode === 'drainQueue' ? 'checked' : ''} />
                <span class="setting-toggle-track"></span>
                <span class="setting-toggle-thumb"></span>
              </label>
            </label>
            <label class="setting-row" title="Maximum number of autopilot replies before it stops itself.">
              <span title="Maximum number of autopilot replies before it stops itself.">Autopilot turn limit</span>
              <input id="autopilot-max-turns" class="setting-input" type="number" min="1" max="100" value="${sessionContext.autopilotMaxTurns ?? 20}" title="Maximum number of autopilot turns before it stops itself." />
            </label>
          ` : ''}
          <label class="setting-row" title="Play a notification sound when the agent needs your input.">
            <span title="Play a notification sound when the agent needs your input.">Notification sounds</span>
            <label class="setting-toggle">
              <input id="sound-checkbox" type="checkbox" ${globalSettings.notificationSoundEnabled ? 'checked' : ''} />
              <span class="setting-toggle-track"></span>
              <span class="setting-toggle-thumb"></span>
            </label>
          </label>
          <label class="setting-row" title="Queue composer messages when the agent is not currently waiting for input.">
            <span title="Queue composer messages when the agent is not currently waiting for input.">Queue messages when agent is busy</span>
            <label class="setting-toggle">
              <input id="auto-queue-checkbox" type="checkbox" ${globalSettings.autoQueuePrompts ? 'checked' : ''} />
              <span class="setting-toggle-track"></span>
              <span class="setting-toggle-thumb"></span>
            </label>
          </label>
          <label class="setting-row" title="Send with Enter. When off, use Ctrl/Cmd+Enter to send.">
            <span title="Send with Enter. When off, use Ctrl/Cmd+Enter to send.">Press Enter to send</span>
            <label class="setting-toggle">
              <input id="enter-sends-checkbox" type="checkbox" ${globalSettings.enterSends ? 'checked' : ''} />
              <span class="setting-toggle-track"></span>
              <span class="setting-toggle-thumb"></span>
            </label>
          </label>
          <label class="setting-row" title="Automatically open the selected target when a session starts waiting for you.">
            <span title="Automatically open the selected target when a session starts waiting for you.">Auto-open session panel</span>
            <label class="setting-toggle">
              <input id="auto-open-session-checkbox" type="checkbox" ${globalSettings.autoOpenView === 'session' ? 'checked' : ''} />
              <span class="setting-toggle-track"></span>
              <span class="setting-toggle-thumb"></span>
            </label>
          </label>
          <label class="setting-row" title="Automatically switch to the global pending view when a session starts waiting for you.">
            <span title="Automatically switch to the global pending view when a session starts waiting for you.">Auto-open global pending view</span>
            <label class="setting-toggle">
              <input id="auto-open-global-checkbox" type="checkbox" ${globalSettings.autoOpenView === 'global' ? 'checked' : ''} />
              <span class="setting-toggle-track"></span>
              <span class="setting-toggle-thumb"></span>
            </label>
          </label>
          <div class="settings-section-heading">
            <div class="settings-section-label" title="Autopilot sends these prompts in order and loops back to the first prompt after the last one.">Autopilot reply prompts</div>
            <button id="autopilot-prompt-add" class="settings-section-add" title="Add a new autopilot prompt" aria-label="Add a new autopilot prompt"><i data-lucide="plus" aria-hidden="true"></i></button>
          </div>
          <div id="autopilot-prompts-list" class="autopilot-prompts-list">
            ${renderAutopilotPrompts(globalSettings.autopilotPrompts)}
          </div>
          <div class="settings-section-label" style="margin-top:8px" title="Random delay window before autopilot sends a reply.">Autopilot reply delay</div>
          <div class="setting-row" title="Shortest delay before autopilot sends its next response.">
            <span title="Shortest delay before autopilot sends its next response.">Minimum delay (ms)</span>
            <input id="autopilot-delay-min" class="setting-input" type="number" min="500" max="30000" step="100" value="${globalSettings.autopilotDelayMinMs}" title="Shortest delay before autopilot sends its next response." />
          </div>
          <div class="setting-row" title="Longest delay before autopilot sends its next response.">
            <span title="Longest delay before autopilot sends its next response.">Maximum delay (ms)</span>
            <input id="autopilot-delay-max" class="setting-input" type="number" min="500" max="30000" step="100" value="${globalSettings.autopilotDelayMaxMs}" title="Longest delay before autopilot sends its next response." />
          </div>
        </div>
      </div>
      <div id="autopilot-prompt-modal-backdrop" class="settings-modal-backdrop autopilot-prompt-modal-backdrop is-hidden">
        <div class="settings-modal autopilot-prompt-modal" role="dialog" aria-label="Add autopilot prompt">
          <div class="settings-modal-header">
            <span>Add autopilot prompt</span>
            <button id="autopilot-prompt-modal-close" class="settings-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="settings-modal-body">
            <textarea id="autopilot-prompt-new" class="autopilot-prompt-textarea" rows="4" placeholder="New autopilot prompt…" title="Type the autopilot prompt you want to add."></textarea>
          </div>
          <div class="autopilot-prompt-modal-actions">
            <button id="autopilot-prompt-cancel" class="secondary-button" title="Close without adding a prompt">Cancel</button>
            <button id="autopilot-prompt-save" class="secondary-button" title="Add this autopilot prompt">Add</button>
          </div>
        </div>
      </div>
    </div>
  `;
}