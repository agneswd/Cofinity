import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AttachmentInfo } from '../session-runtime/sessionTypes';
import { type GlobalSettings, GlobalSettingsManager } from '../global-settings/globalSettings';
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

const CHAT_OPEN_COMMAND_CANDIDATES = [
  'workbench.action.chat.open',
  'workbench.panel.chat.view.copilot.focus',
  'github.copilot.chat.open',
  'github.copilot.chat.focus',
  'vscode.editorChat.start'
] as const;

const CHAT_NEW_COMMAND_CANDIDATES = ['workbench.action.chat.newChat'] as const;

export class SessionManagerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'cofinity.sessionManagerView';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storageUri: vscode.Uri,
    private readonly sessionRegistry: SessionRegistry,
    private readonly settingsManager: GlobalSettingsManager
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
      this.postGlobalSettings(this.settingsManager.get());
      return;
    }

    switch (message.type) {
      case 'newCopilotSession':
        void this.openNewCopilotSession();
        return;
      case 'openExternal':
        void vscode.env.openExternal(vscode.Uri.parse(message.payload.url));
        return;
      case 'addAttachment':
        void this.addWorkspaceAttachments();
        return;
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
          if (!this.sessionRegistry.respondToPendingRequest(message.sessionId, session.pendingRequest.requestId, content, message.payload.attachments)) {
            this.postError('Failed to resolve pending request. The request may be stale.');
          }
          return;
        }

        if (!this.settingsManager.get().autoQueuePrompts) {
          this.postError('Auto queue is disabled. Turn it back on from the global settings to queue prompts while the agent is not waiting.');
          return;
        }

        if (!this.sessionRegistry.enqueuePrompt(message.sessionId, content, message.payload.attachments)) {
          this.postError('Failed to queue the prompt for the selected session.');
        }
        return;
      }
      case 'saveImage':
        void this.saveImageAttachment(message.payload.data, message.payload.mimeType);
        return;
      case 'removeDraftAttachment':
        this.removeDraftAttachment(message.payload);
        return;
      case 'updateQueuedPrompt':
        if (!message.sessionId) {
          this.postError('Missing sessionId for updateQueuedPrompt.');
          return;
        }
        if (!this.sessionRegistry.updateQueuedPrompt(message.sessionId, message.payload.itemId, message.payload.content)) {
          this.postError('Failed to update the queued prompt.');
        }
        return;
      case 'removeQueuedPrompt':
        if (!message.sessionId) {
          this.postError('Missing sessionId for removeQueuedPrompt.');
          return;
        }
        if (!this.sessionRegistry.removeQueuedPrompt(message.sessionId, message.payload.itemId)) {
          this.postError('Failed to remove the queued prompt.');
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
      case 'updateGlobalSettings':
        void this.settingsManager.update(message.payload).then(() => {
          this.postGlobalSettings(this.settingsManager.get());
        });
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
      case 'markSessionInterrupted':
        if (!message.sessionId) {
          this.postError('Missing sessionId for markSessionInterrupted.');
          return;
        }
        this.sessionRegistry.markSessionInterrupted(message.sessionId);
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

  public postGlobalSettings(settings: GlobalSettings): void {
    this.postMessage({
      protocolVersion: SESSION_MANAGER_PROTOCOL_VERSION,
      type: 'globalSettings',
      payload: settings
    });
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

  private async saveImageAttachment(dataUrl: string, mimeType: string): Promise<void> {
    const validMimeTypes = new Map<string, string>([
      ['image/png', '.png'],
      ['image/jpeg', '.jpg'],
      ['image/gif', '.gif'],
      ['image/webp', '.webp'],
      ['image/bmp', '.bmp']
    ]);
    const maxImageSizeBytes = 10 * 1024 * 1024;
    const extension = validMimeTypes.get(mimeType);
    const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);

    if (!extension || !base64Match) {
      this.postError('Unsupported image attachment.');
      return;
    }

    const estimatedSize = Math.ceil(base64Match[1].length * 0.75);
    if (estimatedSize > maxImageSizeBytes) {
      this.postError('Image attachment is too large. Max 10MB.');
      return;
    }

    const buffer = Buffer.from(base64Match[1], 'base64');
    if (buffer.length > maxImageSizeBytes) {
      this.postError('Image attachment is too large. Max 10MB.');
      return;
    }

    const tempDir = path.join(this.storageUri.fsPath, 'temp-images');
    fs.mkdirSync(tempDir, { recursive: true });

    const fileName = `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, buffer);

    this.postMessage({
      protocolVersion: SESSION_MANAGER_PROTOCOL_VERSION,
      type: 'imageSaved',
      payload: {
        attachment: {
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: fileName,
          uri: vscode.Uri.file(filePath).toString(),
          mimeType,
          isTemporary: true
        }
      }
    });
  }

  private async addWorkspaceAttachments(): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,dist}/**', 2000);
    if (files.length === 0) {
      this.postError('No workspace files available to attach.');
      return;
    }

    const items = files
      .map((uri) => {
        const relativePath = vscode.workspace.asRelativePath(uri);
        return {
          label: path.basename(uri.fsPath),
          description: relativePath,
          uri
        };
      })
      .sort((left, right) => left.description.localeCompare(right.description));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select workspace files to attach',
      matchOnDescription: true
    });

    if (!selected || selected.length === 0) {
      return;
    }

    this.postMessage({
      protocolVersion: SESSION_MANAGER_PROTOCOL_VERSION,
      type: 'attachmentsAdded',
      payload: {
        attachments: selected.map((item) => ({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: item.description,
          uri: item.uri.toString(),
          mimeType: this.getMimeTypeForPath(item.uri.fsPath)
        }))
      }
    });
  }

  private getMimeTypeForPath(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    const mimeTypes = new Map<string, string>([
      ['.png', 'image/png'],
      ['.jpg', 'image/jpeg'],
      ['.jpeg', 'image/jpeg'],
      ['.gif', 'image/gif'],
      ['.webp', 'image/webp'],
      ['.bmp', 'image/bmp'],
      ['.svg', 'image/svg+xml'],
      ['.md', 'text/markdown'],
      ['.txt', 'text/plain'],
      ['.ts', 'text/plain'],
      ['.tsx', 'text/plain'],
      ['.js', 'text/plain'],
      ['.json', 'application/json']
    ]);

    return mimeTypes.get(extension) ?? 'application/octet-stream';
  }

  private removeDraftAttachment(attachment: { attachmentId: string; uri?: string; isTemporary?: boolean }): void {
    if (!attachment.isTemporary || !attachment.uri) {
      return;
    }

    try {
      const filePath = vscode.Uri.parse(attachment.uri).fsPath;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore attachment cleanup failures.
    }
  }

  private async openNewCopilotSession(): Promise<void> {
    const commands = await vscode.commands.getCommands(true);

    for (const commandId of CHAT_NEW_COMMAND_CANDIDATES) {
      if (!commands.includes(commandId)) {
        continue;
      }

      try {
        await vscode.commands.executeCommand(commandId);
      } catch {
        // Try the next candidate.
      }
    }

    for (const commandId of CHAT_OPEN_COMMAND_CANDIDATES) {
      if (!commands.includes(commandId)) {
        continue;
      }

      try {
        await vscode.commands.executeCommand(commandId);
        return;
      } catch {
        // Try the next candidate.
      }
    }

    this.postError('Failed to start a new Copilot session.');
  }
}
