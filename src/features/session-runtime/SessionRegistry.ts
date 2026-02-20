import * as vscode from 'vscode';
import { createSessionId } from '../../shared/ids';
import type { CofinityRequestInputResult } from '../cofinity-tool/cofinityToolResult';
import type { PersistedSessionRecord } from './storage/SessionPersistence';
import {
  toSessionListItemSnapshot,
  toSessionSnapshot,
  type SessionManagerSnapshot,
  type SessionSnapshot
} from './sessionSnapshot';
import { SessionController, type SessionRestoreState } from './SessionController';
import { SessionTokenRouter } from './SessionTokenRouter';
import type { SessionId, SessionRequestKind } from './sessionTypes';

export interface HandleToolInvocationOptions {
  sessionId?: string;
  question: string;
  requestKind: SessionRequestKind;
  options?: string[];
  token: vscode.CancellationToken;
  toolInvocationToken?: unknown;
}

function deriveSessionTitle(question: string): string {
  const compact = question.trim().replace(/\s+/g, ' ');

  if (!compact) {
    return 'New Session';
  }

  if (compact.length <= 48) {
    return compact;
  }

  return `${compact.slice(0, 45)}...`;
}

export class SessionRegistry implements vscode.Disposable {
  private readonly onDidChangeStateEmitter = new vscode.EventEmitter<void>();
  private readonly controllers = new Map<SessionId, SessionController>();
  private readonly controllerDisposables = new Map<SessionId, vscode.Disposable>();
  private readonly tokenRouter = new SessionTokenRouter();

  private selectedSessionId: SessionId | null = null;

  public get onDidChangeState(): vscode.Event<void> {
    return this.onDidChangeStateEmitter.event;
  }

  public async handleToolInvocation(
    options: HandleToolInvocationOptions
  ): Promise<CofinityRequestInputResult> {
    const controller = this.resolveOrCreateSession(
      options.sessionId,
      options.toolInvocationToken,
      deriveSessionTitle(options.question)
    );

    return controller.runRequest({
      question: options.question,
      requestKind: options.requestKind,
      options: options.options,
      token: options.token
    });
  }

  public buildManagerSnapshot(): SessionManagerSnapshot {
    const sessions = Array.from(this.controllers.values())
      .map((controller) => controller.state)
      .sort((left, right) => right.lastActiveAtMs - left.lastActiveAtMs)
      .map((state) => toSessionListItemSnapshot(state));

    return {
      selectedSessionId: this.selectedSessionId,
      sessions
    };
  }

  public getSelectedSessionSnapshot(): SessionSnapshot | null {
    if (!this.selectedSessionId) {
      return null;
    }

    const controller = this.controllers.get(this.selectedSessionId);
    return controller ? toSessionSnapshot(controller.state) : null;
  }

  public getSessionSnapshot(sessionId: SessionId): SessionSnapshot | null {
    const controller = this.controllers.get(sessionId);
    return controller ? toSessionSnapshot(controller.state) : null;
  }

  public selectSession(sessionId: SessionId | null): void {
    if (sessionId !== null && !this.controllers.has(sessionId)) {
      return;
    }

    this.selectedSessionId = sessionId;
    this.onDidChangeStateEmitter.fire();
  }

  public respondToPendingRequest(sessionId: SessionId, requestId: string, response: string): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    return controller.resolvePendingRequest(requestId, response);
  }

  public enqueuePrompt(sessionId: SessionId, content: string): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    controller.enqueuePrompt(content);
    return true;
  }

  public updateQueuedPrompt(sessionId: SessionId, itemId: string, content: string): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    return controller.updateQueuedPrompt(itemId, content);
  }

  public reorderQueuedPrompt(sessionId: SessionId, itemId: string, targetItemId: string): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    return controller.reorderQueuedPrompt(itemId, targetItemId);
  }

  public clearQueue(sessionId: SessionId): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    controller.clearQueue();
    return true;
  }

  public setAutopilotEnabled(sessionId: SessionId, enabled: boolean): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    controller.setAutopilotEnabled(enabled);
    return true;
  }

  public setAutopilotMaxTurns(sessionId: SessionId, maxTurns: number): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    controller.setAutopilotMaxTurns(maxTurns);
    return true;
  }

  public renameSession(sessionId: SessionId, newTitle: string): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    controller.renameSession(newTitle);
    return true;
  }

  public disposeSession(sessionId: SessionId): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    this.controllerDisposables.get(sessionId)?.dispose();
    this.controllerDisposables.delete(sessionId);
    controller.dispose();
    this.controllers.delete(sessionId);

    if (this.selectedSessionId === sessionId) {
      const nextSession = this.buildManagerSnapshot().sessions[0]?.sessionId ?? null;
      this.selectedSessionId = nextSession;
    }

    this.onDidChangeStateEmitter.fire();
    return true;
  }

  public disposeIdleSessions(maxIdleMs: number): number {
    const now = Date.now();
    const disposableIds: SessionId[] = [];

    for (const [sessionId, controller] of this.controllers.entries()) {
      const { state } = controller;

      if (state.pendingRequest || state.inflight) {
        continue;
      }

      if (now - state.lastActiveAtMs < maxIdleMs) {
        continue;
      }

      disposableIds.push(sessionId);
    }

    for (const sessionId of disposableIds) {
      this.disposeSession(sessionId);
    }

    return disposableIds.length;
  }

  public exportPersistedSessions(): PersistedSessionRecord[] {
    return Array.from(this.controllers.values())
      .map((controller) => controller.state)
      .filter((state) => state.status !== 'disposed')
      .map((state) => ({
        sessionId: state.sessionId,
        createdAtMs: state.createdAtMs,
        lastActiveAtMs: state.lastActiveAtMs,
        title: state.title,
        status: state.status,
        promptQueue: state.promptQueue,
        chatMessages: state.chatMessages,
        autopilot: state.autopilot,
        history: state.history,
        stats: state.stats
      }));
  }

  public restoreSessions(records: PersistedSessionRecord[]): void {
    for (const record of records) {
      if (this.controllers.has(record.sessionId)) {
        continue;
      }

      const controller = new SessionController(record.sessionId, record.title);
      controller.restore(this.toRestoreState(record));

      const disposable = controller.onDidChangeState(() => {
        this.onDidChangeStateEmitter.fire();
      });

      this.controllers.set(record.sessionId, controller);
      this.controllerDisposables.set(record.sessionId, disposable);
    }

    if (!this.selectedSessionId) {
      this.selectedSessionId = this.buildManagerSnapshot().sessions[0]?.sessionId ?? null;
    }

    this.onDidChangeStateEmitter.fire();
  }

  public dispose(): void {
    for (const disposable of this.controllerDisposables.values()) {
      disposable.dispose();
    }

    for (const controller of this.controllers.values()) {
      controller.dispose();
    }

    this.controllerDisposables.clear();
    this.controllers.clear();
    this.onDidChangeStateEmitter.dispose();
  }

  private resolveOrCreateSession(
    requestedSessionId: SessionId | undefined,
    toolInvocationToken: unknown,
    title: string
  ): SessionController {
    const resolvedByRequest = requestedSessionId ? this.controllers.get(requestedSessionId) : undefined;
    if (resolvedByRequest) {
      this.tokenRouter.attach(toolInvocationToken, resolvedByRequest.state.sessionId);
      this.ensureSelection(resolvedByRequest.state.sessionId);
      return resolvedByRequest;
    }

    const resolvedTokenSessionId = this.tokenRouter.resolve(toolInvocationToken);
    if (resolvedTokenSessionId) {
      const resolvedByToken = this.controllers.get(resolvedTokenSessionId);
      if (resolvedByToken) {
        this.tokenRouter.attach(toolInvocationToken, resolvedByToken.state.sessionId);
        this.ensureSelection(resolvedByToken.state.sessionId);
        return resolvedByToken;
      }
    }

    const sessionId = requestedSessionId ?? createSessionId();
    const controller = new SessionController(sessionId, title);
    const disposable = controller.onDidChangeState(() => {
      this.onDidChangeStateEmitter.fire();
    });

    this.controllers.set(sessionId, controller);
    this.controllerDisposables.set(sessionId, disposable);
    this.tokenRouter.attach(toolInvocationToken, sessionId);
    this.ensureSelection(sessionId);
    this.onDidChangeStateEmitter.fire();

    return controller;
  }

  private ensureSelection(sessionId: SessionId): void {
    if (this.selectedSessionId) {
      return;
    }

    this.selectedSessionId = sessionId;
  }

  private toRestoreState(record: PersistedSessionRecord): SessionRestoreState {
    return {
      createdAtMs: record.createdAtMs,
      lastActiveAtMs: record.lastActiveAtMs,
      title: record.title,
      status: record.status,
      promptQueue: record.promptQueue,
      chatMessages: record.chatMessages,
      autopilot: record.autopilot,
      history: record.history,
      stats: record.stats
    };
  }
}
