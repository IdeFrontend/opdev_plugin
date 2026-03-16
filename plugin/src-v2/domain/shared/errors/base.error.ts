/**
 * Base domain error class
 * All business errors should extend this
 */
export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;

    // Preserve prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert to serializable object
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
 * Config-related error
 */
export class ConfigError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
  }
}

/**
 * Config not found error
 */
export class ConfigNotFoundError extends DomainError {
  constructor(configType: string, context?: Record<string, unknown>) {
    super(`配置不存在: ${configType}`, 'CONFIG_NOT_FOUND', {
      configType,
      ...context,
    });
  }
}
