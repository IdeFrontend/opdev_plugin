/**
 * Result type - functional error handling
 * Replaces try-catch with explicit, type-safe error handling
 */
export type Result<T, E = Error> =
  | { ok: true;
    value: T }
    | { ok: false;
      error: E };

/**
 * Result utility functions
 */
export const ResultUtils = {
  /**
   * Create success result
   */
  ok: <T>(value: T): Result<T, never> => ({
    ok: true,
    value,
  }),

  /**
   * Create failure result
   */
  err: <E>(error: E): Result<never, E> => ({
    ok: false,
    error,
  }),

  /**
   * Check if result is success
   */
  isOk: <T, E>(result: Result<T, E>): result is { ok: true;
    value: T } => result.ok,

  /**
   * Check if result is failure
   */
  isErr: <T, E>(result: Result<T, E>): result is { ok: false;
    error: E } => !result.ok,

  /**
   * Extract value from Result; throws if error
   */
  unwrap: <T, E>(result: Result<T, E>): T => {
    if (result.ok) {
      return result.value;
    }

    throw result.error;
  },

  /**
   * Extract value from Result; return default if error
   */
  unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T => {
    return result.ok ? result.value : defaultValue;
  },

  /**
   * Map success value
   */
  map: <T, U, E>(result: Result<T, E>, fn: (value: T)=> U): Result<U, E> => {
    return result.ok ? ResultUtils.ok(fn(result.value)) : result;
  },

  /**
   * Map error value
   */
  mapErr: <T, E, F>(result: Result<T, E>, fn: (error: E)=> F): Result<T, F> => {
    return result.ok ? result : ResultUtils.err(fn(result.error));
  },
};
