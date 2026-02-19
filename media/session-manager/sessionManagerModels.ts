export type SessionListItem = {
  sessionId: string;
  title: string;
  status: string;
  queuedCount: number;
  hasPendingRequest: boolean;
  toolCalls: number;
  notificationSoundEnabled: boolean;
  lastActiveAtMs: number;
};

export type SessionChatMessage = {
  messageId: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  state: 'pending' | 'queued' | 'delivered' | 'skipped';
  createdAtMs: number;
  relatedRequestId?: string;
};

export type SessionSnapshot = {
  sessionId: string;
  title: string;
  status: string;
  queuedCount: number;
  queuedPrompts: Array<{
    itemId: string;
    content: string;
    source: 'user' | 'system';
  }>;
  chatMessages: SessionChatMessage[];
  pendingRequest: null | {
    requestId: string;
    prompt: string;
    kind: string;
    options?: string[];
    createdAtMs: number;
  };
  settings: {
    notificationSoundEnabled: boolean;
    autoQueuePrompts: boolean;
    enterSends: boolean;
  };
  autopilotMode: 'off' | 'drainQueue';
  autopilotTurnsUsed: number;
  autopilotMaxTurns?: number;
  history: Array<{
    eventId: string;
    atMs: number;
    kind: string;
    summary: string;
  }>;
  stats: {
    toolCalls: number;
    userResponses: number;
    cancellations: number;
  };
  lastActiveAtMs: number;
};

export type SessionsSnapshotPayload = {
  selectedSessionId: string | null;
  sessions: SessionListItem[];
};

export type SessionSnapshotPayload = {
  session: SessionSnapshot | null;
};

export type ExtensionMessage =
  | { type: 'sessionsSnapshot'; payload: SessionsSnapshotPayload }
  | { type: 'sessionSnapshot'; payload: SessionSnapshotPayload }
  | { type: 'error'; payload: { message: string } }
  | { type: 'openSettings'; payload: Record<string, never> };
