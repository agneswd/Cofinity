import * as vscode from 'vscode';
import type { SessionListItemSnapshot } from '../session-runtime/sessionSnapshot';
import { SessionRegistry } from '../session-runtime/SessionRegistry';
import { SessionManagerViewProvider } from './SessionManagerViewProvider';

export class SessionManagerStateBridge implements vscode.Disposable {
  private readonly stateSubscription: vscode.Disposable;
  private readonly pendingSessionIds = new Set<string>();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly provider: SessionManagerViewProvider
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
    for (const session of sessions) {
      const wasAlreadyPending = this.pendingSessionIds.has(session.sessionId);

      if (session.hasPendingRequest && !wasAlreadyPending) {
        this.pendingSessionIds.add(session.sessionId);

        if (session.notificationSoundEnabled) {
          void vscode.window.showInformationMessage(
            `Cofinity: Agent is waiting for input — ${session.title}`,
            'Open'
          ).then((choice) => {
            if (choice === 'Open') {
              this.provider.reveal();
            }
          });
        }
      } else if (!session.hasPendingRequest) {
        this.pendingSessionIds.delete(session.sessionId);
      }
    }
  }

  dispose(): void {
    this.stateSubscription.dispose();
  }
}
