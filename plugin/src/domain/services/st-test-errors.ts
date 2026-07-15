export class StTestCancelledError extends Error {
  constructor() {
    super('ST test cancelled');
    this.name = 'StTestCancelledError';
  }
}

export function isStTestCancelledError(error: unknown): error is StTestCancelledError {
  return error instanceof StTestCancelledError
    || (error instanceof Error && error.name === 'StTestCancelledError');
}
