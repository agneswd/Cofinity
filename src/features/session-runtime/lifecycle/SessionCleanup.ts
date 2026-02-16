import * as vscode from 'vscode';
import { SessionRegistry } from '../SessionRegistry';

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_POLL_MS = 60 * 1000;

export class SessionCleanup implements vscode.Disposable {
  private readonly intervalHandle: NodeJS.Timeout;

  constructor(
    private readonly registry: SessionRegistry,
    private readonly maxIdleMs = DEFAULT_IDLE_MS,
    pollMs = DEFAULT_POLL_MS
  ) {
    this.intervalHandle = setInterval(() => {
      this.registry.disposeIdleSessions(this.maxIdleMs);
    }, pollMs);
  }

  dispose(): void {
    clearInterval(this.intervalHandle);
  }
}
