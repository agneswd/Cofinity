import * as vscode from 'vscode';
import { createEventId, createMessageId, createRequestId } from '../../shared/ids';
import type { CofinityRequestInputResult } from '../cofinity-tool/cofinityToolResult';
import { Deferred } from './Deferred';
import { Mutex } from './Mutex';
import type {
  AutopilotState,
  PendingUserRequest,
  PromptQueueItem,
  SessionChatMessage,
  SessionEvent,
  SessionId,
  SessionRequestKind,
  SessionState
} from './sessionTypes';

export interface RunRequestOptions {
  question: string;
  requestKind: SessionRequestKind;
  options?: string[];
  token: vscode.CancellationToken;
}

export interface SessionRestoreState {
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

export class SessionController implements vscode.Disposable {
  private readonly onDidChangeStateEmitter = new vscode.EventEmitter<void>();
  private readonly mutex = new Mutex();

  private pendingResponse: Deferred<string> | null = null;
  private pendingCancellation: vscode.Disposable | null = null;

  private readonly sessionState: SessionState;

  constructor(sessionId: SessionId, title: string) {
    const now = Date.now();

    this.sessionState = {
      sessionId,
      createdAtMs: now,
      lastActiveAtMs: now,
      status: 'active',
      title,
      inflight: null,
      pendingRequest: null,
      promptQueue: [],
      chatMessages: [],
      autopilot: {
        mode: 'off',
        maxTurns: 20,
        turnsUsed: 0
      },
      history: [],
      stats: {
        toolCalls: 0,
        userResponses: 0,
        cancellations: 0
      }
    };
  }

  public get onDidChangeState(): vscode.Event<void> {
    return this.onDidChangeStateEmitter.event;
  }

  public get state(): SessionState {
    return this.sessionState;
  }

  public restore(summary: SessionRestoreState): void {
    this.sessionState.createdAtMs = summary.createdAtMs;
    this.sessionState.lastActiveAtMs = summary.lastActiveAtMs;
    this.sessionState.title = summary.title;
    this.sessionState.status = summary.status;
    this.sessionState.promptQueue = summary.promptQueue;
    this.sessionState.chatMessages = summary.chatMessages;
    this.sessionState.autopilot = summary.autopilot;
    this.sessionState.history = summary.history;
    this.sessionState.stats = summary.stats;
    this.sessionState.pendingRequest = null;
    this.sessionState.inflight = null;
  }

  public async runRequest(options: RunRequestOptions): Promise<CofinityRequestInputResult> {
    return this.mutex.runExclusive(async () => this.handleRequest(options));
  }

  public enqueuePrompt(content: string): void {
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    const chatMessageId = createMessageId();
    const item: PromptQueueItem = {
      itemId: createRequestId(),
      content: trimmed,
      source: 'user',
      chatMessageId,
      enqueuedAtMs: Date.now(),
      status: 'queued'
    };

    this.sessionState.promptQueue.push(item);
    this.touch('active');
    this.pushHistory('queueItemAdded', 'Queued a prompt for the next tool call.');
    this.onDidChangeStateEmitter.fire();
  }

  public updateQueuedPrompt(itemId: string, content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) {
      return false;
    }

    const queueItem = this.sessionState.promptQueue.find((item) => item.itemId === itemId);
    if (!queueItem) {
      return false;
    }

    queueItem.content = trimmed;
    this.updateChatMessageContent(queueItem.chatMessageId, trimmed);
    this.touch(this.sessionState.pendingRequest ? 'waitingForUser' : 'active');
    this.pushHistory('queueItemAdded', 'Edited a queued prompt.');
    this.onDidChangeStateEmitter.fire();
    return true;
  }

  public reorderQueuedPrompt(itemId: string, targetItemId: string): boolean {
    if (itemId === targetItemId) {
      return false;
    }

    const sourceIndex = this.sessionState.promptQueue.findIndex((item) => item.itemId === itemId);
    const targetIndex = this.sessionState.promptQueue.findIndex((item) => item.itemId === targetItemId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return false;
    }

    const nextQueue = [...this.sessionState.promptQueue];
    const [item] = nextQueue.splice(sourceIndex, 1);
    const normalizedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextQueue.splice(normalizedTargetIndex, 0, item);
    this.sessionState.promptQueue = nextQueue;
    this.touch(this.sessionState.pendingRequest ? 'waitingForUser' : 'active');
    this.pushHistory('queueItemAdded', 'Reordered queued prompts.');
    this.onDidChangeStateEmitter.fire();
    return true;
  }

  public clearQueue(): void {
    if (this.sessionState.promptQueue.length === 0) {
      return;
    }

    this.sessionState.promptQueue = [];
    this.touch(this.sessionState.pendingRequest ? 'waitingForUser' : 'active');
    this.pushHistory('queueItemReleased', 'Cleared all queued prompts.');
    this.onDidChangeStateEmitter.fire();
  }

  public setAutopilotEnabled(enabled: boolean): void {
    this.sessionState.autopilot.mode = enabled ? 'drainQueue' : 'off';
    this.sessionState.autopilot.maxTurns ??= 20;
    this.touch(this.sessionState.pendingRequest ? 'waitingForUser' : 'active');
    this.onDidChangeStateEmitter.fire();
  }

  public renameSession(newTitle: string): void {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      return;
    }
    this.sessionState.title = trimmed;
    this.onDidChangeStateEmitter.fire();
  }

  public setAutopilotMaxTurns(maxTurns: number): void {
    const normalized = Math.max(1, Math.min(100, Math.floor(maxTurns)));
    this.sessionState.autopilot.maxTurns = normalized;
    if (this.sessionState.autopilot.turnsUsed > normalized) {
      this.sessionState.autopilot.turnsUsed = normalized;
    }
    this.touch(this.sessionState.pendingRequest ? 'waitingForUser' : 'active');
    this.onDidChangeStateEmitter.fire();
  }

  public resolvePendingRequest(requestId: string, response: string): boolean {
    if (!this.sessionState.pendingRequest || !this.pendingResponse) {
      return false;
    }

    if (this.sessionState.pendingRequest.requestId !== requestId) {
      return false;
    }

    this.pendingResponse.resolve(response.trim());
    return true;
  }

  public dispose(): void {
    this.rejectPending(new Error('Session disposed.'));
    this.touch('disposed');
    this.onDidChangeStateEmitter.fire();
    this.onDidChangeStateEmitter.dispose();
  }

  private async handleRequest(options: RunRequestOptions): Promise<CofinityRequestInputResult> {
    this.sessionState.stats.toolCalls += 1;
    this.sessionState.inflight = {
      invocationId: createRequestId(),
      startedAtMs: Date.now(),
      cancelled: false
    };
    this.touch('running');
    this.pushHistory('toolInvoked', 'Invoked Cofinity request input.');
    this.onDidChangeStateEmitter.fire();

    try {
      if (this.autopilotLimitReached()) {
        this.pushHistory('autopilotUsed', 'Autopilot paused because the turn limit was reached.');
      } else {
        if (this.sessionState.promptQueue.length > 0) {
          this.appendChatMessage({
            messageId: createMessageId(),
            role: 'assistant',
            content: options.question.trim(),
            state: 'delivered',
            createdAtMs: Date.now()
          });
        }

        const queuedPrompt = this.takeQueuedPrompt();
        if (queuedPrompt) {
          const source = this.sessionState.autopilot.mode === 'drainQueue' ? 'autopilot' : 'queue';
          if (source === 'autopilot') {
            this.sessionState.autopilot.turnsUsed += 1;
            this.pushHistory('autopilotUsed', 'Autopilot drained the next queued prompt.');
          }

          return {
            sessionId: this.sessionState.sessionId,
            response: queuedPrompt.content,
            source,
            queuedRemaining: this.sessionState.promptQueue.length,
            waiting: false
          };
        }
      }

      return await this.awaitManualResponse(options);
    } finally {
      const wasCancelled = this.sessionState.inflight?.cancelled ?? false;
      this.sessionState.inflight = null;
      if (!this.sessionState.pendingRequest && this.sessionState.status !== 'disposed') {
        this.touch(wasCancelled ? 'interrupted' : 'active');
      }
      this.onDidChangeStateEmitter.fire();
    }
  }

  private async awaitManualResponse(options: RunRequestOptions): Promise<CofinityRequestInputResult> {
    if (this.sessionState.pendingRequest || this.pendingResponse) {
      throw new Error('Session is already waiting for user input.');
    }

    const pendingRequest: PendingUserRequest = {
      requestId: createRequestId(),
      prompt: options.question.trim(),
      kind: options.requestKind,
      options: options.options,
      createdAtMs: Date.now()
    };

    this.sessionState.pendingRequest = pendingRequest;
    this.appendChatMessage({
      messageId: createMessageId(),
      role: 'assistant',
      content: pendingRequest.prompt,
      state: 'pending',
      createdAtMs: pendingRequest.createdAtMs,
      relatedRequestId: pendingRequest.requestId
    });
    this.pendingResponse = new Deferred<string>();
    this.pendingCancellation = options.token.onCancellationRequested(() => {
      this.sessionState.stats.cancellations += 1;
      this.sessionState.inflight = this.sessionState.inflight
        ? {
            ...this.sessionState.inflight,
            cancelled: true
          }
        : null;
      this.rejectPending(new vscode.CancellationError());
    });

    this.touch('waitingForUser');
    this.pushHistory('pendingRequestCreated', 'Waiting for user input.');
    this.onDidChangeStateEmitter.fire();

    try {
      const response = await this.pendingResponse.promise;
      this.sessionState.stats.userResponses += 1;
      this.markRequestMessageResolved(pendingRequest.requestId);
      this.appendChatMessage({
        messageId: createMessageId(),
        role: 'user',
        content: response,
        state: 'delivered',
        createdAtMs: Date.now(),
        relatedRequestId: pendingRequest.requestId
      });
      this.pushHistory('userResponded', 'Resolved a pending user request.');

      return {
        sessionId: this.sessionState.sessionId,
        response,
        source: 'user',
        queuedRemaining: this.sessionState.promptQueue.length,
        waiting: false
      };
    } finally {
      this.pendingCancellation?.dispose();
      this.pendingCancellation = null;
      this.pendingResponse = null;
      this.sessionState.pendingRequest = null;
      this.onDidChangeStateEmitter.fire();
    }
  }

  private takeQueuedPrompt(): PromptQueueItem | undefined {
    const next = this.sessionState.promptQueue.shift();

    if (!next) {
      return undefined;
    }

    next.status = 'sentToModel';
    this.appendChatMessage({
      messageId: createMessageId(),
      role: 'user',
      content: next.content,
      state: 'delivered',
      createdAtMs: Date.now()
    });
    this.pushHistory('queueItemReleased', 'Released a queued prompt to the tool caller.');
    this.touch('active');
    return next;
  }

  private autopilotLimitReached(): boolean {
    if (this.sessionState.autopilot.mode !== 'drainQueue') {
      return false;
    }

    const maxTurns = this.sessionState.autopilot.maxTurns;
    if (!maxTurns) {
      return false;
    }

    return this.sessionState.autopilot.turnsUsed >= maxTurns;
  }

  private rejectPending(reason: Error): void {
    this.pendingResponse?.reject(reason);
    this.pendingCancellation?.dispose();
    this.pendingCancellation = null;
    this.pendingResponse = null;
    this.sessionState.pendingRequest = null;
  }

  private touch(status: SessionState['status']): void {
    this.sessionState.lastActiveAtMs = Date.now();
    this.sessionState.status = status;
  }

  private pushHistory(kind: SessionEvent['kind'], summary: string): void {
    const event: SessionEvent = {
      eventId: createEventId(),
      atMs: Date.now(),
      kind,
      summary
    };

    this.sessionState.history = [event, ...this.sessionState.history].slice(0, 50);
  }

  private appendChatMessage(message: SessionChatMessage): void {
    this.sessionState.chatMessages = [...this.sessionState.chatMessages, message].slice(-200);
  }

  private updateChatMessageState(messageId: string, state: SessionChatMessage['state']): void {
    this.sessionState.chatMessages = this.sessionState.chatMessages.map((message) => {
      if (message.messageId !== messageId) {
        return message;
      }

      return {
        ...message,
        state
      };
    });
  }

  private updateChatMessageContent(messageId: string, content: string): void {
    this.sessionState.chatMessages = this.sessionState.chatMessages.map((message) => {
      if (message.messageId !== messageId) {
        return message;
      }

      return {
        ...message,
        content
      };
    });
  }

  private markRequestMessageResolved(requestId: string): void {
    this.sessionState.chatMessages = this.sessionState.chatMessages.map((message) => {
      if (message.role !== 'assistant' || message.relatedRequestId !== requestId) {
        return message;
      }

      return {
        ...message,
        state: 'delivered'
      };
    });
  }
}
