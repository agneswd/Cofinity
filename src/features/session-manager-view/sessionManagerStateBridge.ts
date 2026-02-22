import { exec } from 'child_process';
import * as vscode from 'vscode';
import { GlobalSettingsManager } from '../global-settings/globalSettings';
import type { SessionListItemSnapshot } from '../session-runtime/sessionSnapshot';
import { SessionRegistry } from '../session-runtime/SessionRegistry';
import { SessionManagerViewProvider } from './SessionManagerViewProvider';

interface AutopilotTimer {
  timer: NodeJS.Timeout;
  requestId: string;
}

export class SessionManagerStateBridge implements vscode.Disposable {
  private readonly stateSubscription: vscode.Disposable;
  private readonly pendingSessionIds = new Set<string>();
  private readonly autopilotTimers = new Map<string, AutopilotTimer>();
  private readonly autopilotPromptIndex = new Map<string, number>();

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
          this.registry.selectSession(session.sessionId);
          this.provider.reveal();
        }
        if (globalSettings.notificationSoundEnabled) {
          this.playSystemSound();
        }
      } else if (!session.hasPendingRequest) {
        this.pendingSessionIds.delete(session.sessionId);
      }

      // Autopilot auto-respond
      this.reconcileAutopilotTimer(session);
    }

    // Cancel timers for sessions that are no longer in the list (disposed)
    const activeIds = new Set(sessions.map((s) => s.sessionId));
    for (const [sessionId] of this.autopilotTimers) {
      if (!activeIds.has(sessionId)) {
        this.cancelAutopilotTimer(sessionId);
      }
    }
  }

  private reconcileAutopilotTimer(session: SessionListItemSnapshot): void {
    const isEligible = this.isAutopilotEligible(session);
    const existing = this.autopilotTimers.get(session.sessionId);

    if (isEligible) {
      const fullSnapshot = this.registry.getSessionSnapshot(session.sessionId);
      if (!fullSnapshot?.pendingRequest) {
        return;
      }

      // Already have a timer for this request
      if (existing?.requestId === fullSnapshot.pendingRequest.requestId) {
        return;
      }

      // Cancel stale timer for a different requestId
      if (existing) {
        this.cancelAutopilotTimer(session.sessionId);
      }

      this.scheduleAutopilotResponse(session.sessionId, fullSnapshot.pendingRequest.requestId);
    } else {
      if (existing) {
        this.cancelAutopilotTimer(session.sessionId);
      }
    }
  }

  private isAutopilotEligible(session: SessionListItemSnapshot): boolean {
    if (!session.hasPendingRequest) {
      return false;
    }

    if (session.queuedCount > 0) {
      return false;
    }

    const fullSnapshot = this.registry.getSessionSnapshot(session.sessionId);
    return fullSnapshot?.autopilotMode === 'drainQueue';
  }

  private scheduleAutopilotResponse(sessionId: string, requestId: string): void {
    const settings = this.settingsManager.get();
    const minMs = Math.max(500, settings.autopilotDelayMinMs);
    const maxMs = Math.max(minMs + 500, settings.autopilotDelayMaxMs);
    const delay = minMs + Math.random() * (maxMs - minMs);

    const timer = setTimeout(() => {
      this.autopilotTimers.delete(sessionId);
      this.fireAutopilotResponse(sessionId, requestId);
    }, delay);

    this.autopilotTimers.set(sessionId, { timer, requestId });
  }

  private fireAutopilotResponse(sessionId: string, requestId: string): void {
    const settings = this.settingsManager.get();
    const prompts = settings.autopilotPrompts;

    if (prompts.length === 0) {
      return;
    }

    const index = this.autopilotPromptIndex.get(sessionId) ?? 0;
    const prompt = prompts[index % prompts.length];
    this.autopilotPromptIndex.set(sessionId, index + 1);

    this.registry.respondToPendingRequest(sessionId, requestId, prompt);
  }

  private cancelAutopilotTimer(sessionId: string): void {
    const entry = this.autopilotTimers.get(sessionId);
    if (entry) {
      clearTimeout(entry.timer);
      this.autopilotTimers.delete(sessionId);
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
    for (const [sessionId] of this.autopilotTimers) {
      this.cancelAutopilotTimer(sessionId);
    }
    this.stateSubscription.dispose();
  }
}
