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

  private selectedSessionId: string | null = null;
  private sessions: SessionListItem[] = [];
  private session: SessionSnapshot | null = null;
  private settingsOpen = false;
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
        return;
      case 'error':
        this.renderInlineError(message.payload.message);
        return;
      default:
        return;
    }
  }

  private handleSessionsSnapshot(selectedSessionId: string | null, sessions: SessionListItem[]): void {
    sessions.forEach((session) => {
      const previousToolCalls = this.toolCallsBySession.get(session.sessionId) ?? 0;
      if (
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

    this.sessionsListElement.querySelectorAll<HTMLButtonElement>('.session-card').forEach((element) => {
      element.addEventListener('click', () => {
        const sessionId = element.dataset.sessionId ?? null;
        this.vscode.postMessage({
          protocolVersion: 1,
          type: 'selectSession',
          payload: { sessionId }
        });
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

    const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement | null;
    const composerTextarea = document.getElementById('composer-textarea') as HTMLTextAreaElement | null;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement | null;
    const autopilotCheckbox = document.getElementById('autopilot-checkbox') as HTMLInputElement | null;
    const autopilotMaxTurns = document.getElementById('autopilot-max-turns') as HTMLInputElement | null;
    const soundCheckbox = document.getElementById('sound-checkbox') as HTMLInputElement | null;
    const autoQueueCheckbox = document.getElementById('auto-queue-checkbox') as HTMLInputElement | null;
    const clearQueueButton = document.getElementById('clear-queue-button') as HTMLButtonElement | null;
    const disposeSessionButton = document.getElementById('dispose-session-button') as HTMLButtonElement | null;

    settingsToggle?.addEventListener('click', () => {
      this.settingsOpen = !this.settingsOpen;
      this.renderSession();
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
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        sendButton?.click();
      }
    });

    autopilotCheckbox?.addEventListener('change', () => {
      this.vscode.postMessage({
        protocolVersion: 1,
        type: 'toggleAutopilot',
        sessionId: this.session?.sessionId,
        payload: { enabled: autopilotCheckbox.checked }
      });
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
          autoQueuePrompts: !!autoQueueCheckbox?.checked
        }
      });
    };

    soundCheckbox?.addEventListener('change', postSettingsUpdate);
    autoQueueCheckbox?.addEventListener('change', postSettingsUpdate);

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
}
