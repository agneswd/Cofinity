export type SessionId = string;

export interface AttachmentInfo {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  isTemporary?: boolean;
}

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
  chatMessageId: string;
  attachments?: AttachmentInfo[];
  enqueuedAtMs: number;
  status: 'queued' | 'sentToModel' | 'skipped';
}

export type SessionChatMessageRole = 'assistant' | 'user' | 'system';
export type SessionChatMessageState = 'pending' | 'queued' | 'delivered' | 'skipped';

export interface SessionChatMessage {
  messageId: string;
  role: SessionChatMessageRole;
  content: string;
  attachments?: AttachmentInfo[];
  state: SessionChatMessageState;
  createdAtMs: number;
  relatedRequestId?: string;
}

export interface AutopilotState {
  mode: 'off' | 'drainQueue';
  maxTurns?: number;
  turnsUsed: number;
  cooldownUntilMs?: number;
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
  chatMessages: SessionChatMessage[];
  autopilot: AutopilotState;
  history: SessionEvent[];
  stats: {
    toolCalls: number;
    userResponses: number;
    cancellations: number;
  };
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
