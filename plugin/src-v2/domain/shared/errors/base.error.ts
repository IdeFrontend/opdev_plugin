/**
 * 基础领域错误类
 * 所有业务错误都应继承此类
 */
export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;

    // 保持正确的原型链
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * 转换为可序列化的对象
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * 配置相关错误
 */
export class ConfigError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
  }
}

/**
 * 配置不存在错误
 */
export class ConfigNotFoundError extends DomainError {
  constructor(configType: string, context?: Record<string, unknown>) {
    super(`配置不存在: ${configType}`, 'CONFIG_NOT_FOUND', {
      configType,
      ...context,
    });
  }
}
