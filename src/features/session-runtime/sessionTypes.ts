export type SessionId = string;

export type SessionStatus =
  | 'active'
  | 'waitingForUser'
  | 'running'
  | 'paused'
  | 'error'
  | 'disposed'
  | 'interrupted';

export type SessionRequestKind = 'question' | 'approval' | 'pick' | 'freeform';

export interface PromptQueueItem {
  itemId: string;
  content: string;
  source: 'user' | 'system';
  enqueuedAtMs: number;
  status: 'queued' | 'sentToModel' | 'skipped';
}

export interface AutopilotState {
  mode: 'off' | 'drainQueue';
  maxTurns?: number;
  turnsUsed: number;
  cooldownUntilMs?: number;
}

export interface SessionEvent {
  eventId: string;
  atMs: number;
  kind:
    | 'toolInvoked'
    | 'pendingRequestCreated'
    | 'userResponded'
    | 'queueItemAdded'
    | 'queueItemReleased'
    | 'autopilotUsed'
    | 'cancelled'
    | 'error';
  summary: string;
}

export interface PendingUserRequest {
  requestId: string;
  prompt: string;
  kind: SessionRequestKind;
  options?: string[];
  createdAtMs: number;
}

export interface InflightInvocation {
  invocationId: string;
  startedAtMs: number;
  cancelled: boolean;
}

export interface SessionState {
  sessionId: SessionId;
  createdAtMs: number;
  lastActiveAtMs: number;
  status: SessionStatus;
  title: string;
  inflight: InflightInvocation | null;
  pendingRequest: PendingUserRequest | null;
  promptQueue: PromptQueueItem[];
  autopilot: AutopilotState;
  history: SessionEvent[];
  stats: {
    toolCalls: number;
    userResponses: number;
    cancellations: number;
  };
}
