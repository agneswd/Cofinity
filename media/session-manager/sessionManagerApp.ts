import type {
  ExtensionMessage,
  SessionListItem,
  SessionSnapshot
} from './sessionManagerModels';
import { playRequestSound, primeRequestSound } from './sessionManagerSound';
import { renderSessionDetail, renderSessionsList } from './sessionManagerTemplate';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type WebviewApi = ReturnType<typeof acquireVsCodeApi>;

export class SessionManagerApp {
  private readonly vscode: WebviewApi;
  private readonly sessionsListElement = document.getElementById('sessions-list');
  private readonly sessionDetailElement = document.getElementById('session-detail');
  private readonly sidebarToggleButton = document.getElementById('sidebar-toggle') as HTMLButtonElement | null;
  private readonly appShell = document.querySelector('.app-shell') as HTMLElement | null;

  private selectedSessionId: string | null = null;
  private sessions: SessionListItem[] = [];
  private session: SessionSnapshot | null = null;
  private settingsOpen = false;
  private sidebarCollapsed = false;
  private readonly toolCallsBySession = new Map<string, number>();

  constructor() {
    this.vscode = acquireVsCodeApi();
  }

  public start(): void {
    const unlockAudio = () => {
      primeRequestSound();
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
      this.handleMessage(event.data);
    });

    this.sidebarToggleButton?.addEventListener('click', () => {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      this.appShell?.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
    });

    this.vscode.postMessage({
      protocolVersion: 1,
      type: 'uiReady',
      payload: {}
    });
  }

  private handleMessage(message: ExtensionMessage): void {
    switch (message.type) {
      case 'sessionsSnapshot':
        this.handleSessionsSnapshot(message.payload.selectedSessionId, message.payload.sessions);
        return;
      case 'sessionSnapshot':
        this.session = message.payload.session;
        this.renderSession();
        this.scrollTranscriptToBottom();
        return;
      case 'error':
        this.renderInlineError(message.payload.message);
        return;
      case 'openSettings':
        this.openSettingsModal();
        return;
      default:
        return;
    }
  }

  private handleSessionsSnapshot(selectedSessionId: string | null, sessions: SessionListItem[]): void {
    sessions.forEach((session) => {
      const isKnown = this.toolCallsBySession.has(session.sessionId);
      const previousToolCalls = this.toolCallsBySession.get(session.sessionId) ?? 0;

      // Only play sound when we've already seen this session (not on first open)
      // and the agent has made a new tool call and is now waiting for user input
      if (
        isKnown &&
        session.toolCalls > previousToolCalls &&
        session.hasPendingRequest &&
        session.notificationSoundEnabled
      ) {
        playRequestSound();
      }

      this.toolCallsBySession.set(session.sessionId, session.toolCalls);
    });

    this.selectedSessionId = selectedSessionId;
    this.sessions = sessions;
    this.renderSessions();
  }

  private renderSessions(): void {
    if (!this.sessionsListElement) {
      return;
    }

    if (this.sessions.length === 0) {
      this.sessionsListElement.className = 'session-list empty-state';
      this.sessionsListElement.textContent = 'No active sessions yet.';
      return;
    }

    this.sessionsListElement.className = 'session-list';
    this.sessionsListElement.innerHTML = renderSessionsList(this.sessions, this.selectedSessionId);

    // Select on clicking the main card area
    this.sessionsListElement.querySelectorAll<HTMLButtonElement>('.session-card-select').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sessionId = btn.dataset.sessionId ?? null;
        this.vscode.postMessage({ protocolVersion: 1, type: 'selectSession', payload: { sessionId } });
      });
    });

    // Action buttons: rename / dispose
    this.sessionsListElement.querySelectorAll<HTMLButtonElement>('.session-action-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const sessionId = btn.dataset.sessionId ?? null;
        if (!sessionId) {
          return;
        }

        if (btn.dataset.action === 'dispose') {
          this.vscode.postMessage({ protocolVersion: 1, type: 'disposeSession', sessionId, payload: {} });
          return;
        }

        if (btn.dataset.action === 'rename') {
          // Find the title element inside this card and replace with an inline input
          const card = btn.closest('.session-card');
          const titleEl = card?.querySelector('.session-card-title') as HTMLElement | null;
          if (!titleEl) {
            return;
          }

          const currentTitle = titleEl.textContent ?? '';
          const input = document.createElement('input');
          input.type = 'text';
          input.value = currentTitle;
          input.className = 'session-rename-input';
          titleEl.replaceWith(input);
          input.focus();
          input.select();

          const commit = () => {
            const newTitle = input.value.trim();
            // Restore title element
            const restored = document.createElement('div');
            restored.className = 'session-card-title';
            restored.textContent = newTitle || currentTitle;
            input.replaceWith(restored);
            if (newTitle && newTitle !== currentTitle) {
              this.vscode.postMessage({ protocolVersion: 1, type: 'renameSession', sessionId, payload: { newTitle } });
            }
          };

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              commit();
            } else if (e.key === 'Escape') {
              const restored = document.createElement('div');
              restored.className = 'session-card-title';
              restored.textContent = currentTitle;
              input.replaceWith(restored);
            }
          });
          input.addEventListener('blur', commit);
        }
      });
    });
  }

  private renderSession(): void {
    if (!this.sessionDetailElement) {
      return;
    }

    if (!this.session) {
      this.sessionDetailElement.className = 'session-detail empty-state';
      this.sessionDetailElement.textContent = 'Select a session to open its chat view.';
      return;
    }

    this.sessionDetailElement.className = 'session-detail chat-detail';
    this.sessionDetailElement.innerHTML = renderSessionDetail(this.session, this.settingsOpen);

    this.bindSessionEvents();
  }

  private bindSessionEvents(): void {
    if (!this.session) {
      return;
    }

    const modalBackdrop = document.getElementById('settings-modal-backdrop') as HTMLDivElement | null;
    const modalClose = document.getElementById('settings-modal-close') as HTMLButtonElement | null;
    const composerTextarea = document.getElementById('composer-textarea') as HTMLTextAreaElement | null;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement | null;
    const autopilotCheckbox = document.getElementById('autopilot-checkbox') as HTMLInputElement | null;
    const autopilotBarCheckbox = document.getElementById('autopilot-bar-checkbox') as HTMLInputElement | null;
    const autopilotMaxTurns = document.getElementById('autopilot-max-turns') as HTMLInputElement | null;
    const soundCheckbox = document.getElementById('sound-checkbox') as HTMLInputElement | null;
    const autoQueueCheckbox = document.getElementById('auto-queue-checkbox') as HTMLInputElement | null;
    const enterSendsCheckbox = document.getElementById('enter-sends-checkbox') as HTMLInputElement | null;
    const clearQueueButton = document.getElementById('clear-queue-button') as HTMLButtonElement | null;
    const disposeSessionButton = document.getElementById('dispose-session-button') as HTMLButtonElement | null;

    // Modal: close button
    modalClose?.addEventListener('click', () => {
      this.settingsOpen = false;
      modalBackdrop?.classList.add('is-hidden');
    });

    // Modal: close on backdrop click
    modalBackdrop?.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) {
        this.settingsOpen = false;
        modalBackdrop.classList.add('is-hidden');
      }
    });

    sendButton?.addEventListener('click', () => {
      if (!composerTextarea) {
        return;
      }

      const content = composerTextarea.value.trim();
      if (!content) {
        return;
      }

      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'submitComposerInput',
        sessionId: this.session?.sessionId,
        payload: { content }
      });
      composerTextarea.value = '';
    });

    composerTextarea?.addEventListener('keydown', (event) => {
      const enterSends = this.session?.settings?.enterSends ?? false;
      if (enterSends) {
        // Enter sends; Shift+Enter adds newline
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendButton?.click();
        }
      } else {
        // Ctrl/Cmd+Enter sends; plain Enter adds newline
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          sendButton?.click();
        }
      }
    });

    const postAutopilotToggle = (enabled: boolean) => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'toggleAutopilot',
        sessionId: this.session?.sessionId,
        payload: { enabled }
      });
    };

    autopilotCheckbox?.addEventListener('change', () => {
      postAutopilotToggle(autopilotCheckbox.checked);
    });

    // Keep autopilot-bar and modal checkboxes in sync
    autopilotBarCheckbox?.addEventListener('change', () => {
      if (autopilotCheckbox) {
        autopilotCheckbox.checked = autopilotBarCheckbox.checked;
      }
      postAutopilotToggle(autopilotBarCheckbox.checked);
    });

    autopilotMaxTurns?.addEventListener('change', () => {
      const maxTurns = Number.parseInt(autopilotMaxTurns.value, 10);
      if (Number.isNaN(maxTurns)) {
        return;
      }

      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'setAutopilotMaxTurns',
        sessionId: this.session?.sessionId,
        payload: { maxTurns }
      });
    });

    const postSettingsUpdate = () => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'updateSessionSettings',
        sessionId: this.session?.sessionId,
        payload: {
          notificationSoundEnabled: !!soundCheckbox?.checked,
          autoQueuePrompts: !!autoQueueCheckbox?.checked,
          enterSends: !!enterSendsCheckbox?.checked
        }
      });
    };

    soundCheckbox?.addEventListener('change', postSettingsUpdate);
    autoQueueCheckbox?.addEventListener('change', postSettingsUpdate);
    enterSendsCheckbox?.addEventListener('change', postSettingsUpdate);

    clearQueueButton?.addEventListener('click', () => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'clearQueue',
        sessionId: this.session?.sessionId,
        payload: {}
      });
    });

    disposeSessionButton?.addEventListener('click', () => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'disposeSession',
        sessionId: this.session?.sessionId,
        payload: {}
      });
    });
  }

  private renderInlineError(message: string): void {
    if (!this.sessionDetailElement) {
      return;
    }

    const errorBlock = document.createElement('div');
    errorBlock.className = 'inline-error';
    errorBlock.textContent = message;
    this.sessionDetailElement.prepend(errorBlock);
  }

  private scrollTranscriptToBottom(): void {
    const transcript = document.querySelector('.chat-transcript');
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }

  private openSettingsModal(): void {
    const backdrop = document.getElementById('settings-modal-backdrop');
    if (backdrop) {
      this.settingsOpen = true;
      backdrop.classList.remove('is-hidden');
    }
  }
}
