import { DomainError } from '@plugin-v2/domain/shared/errors/base.error';

/**
 * Build failed error
 */
export class BuildFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BUILD_FAILED', context);
  }
}

/**
 * Invalid compile option error
 */
export class InvalidCompileOptionError extends DomainError {
  constructor(option: string, context?: Record<string, unknown>) {
    super(`无效的编译选项: ${option}`, 'INVALID_COMPILE_OPTION', {
      option,
      ...context,
    });
  }
}

/**
 * Command execution error
 */
export class CommandExecutionError extends DomainError {
  constructor(
    command: string,
    exitCode: number,
    output: string,
    context?: Record<string, unknown>,
  ) {
    super(`命令执行失败: ${command}`, 'COMMAND_EXECUTION_FAILED', {
      command,
      exitCode,
      output,
      ...context,
    });
  }
}

/**
 * Run failed error
 */
export class RunFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'RUN_FAILED', context);
  }
}

/**
 * Simulate failed error
 */
export class SimulateFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SIMULATE_FAILED', context);
  }
}

/**
 * On-board failed error
 */
export class OnBoardFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ON_BOARD_FAILED', context);
  }
}

/**
 * Sanitizer (anomaly detection) failed error
 */
export class SanitizerFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SANITIZER_FAILED', context);
  }
}
