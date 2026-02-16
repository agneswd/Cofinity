export class Deferred<T> {
  public readonly promise: Promise<T>;

  private resolveFn?: (value: T | PromiseLike<T>) => void;
  private rejectFn?: (reason?: unknown) => void;
  private settled = false;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });
  }

  public resolve(value: T): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.resolveFn?.(value);
  }

  public reject(reason?: unknown): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.rejectFn?.(reason);
  }
}
