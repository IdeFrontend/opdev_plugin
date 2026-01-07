/**
 * Result 类型 - 函数式错误处理
 * 用于替代 try-catch,使错误处理更加显式和类型安全
 */
export type Result<T, E = Error> =
  | { ok: true;
    value: T }
    | { ok: false;
      error: E };

/**
 * Result 工具函数
 */
export const ResultUtils = {
  /**
   * 创建成功结果
   */
  ok: <T>(value: T): Result<T, never> => ({
    ok: true,
    value,
  }),

  /**
   * 创建失败结果
   */
  err: <E>(error: E): Result<never, E> => ({
    ok: false,
    error,
  }),

  /**
   * 判断是否为成功结果
   */
  isOk: <T, E>(result: Result<T, E>): result is { ok: true;
    value: T } => result.ok,

  /**
   * 判断是否为失败结果
   */
  isErr: <T, E>(result: Result<T, E>): result is { ok: false;
    error: E } => !result.ok,

  /**
   * 从 Result 中提取值,如果是错误则抛出异常
   */
  unwrap: <T, E>(result: Result<T, E>): T => {
    if (result.ok) {
      return result.value;
    }

    throw result.error;
  },

  /**
   * 从 Result 中提取值,如果是错误则返回默认值
   */
  unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T => {
    return result.ok ? result.value : defaultValue;
  },

  /**
   * 映射成功值
   */
  map: <T, U, E>(result: Result<T, E>, fn: (value: T)=> U): Result<U, E> => {
    return result.ok ? ResultUtils.ok(fn(result.value)) : result;
  },

  /**
   * 映射错误值
   */
  mapErr: <T, E, F>(result: Result<T, E>, fn: (error: E)=> F): Result<T, F> => {
    return result.ok ? result : ResultUtils.err(fn(result.error));
  },
};
