import type { SessionId } from './sessionTypes';

function asTokenObject(token: unknown): object | undefined {
  if (!token || typeof token !== 'object') {
    return undefined;
  }

  return token;
}

export class SessionTokenRouter {
  private readonly tokenToSessionId = new WeakMap<object, SessionId>();

  public attach(token: unknown, sessionId: SessionId): void {
    const tokenObject = asTokenObject(token);

    if (!tokenObject) {
      return;
    }

    this.tokenToSessionId.set(tokenObject, sessionId);
  }

  public resolve(token: unknown): SessionId | undefined {
    const tokenObject = asTokenObject(token);

    if (!tokenObject) {
      return undefined;
    }

    return this.tokenToSessionId.get(tokenObject);
  }
}
