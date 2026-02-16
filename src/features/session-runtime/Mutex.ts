export class Mutex {
  private current: Promise<void> = Promise.resolve();

  public async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;

    const previous = this.current;
    this.current = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await task();
    } finally {
      release();
    }
  }
}
