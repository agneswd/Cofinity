import * as vscode from 'vscode';
import { SessionRegistry } from '../SessionRegistry';
import type {
  AutopilotState,
  PromptQueueItem,
  SessionChatMessage,
  SessionEvent,
  SessionId,
  SessionState
} from '../sessionTypes';

const STORAGE_KEY = 'cofinity.sessionSummaries';
const SAVE_DEBOUNCE_MS = 200;

export interface PersistedSessionRecord {
  sessionId: SessionId;
  createdAtMs: number;
  lastActiveAtMs: number;
  title: string;
  status: SessionState['status'];
  promptQueue: PromptQueueItem[];
  chatMessages: SessionChatMessage[];
  autopilot: AutopilotState;
  history: SessionEvent[];
  stats: SessionState['stats'];
}

function isPersistedSessionRecord(value: unknown): value is PersistedSessionRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.createdAtMs === 'number' &&
    typeof candidate.lastActiveAtMs === 'number' &&
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'string' &&
    Array.isArray(candidate.promptQueue) &&
    Array.isArray(candidate.chatMessages) &&
    !!candidate.autopilot &&
    typeof candidate.autopilot === 'object' &&
    Array.isArray(candidate.history) &&
    !!candidate.stats &&
    typeof candidate.stats === 'object'
  );
}

function toRestoredStatus(status: PersistedSessionRecord['status']): SessionState['status'] {
  if (status === 'disposed') {
    return 'disposed';
  }

  return 'interrupted';
}

export class SessionPersistence implements vscode.Disposable {
  private readonly onDidChangeSubscription: vscode.Disposable;

  private saveTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly registry: SessionRegistry
  ) {
    this.onDidChangeSubscription = this.registry.onDidChangeState(() => {
      this.scheduleSave();
    });
  }

  public async restore(): Promise<void> {
    const stored = this.getStore().get<unknown>(STORAGE_KEY, []);
    const records = Array.isArray(stored) ? stored.filter(isPersistedSessionRecord) : [];

    if (records.length === 0) {
      return;
    }

    this.registry.restoreSessions(
      records.map((record) => ({
        ...record,
        status: toRestoredStatus(record.status)
      }))
    );
  }

  public dispose(): void {
    this.onDidChangeSubscription.dispose();

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      void this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  private async saveNow(): Promise<void> {
    this.saveTimer = undefined;
    await this.getStore().update(STORAGE_KEY, this.registry.exportPersistedSessions());
  }

  private getStore(): vscode.Memento {
    return vscode.workspace.workspaceFolders?.length
      ? this.context.workspaceState
      : this.context.globalState;
  }
}
