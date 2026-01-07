import { DomainError } from '@plugin-v2/domain/shared/errors/base.error';

/**
 * 构建失败错误
 */
export class BuildFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BUILD_FAILED', context);
  }
}

/**
 * 编译选项无效错误
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
 * 命令执行错误
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
 * 运行失败错误
 */
export class RunFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'RUN_FAILED', context);
  }
}

/**
 * 仿真失败错误
 */
export class SimulateFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SIMULATE_FAILED', context);
  }
}

/**
 * 上板失败错误
 */
export class OnBoardFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ON_BOARD_FAILED', context);
  }
}

/**
 * 异常检测失败错误
 */
export class SanitizerFailedError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SANITIZER_FAILED', context);
  }
}
