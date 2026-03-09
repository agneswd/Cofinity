import type { AttachmentInfo } from '../session-runtime/sessionTypes';
import type { GlobalSettings } from '../global-settings/globalSettings';
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
  | ProtocolEnvelope<'globalSettings', GlobalSettings>
  | ProtocolEnvelope<'attachmentsAdded', { attachments: AttachmentInfo[] }>
  | ProtocolEnvelope<'imageSaved', { attachment: AttachmentInfo }>
  | ProtocolEnvelope<'error', { message: string }>
  | ProtocolEnvelope<'openSettings', Record<string, never>>;

export type WebviewToExtensionMessage =
  | ProtocolEnvelope<'uiReady', Record<string, never>>
  | ProtocolEnvelope<'newCopilotSession', Record<string, never>>
  | ProtocolEnvelope<'openExternal', { url: string }>
  | ProtocolEnvelope<'addAttachment', Record<string, never>>
  | ProtocolEnvelope<'selectSession', { sessionId: string | null }>
  | ProtocolEnvelope<'submitComposerInput', { content: string; attachments: AttachmentInfo[] }>
  | ProtocolEnvelope<'saveImage', { data: string; mimeType: string }>
  | ProtocolEnvelope<'removeDraftAttachment', { attachmentId: string; uri?: string; isTemporary?: boolean }>
  | ProtocolEnvelope<'updateQueuedPrompt', { itemId: string; content: string }>
  | ProtocolEnvelope<'removeQueuedPrompt', { itemId: string }>
  | ProtocolEnvelope<'reorderQueuedPrompt', { itemId: string; targetItemId: string }>
  | ProtocolEnvelope<'toggleAutopilot', { enabled: boolean }>
  | ProtocolEnvelope<'setAutopilotMaxTurns', { maxTurns: number }>
  | ProtocolEnvelope<'updateGlobalSettings', GlobalSettings>
  | ProtocolEnvelope<'renameSession', { newTitle: string }>
  | ProtocolEnvelope<'markSessionInterrupted', Record<string, never>>
  | ProtocolEnvelope<'disposeSession', Record<string, never>>
  | ProtocolEnvelope<'clearQueue', Record<string, never>>;
