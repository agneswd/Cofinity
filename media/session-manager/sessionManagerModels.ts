export type AttachmentInfo = {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  isTemporary?: boolean;
};

export type GlobalSettings = {
  notificationSoundEnabled: boolean;
  autoOpenView: 'off' | 'session' | 'global';
  autoQueuePrompts: boolean;
  enterSends: boolean;
  autopilotPrompts: string[];
  autopilotDelayMinMs: number;
  autopilotDelayMaxMs: number;
};

export type SessionListItem = {
  sessionId: string;
  title: string;
  status: string;
  queuedCount: number;
  hasPendingRequest: boolean;
  pendingRequest: null | {
    requestId: string;
    prompt: string;
    kind: string;
    options?: string[];
    createdAtMs: number;
  };
  toolCalls: number;
  lastActiveAtMs: number;
};

export type SessionChatMessage = {
  messageId: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  attachments?: AttachmentInfo[];
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
    attachments?: AttachmentInfo[];
  }>;
  chatMessages: SessionChatMessage[];
  pendingRequest: null | {
    requestId: string;
    prompt: string;
    kind: string;
    options?: string[];
    createdAtMs: number;
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
  | { type: 'globalSettings'; payload: GlobalSettings }
  | { type: 'setViewMode'; payload: { mode: 'session' | 'global' } }
  | { type: 'attachmentsAdded'; payload: { attachments: AttachmentInfo[] } }
  | { type: 'imageSaved'; payload: { attachment: AttachmentInfo } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'openSettings'; payload: Record<string, never> };
