export function createSessionId(): string {
  return `session_${crypto.randomUUID()}`;
}

export function createRequestId(): string {
  return `request_${crypto.randomUUID()}`;
}

export function createEventId(): string {
  return `event_${crypto.randomUUID()}`;
}
