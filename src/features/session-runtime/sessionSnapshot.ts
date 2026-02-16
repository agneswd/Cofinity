import type {
  PendingUserRequest,
  SessionId,
  SessionState,
  SessionStatus
} from './sessionTypes';

export interface QueuedPromptSnapshot {
  itemId: string;
  content: string;
  source: 'user' | 'system';
}

export interface SessionListItemSnapshot {
  sessionId: SessionId;
  title: string;
  status: SessionStatus;
  queuedCount: number;
  hasPendingRequest: boolean;
  lastActiveAtMs: number;
}

export interface SessionSnapshot {
  sessionId: SessionId;
  title: string;
  status: SessionStatus;
  queuedCount: number;
  queuedPrompts: QueuedPromptSnapshot[];
  pendingRequest: PendingUserRequest | null;
  autopilotMode: SessionState['autopilot']['mode'];
  lastActiveAtMs: number;
}

export interface SessionManagerSnapshot {
  selectedSessionId: SessionId | null;
  sessions: SessionListItemSnapshot[];
}

export function toSessionListItemSnapshot(state: SessionState): SessionListItemSnapshot {
  return {
    sessionId: state.sessionId,
    title: state.title,
    status: state.status,
    queuedCount: state.promptQueue.length,
    hasPendingRequest: state.pendingRequest !== null,
    lastActiveAtMs: state.lastActiveAtMs
  };
}

export function toSessionSnapshot(state: SessionState): SessionSnapshot {
  return {
    sessionId: state.sessionId,
    title: state.title,
    status: state.status,
    queuedCount: state.promptQueue.length,
    queuedPrompts: state.promptQueue.map((item) => ({
      itemId: item.itemId,
      content: item.content,
      source: item.source
    })),
    pendingRequest: state.pendingRequest,
    autopilotMode: state.autopilot.mode,
    lastActiveAtMs: state.lastActiveAtMs
  };
}
