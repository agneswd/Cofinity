import type { SessionSnapshot, SessionManagerSnapshot } from '../session-runtime/sessionSnapshot';

export const SESSION_MANAGER_PROTOCOL_VERSION = 1 as const;

export interface ProtocolEnvelope<TType extends string, TPayload> {
  protocolVersion: typeof SESSION_MANAGER_PROTOCOL_VERSION;
  type: TType;
  requestId?: string;
  sessionId?: string;
  payload: TPayload;
}

export type ExtensionToWebviewMessage =
  | ProtocolEnvelope<'sessionsSnapshot', SessionManagerSnapshot>
  | ProtocolEnvelope<'sessionSnapshot', { session: SessionSnapshot | null }>
  | ProtocolEnvelope<'error', { message: string }>;

export type WebviewToExtensionMessage =
  | ProtocolEnvelope<'uiReady', Record<string, never>>
  | ProtocolEnvelope<'selectSession', { sessionId: string | null }>
  | ProtocolEnvelope<'submitComposerInput', { content: string }>
  | ProtocolEnvelope<'toggleAutopilot', { enabled: boolean }>
  | ProtocolEnvelope<'setAutopilotMaxTurns', { maxTurns: number }>
  | ProtocolEnvelope<'updateSessionSettings', { notificationSoundEnabled: boolean; autoQueuePrompts: boolean }>
  | ProtocolEnvelope<'disposeSession', Record<string, never>>
  | ProtocolEnvelope<'clearQueue', Record<string, never>>;
