import {
  Result, ResultUtils,
} from '@plugin-v2/domain/shared/types/result.type';
import { BuildFailedError } from '../../errors/operator.error';
import { CommandGeneratorService } from '../../services/command-generator.service';
import {
  ExecutionContext, IExecutionStep,
} from '../execution-step.interface';

/**
 * 通用构建步骤
 * 可配置编译参数
 */
export class BuildStep implements IExecutionStep {
  readonly name: string;

  constructor(
    private commandGenerator: CommandGeneratorService,
    private compileOptions?: string,
    stepName: string = 'Build',
  ) {
    this.name = stepName;
  }

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const command = this.commandGenerator.generateBuildCommand(
      context.buildConfigId,
      this.compileOptions,
    );

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new BuildFailedError(`${this.name}失败`, {
        command,
        exitCode: result.code,
        output: result.output,
        phase: this.name.toLowerCase(),
      }));
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * 带仿真器参数的构建步骤
 */
export class BuildWithSimulatorStep implements IExecutionStep {
  readonly name = 'BuildWithSimulator';

  constructor(private commandGenerator: CommandGeneratorService) {}

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const simulatorType = (context.parameters?.simulatorType as string) || '';

    const command = this.commandGenerator.generateBuildWithSimulatorCommand(
      context.buildConfigId,
      simulatorType,
    );

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new BuildFailedError('仿真前编译失败', {
        command,
        exitCode: result.code,
        output: result.output,
        phase: 'pre-simulate-build',
      }));
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * 上板前构建步骤 (带 onboard 参数)
 */
export class BuildForOnBoardStep implements IExecutionStep {
  readonly name = 'BuildForOnBoard';

  constructor(private commandGenerator: CommandGeneratorService) {}

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const command = this.commandGenerator.generateBuildForOnBoardCommand(context.buildConfigId);

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new BuildFailedError('上板前编译失败', {
        command,
        exitCode: result.code,
        output: result.output,
        phase: 'pre-onboard-build',
      }));
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * 异常检测前构建步骤 (带 --mssanitizer 参数)
 */
export class BuildForSanitizerStep implements IExecutionStep {
  readonly name = 'BuildForSanitizer';

  constructor(private commandGenerator: CommandGeneratorService) {}

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const command = this.commandGenerator.generateBuildForSanitizerCommand(context.buildConfigId);

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new BuildFailedError('异常检测前编译失败', {
        command,
        exitCode: result.code,
        output: result.output,
        phase: 'pre-sanitizer-build',
      }));
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}
