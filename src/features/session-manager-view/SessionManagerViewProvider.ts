import * as vscode from 'vscode';
import type {
  SessionManagerSnapshot,
  SessionSnapshot
} from '../session-runtime/sessionSnapshot';
import { SessionRegistry } from '../session-runtime/SessionRegistry';
import { buildSessionManagerHtml } from './sessionManagerHtml';
import {
  type ExtensionToWebviewMessage,
  SESSION_MANAGER_PROTOCOL_VERSION
} from './sessionManagerProtocol';
import {
  isUiReadyMessage,
  isWebviewToExtensionMessage
} from './sessionManagerProtocolGuards';

export class SessionManagerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'cofinity.sessionManagerView';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessionRegistry: SessionRegistry
  ) {}

  dispose(): void {
    this.view = undefined;
  }

  reveal(): void {
    if (this.view) {
      this.view.show?.(true);
    } else {
      void vscode.commands.executeCommand(`${SessionManagerViewProvider.viewType}.focus`);
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri,
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'media')
      ]
    };
    webviewView.webview.html = buildSessionManagerHtml(webviewView.webview, this.extensionUri);
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      this.handleMessage(message);
    });
  }

  private handleMessage(message: unknown): void {
    if (!isWebviewToExtensionMessage(message)) {
      return;
    }

    if (isUiReadyMessage(message)) {
      this.postSessionsSnapshot(this.sessionRegistry.buildManagerSnapshot());
      this.postSessionSnapshot(this.sessionRegistry.getSelectedSessionSnapshot());
      return;
    }

    switch (message.type) {
      case 'selectSession':
        this.sessionRegistry.selectSession(message.payload.sessionId);
        return;
      case 'submitComposerInput': {
        if (!message.sessionId) {
          this.postError('Missing sessionId for submitComposerInput.');
          return;
        }

        const session = this.sessionRegistry.getSessionSnapshot(message.sessionId);
        if (!session) {
          this.postError('Failed to find the selected session.');
          return;
        }

        const content = message.payload.content.trim();
        if (!content) {
          return;
        }

        if (session.pendingRequest) {
          if (!this.sessionRegistry.respondToPendingRequest(message.sessionId, session.pendingRequest.requestId, content)) {
            this.postError('Failed to resolve pending request. The request may be stale.');
          }
          return;
        }

        if (!session.settings.autoQueuePrompts) {
          this.postError('Auto queue is disabled for this session. Turn it back on from the settings menu to queue prompts while the agent is not waiting.');
          return;
        }

        if (!this.sessionRegistry.enqueuePrompt(message.sessionId, content)) {
          this.postError('Failed to queue the prompt for the selected session.');
        }
        return;
      }
      case 'updateQueuedPrompt':
        if (!message.sessionId) {
          this.postError('Missing sessionId for updateQueuedPrompt.');
          return;
        }
        if (!this.sessionRegistry.updateQueuedPrompt(message.sessionId, message.payload.itemId, message.payload.content)) {
          this.postError('Failed to update the queued prompt.');
        }
        return;
      case 'reorderQueuedPrompt':
        if (!message.sessionId) {
          this.postError('Missing sessionId for reorderQueuedPrompt.');
          return;
        }
        if (!this.sessionRegistry.reorderQueuedPrompt(message.sessionId, message.payload.itemId, message.payload.targetItemId)) {
          this.postError('Failed to reorder the queued prompt.');
        }
        return;
      case 'toggleAutopilot':
        if (!message.sessionId) {
          this.postError('Missing sessionId for toggleAutopilot.');
          return;
        }
        if (!this.sessionRegistry.setAutopilotEnabled(message.sessionId, message.payload.enabled)) {
          this.postError('Failed to update autopilot for the selected session.');
        }
        return;
      case 'setAutopilotMaxTurns':
        if (!message.sessionId) {
          this.postError('Missing sessionId for setAutopilotMaxTurns.');
          return;
        }
        if (!this.sessionRegistry.setAutopilotMaxTurns(message.sessionId, message.payload.maxTurns)) {
          this.postError('Failed to update autopilot turn limits for the selected session.');
        }
        return;
      case 'updateSessionSettings':
        if (!message.sessionId) {
          this.postError('Missing sessionId for updateSessionSettings.');
          return;
        }
        if (!this.sessionRegistry.updateSettings(message.sessionId, message.payload)) {
          this.postError('Failed to update settings for the selected session.');
        }
        return;
      case 'renameSession':
        if (!message.sessionId) {
          this.postError('Missing sessionId for renameSession.');
          return;
        }
        if (!this.sessionRegistry.renameSession(message.sessionId, message.payload.newTitle)) {
          this.postError('Failed to rename the selected session.');
        }
        return;
      case 'clearQueue':
        if (!message.sessionId) {
          this.postError('Missing sessionId for clearQueue.');
          return;
        }
        if (!this.sessionRegistry.clearQueue(message.sessionId)) {
          this.postError('Failed to clear the queue for the selected session.');
        }
        return;
      case 'disposeSession':
        if (!message.sessionId) {
          this.postError('Missing sessionId for disposeSession.');
          return;
        }
        if (!this.sessionRegistry.disposeSession(message.sessionId)) {
          this.postError('Failed to dispose the selected session.');
        }
        return;
      default:
        return;
    }
  }

  private postMessage(message: ExtensionToWebviewMessage): void {
    void this.view?.webview.postMessage(message);
  }

  public postSessionsSnapshot(snapshot: SessionManagerSnapshot): void {
    this.postMessage({
      protocolVersion: SESSION_MANAGER_PROTOCOL_VERSION,
      type: 'sessionsSnapshot',
      payload: snapshot
    });
  }

  public postSessionSnapshot(session: SessionSnapshot | null): void {
    this.postMessage({
      protocolVersion: SESSION_MANAGER_PROTOCOL_VERSION,
      type: 'sessionSnapshot',
      payload: { session }
    });
  }

  public postError(message: string): void {
    this.postMessage({
      protocolVersion: SESSION_MANAGER_PROTOCOL_VERSION,
      type: 'error',
      payload: { message }
    });
  }

  public openSettings(): void {
    this.postMessage({
      protocolVersion: SESSION_MANAGER_PROTOCOL_VERSION,
      type: 'openSettings',
      payload: {}
    });
  }
}
