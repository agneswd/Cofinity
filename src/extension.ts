import * as vscode from 'vscode';
import { registerCofinityTool } from './features/cofinity-tool/registerCofinityTool';
import { SessionRegistry } from './features/session-runtime/SessionRegistry';
import { SessionManagerViewProvider } from './features/session-manager-view/SessionManagerViewProvider';
import { SessionManagerStateBridge } from './features/session-manager-view/sessionManagerStateBridge';

let sessionManagerViewProvider: SessionManagerViewProvider | undefined;
let sessionRegistry: SessionRegistry | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const registry = new SessionRegistry();
  const provider = new SessionManagerViewProvider(context.extensionUri, registry);
  const bridge = new SessionManagerStateBridge(registry, provider);

  sessionManagerViewProvider = provider;
  sessionRegistry = registry;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SessionManagerViewProvider.viewType, provider),
    provider,
    registry,
    bridge
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cofinity.openSessionManager', () => {
      sessionManagerViewProvider?.reveal();
    })
  );

  registerCofinityTool(context, registry);
}

export function deactivate(): void {
  sessionManagerViewProvider = undefined;
  sessionRegistry = undefined;
}
