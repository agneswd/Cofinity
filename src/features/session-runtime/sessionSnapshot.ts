import type {
  PendingUserRequest,
  SessionChatMessage,
  SessionId,
  SessionEvent,
  SessionSettings,
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
  toolCalls: number;
  notificationSoundEnabled: boolean;
  autoRevealEnabled: boolean;
  lastActiveAtMs: number;
}

export interface SessionSnapshot {
  sessionId: SessionId;
  title: string;
  status: SessionStatus;
  queuedCount: number;
  queuedPrompts: QueuedPromptSnapshot[];
  chatMessages: SessionChatMessage[];
  pendingRequest: PendingUserRequest | null;
  settings: SessionSettings;
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
    hasPendingRequest: state.pendingRequest !== null,
    toolCalls: state.stats.toolCalls,
    notificationSoundEnabled: state.settings.notificationSoundEnabled,
    autoRevealEnabled: state.settings.autoRevealEnabled,
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
    chatMessages: state.chatMessages,
    pendingRequest: state.pendingRequest,
    settings: state.settings,
    autopilotMode: state.autopilot.mode,
    autopilotTurnsUsed: state.autopilot.turnsUsed,
    autopilotMaxTurns: state.autopilot.maxTurns,
    history: state.history,
    stats: state.stats,
    lastActiveAtMs: state.lastActiveAtMs
  };
}
