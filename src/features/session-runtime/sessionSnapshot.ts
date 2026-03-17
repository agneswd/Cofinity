import type {
  AttachmentInfo,
  PendingUserRequest,
  SessionChatMessage,
  SessionId,
  SessionEvent,
  SessionState,
  SessionStatus
} from './sessionTypes';

export interface QueuedPromptSnapshot {
  itemId: string;
  content: string;
  source: 'user' | 'system';
  attachments?: AttachmentInfo[];
}

export interface SessionListItemSnapshot {
  sessionId: SessionId;
  title: string;
  status: SessionStatus;
  queuedCount: number;
  awaitingAgentResponse: boolean;
  hasPendingRequest: boolean;
  pendingRequest: PendingUserRequest | null;
  toolCalls: number;
  lastActiveAtMs: number;
}

export interface SessionSnapshot {
  sessionId: SessionId;
  title: string;
  status: SessionStatus;
  queuedCount: number;
  queuedPrompts: QueuedPromptSnapshot[];
  chatMessages: SessionChatMessage[];
  awaitingAgentResponse: boolean;
  pendingRequest: PendingUserRequest | null;
  autopilotMode: SessionState['autopilot']['mode'];
  autopilotTurnsUsed: number;
  autopilotMaxTurns?: number;
  history: SessionEvent[];
  stats: SessionState['stats'];
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
    awaitingAgentResponse: state.awaitingAgentResponse,
    hasPendingRequest: state.pendingRequest !== null,
    pendingRequest: state.pendingRequest,
    toolCalls: state.stats.toolCalls,
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
      source: item.source,
      attachments: item.attachments
    })),
    chatMessages: state.chatMessages,
    awaitingAgentResponse: state.awaitingAgentResponse,
    pendingRequest: state.pendingRequest,
    autopilotMode: state.autopilot.mode,
    autopilotTurnsUsed: state.autopilot.turnsUsed,
    autopilotMaxTurns: state.autopilot.maxTurns,
    history: state.history,
    stats: state.stats,
    lastActiveAtMs: state.lastActiveAtMs
  };
}
