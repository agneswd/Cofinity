import { exec } from 'child_process';
import * as vscode from 'vscode';
import { GlobalSettingsManager } from '../global-settings/globalSettings';
import type { SessionListItemSnapshot } from '../session-runtime/sessionSnapshot';
import { SessionRegistry } from '../session-runtime/SessionRegistry';
import { SessionManagerViewProvider } from './SessionManagerViewProvider';

export class SessionManagerStateBridge implements vscode.Disposable {
  private readonly stateSubscription: vscode.Disposable;
  private readonly pendingSessionIds = new Set<string>();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly provider: SessionManagerViewProvider,
    private readonly settingsManager: GlobalSettingsManager
  ) {
    this.stateSubscription = this.registry.onDidChangeState(() => {
      this.sync();
    });
  }

  public sync(): void {
    const snapshot = this.registry.buildManagerSnapshot();
    this.checkForNewPendingRequests(snapshot.sessions);
    this.provider.postSessionsSnapshot(snapshot);
    this.provider.postSessionSnapshot(this.registry.getSelectedSessionSnapshot());
  }

  private checkForNewPendingRequests(sessions: SessionListItemSnapshot[]): void {
    const globalSettings = this.settingsManager.get();
    for (const session of sessions) {
      const wasAlreadyPending = this.pendingSessionIds.has(session.sessionId);

      if (session.hasPendingRequest && !wasAlreadyPending) {
        this.pendingSessionIds.add(session.sessionId);
        if (globalSettings.autoRevealEnabled) {
          this.provider.reveal();
        }
        if (globalSettings.notificationSoundEnabled) {
          this.playSystemSound();
        }
      } else if (!session.hasPendingRequest) {
        this.pendingSessionIds.delete(session.sessionId);
      }
    }
  }

  private playSystemSound(): void {
    const platform = process.platform;
    try {
      if (platform === 'win32') {
        exec('[System.Media.SystemSounds]::Exclamation.Play()', { shell: 'powershell.exe' });
      } else if (platform === 'darwin') {
        exec('afplay /System/Library/Sounds/Tink.aiff 2>/dev/null || printf "\\a"');
      } else {
        exec('paplay /usr/share/sounds/freedesktop/stereo/message.oga 2>/dev/null || printf "\\a"');
      }
    } catch {
      // Sound playing failed - not critical
    }
  }

  dispose(): void {
    this.stateSubscription.dispose();
  }
}
