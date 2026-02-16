import * as vscode from 'vscode';
import { SessionRegistry } from '../session-runtime/SessionRegistry';
import { SessionManagerViewProvider } from './SessionManagerViewProvider';

export class SessionManagerStateBridge implements vscode.Disposable {
  private readonly stateSubscription: vscode.Disposable;

  constructor(
    private readonly registry: SessionRegistry,
    private readonly provider: SessionManagerViewProvider
  ) {
    this.stateSubscription = this.registry.onDidChangeState(() => {
      this.sync();
    });
  }

  public sync(): void {
    this.provider.postSessionsSnapshot(this.registry.buildManagerSnapshot());
    this.provider.postSessionSnapshot(this.registry.getSelectedSessionSnapshot());
  }

  dispose(): void {
    this.stateSubscription.dispose();
  }
}
