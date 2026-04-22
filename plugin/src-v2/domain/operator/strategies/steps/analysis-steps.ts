import {
  Result, ResultUtils,
} from '@plugin-v2/domain/shared/types/result.type';
import {
  SimulateFailedError,
  OnBoardFailedError,
  SanitizerFailedError,
} from '../../errors/operator.error';
import { CommandGeneratorService } from '../../services/command-generator.service';
import {
  ExecutionContext, IExecutionStep,
} from '../execution-step.interface';

/**
 * Simulation analysis step
 */
export class SimulateStep implements IExecutionStep {
  readonly name = 'Simulate';

  constructor(private commandGenerator: CommandGeneratorService) {}

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const command = this.commandGenerator.generateSimulateCommand(
      context.primaryConfigId,
      context.exampleConfigId,
    );

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new SimulateFailedError('执行仿真分析失败', {
        command,
        exitCode: result.code,
        output: result.output,
      }));
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * On-board analysis step
 */
export class OnBoardStep implements IExecutionStep {
  readonly name = 'OnBoard';

  constructor(private commandGenerator: CommandGeneratorService) {}

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const command = this.commandGenerator.generateOnBoardCommand(
      context.primaryConfigId,
      context.exampleConfigId,
    );

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new OnBoardFailedError('执行上板分析失败', {
        command,
        exitCode: result.code,
        output: result.output,
      }));
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * Sanitizer (anomaly detection) step
 */
export class SanitizerStep implements IExecutionStep {
  readonly name = 'Sanitizer';

  constructor(private commandGenerator: CommandGeneratorService) {}

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const command = this.commandGenerator.generateSanitizerCommand(
      context.primaryConfigId,
      context.exampleConfigId,
    );

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new SanitizerFailedError('异常检测失败', {
        command,
        exitCode: result.code,
        output: result.output,
      }));
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * Run step
 */
export class RunStep implements IExecutionStep {
  readonly name = 'Run';

  constructor(private commandGenerator: CommandGeneratorService) {}

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const command = this.commandGenerator.generateRunCommand(context.primaryConfigId);

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new Error('运行失败')); // Could add RunFailedError
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}
