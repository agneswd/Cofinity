import {
  SESSION_MANAGER_PROTOCOL_VERSION,
  type WebviewToExtensionMessage
} from './sessionManagerProtocol';

export function isWebviewToExtensionMessage(value: unknown): value is WebviewToExtensionMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate.protocolVersion !== SESSION_MANAGER_PROTOCOL_VERSION) {
    return false;
  }

  if (typeof candidate.type !== 'string') {
    return false;
  }

  if (!('payload' in candidate)) {
    return false;
  }

  return true;
}

export function isUiReadyMessage(value: WebviewToExtensionMessage): boolean {
  return value.type === 'uiReady';
}
