import * as vscode from 'vscode';
import { registerCofinityTool } from './features/cofinity-tool/registerCofinityTool';
import { GlobalSettingsManager } from './features/global-settings/globalSettings';
import { SessionCleanup } from './features/session-runtime/lifecycle/SessionCleanup';
import { SessionRegistry } from './features/session-runtime/SessionRegistry';
import { SessionPersistence } from './features/session-runtime/storage/SessionPersistence';
import { SessionManagerViewProvider } from './features/session-manager-view/SessionManagerViewProvider';
import { SessionManagerStateBridge } from './features/session-manager-view/sessionManagerStateBridge';

let sessionManagerViewProvider: SessionManagerViewProvider | undefined;
let sessionRegistry: SessionRegistry | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const registry = new SessionRegistry();
  const settingsManager = new GlobalSettingsManager(context.globalState);
  const storageUri = context.storageUri ?? context.globalStorageUri;
  const provider = new SessionManagerViewProvider(context.extensionUri, storageUri, registry, settingsManager);
  const bridge = new SessionManagerStateBridge(registry, provider, settingsManager);
  const persistence = new SessionPersistence(context, registry);
  const cleanup = new SessionCleanup(registry);

  sessionManagerViewProvider = provider;
  sessionRegistry = registry;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SessionManagerViewProvider.viewType, provider),
    provider,
    registry,
    bridge,
    persistence,
    cleanup
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cofinity.openSessionManager', () => {
      sessionManagerViewProvider?.reveal();
    }),
    vscode.commands.registerCommand('cofinity.openSessionSettings', () => {
      sessionManagerViewProvider?.openSettings();
    })
  );

  registerCofinityTool(context, registry);
  void persistence.restore().then(() => {
    bridge.sync();
  });
}

export function deactivate(): void {
  sessionManagerViewProvider = undefined;
  sessionRegistry = undefined;
}
