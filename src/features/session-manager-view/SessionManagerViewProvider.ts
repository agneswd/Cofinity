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
    this.view?.show?.(true);
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
      case 'respondToRequest':
        if (!message.sessionId) {
          this.postError('Missing sessionId for respondToRequest.');
          return;
        }
        if (!this.sessionRegistry.respondToPendingRequest(message.sessionId, message.payload.requestId, message.payload.response)) {
          this.postError('Failed to resolve pending request. The request may be stale.');
        }
        return;
      case 'enqueuePrompt':
        if (!message.sessionId) {
          this.postError('Missing sessionId for enqueuePrompt.');
          return;
        }
        if (!this.sessionRegistry.enqueuePrompt(message.sessionId, message.payload.content)) {
          this.postError('Failed to enqueue prompt for the selected session.');
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
}
