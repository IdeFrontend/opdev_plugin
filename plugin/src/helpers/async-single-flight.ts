/**
 * Coalesces concurrent async work into one shared promise (single-flight).
 * Callers pass one lambda: `flight.run(() => work())`.
 */
export class AsyncSingleFlight<T = void> {
  private inFlight?: Promise<T>;

  run(task: () => Promise<T>): Promise<T> {
    if (!this.inFlight) {
      this.inFlight = task().finally(() => {
        this.inFlight = undefined;
      });
    }

    return this.inFlight;
  }

  get pending(): Promise<T> | undefined {
    return this.inFlight;
  }

  /** @internal */
  reset(): void {
    this.inFlight = undefined;
  }
}
