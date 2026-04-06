import {
  Result, ResultUtils,
} from '@plugin-v2/domain/shared/types/result.type';
import { notifyBuildSucceededForSidebar } from '@plugin/service/build-service';
import { BuildFailedError } from '../../errors/operator.error';
import { CommandGeneratorService } from '../../services/command-generator.service';
import {
  ExecutionContext, IExecutionStep,
} from '../execution-step.interface';

/**
 * Generic build step
 * Supports configurable compile options
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

  /**
   * Skip if the operator plugin declares no build is required before analysis.
   * False for pyasc — it runs Python files directly.
   */
  canSkip(context: ExecutionContext): boolean {
    return context.opPlugin !== undefined
      && !context.opPlugin.buildBehavior.requiresBuildBeforeAnalysis;
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

    const operatorNames = context.parameters?.operatorNames as string | undefined;
    await notifyBuildSucceededForSidebar(context.buildConfigId, operatorNames);

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * Active file check step
 * For operator types like pyasc that require an active file in the editor.
 * This step is a no-op in V2 strategy context (the check happens in the controller);
 * the canSkip logic is provided so strategies accurately reflect the required steps.
 */
export class ActiveFileCheckStep implements IExecutionStep {
  readonly name = 'ActiveFileCheck';

  canSkip(context: ExecutionContext): boolean {
    // Skip for types that don't require an active file (ascend, cann, etc.)
    return !context.opPlugin?.buildBehavior.requiresActiveFileCheck;
  }

  async execute(_context: ExecutionContext): Promise<Result<unknown, Error>> {
    // Active file validation is handled at the controller/service layer before
    // the strategy executes. This step is a marker for step composition clarity.
    return ResultUtils.ok({ skipped: true });
  }
}

/**
 * Example build step
 * Required before analysis for STANDARD_CUSTOM projects.
 * Whether this step runs is determined by the project type, not the operator type.
 */
export class ExampleBuildStep implements IExecutionStep {
  readonly name = 'ExampleBuild';

  constructor(private commandGenerator: CommandGeneratorService, private compileOptions?: string) {}

  /**
   * Skip for non-STANDARD_CUSTOM projects.
   * requiresExampleBuildForAnalysis is a project-level concern — not on IOperatorPlugin.buildBehavior.
   */
  canSkip(context: ExecutionContext): boolean {
    if (context.projectType === undefined) {
      return true;
    }

    const { OperatorProjectType } = require('@plugin/domain/models/operator-project-type');

    return context.projectType !== OperatorProjectType.STANDARD_CUSTOM;
  }

  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const command = this.commandGenerator.generateBuildExampleCommand(
      context.exampleConfigId,
      this.compileOptions,
    );

    const result = await context.executor.execute(command, [], [], {}, true);

    if (result.code !== 0) {
      return ResultUtils.err(new BuildFailedError('ExampleBuild失败', {
        command,
        exitCode: result.code,
        output: result.output,
        phase: 'example-build',
      }));
    }

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * Build step with simulator parameters
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

    const operatorNames = context.parameters?.operatorNames as string | undefined;
    await notifyBuildSucceededForSidebar(context.buildConfigId, operatorNames);

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * Pre-on-board build step (with onboard params)
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

    const operatorNames = context.parameters?.operatorNames as string | undefined;
    await notifyBuildSucceededForSidebar(context.buildConfigId, operatorNames);

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}

/**
 * Pre-sanitizer build step (with --mssanitizer)
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

    const operatorNames = context.parameters?.operatorNames as string | undefined;
    await notifyBuildSucceededForSidebar(context.buildConfigId, operatorNames);

    return ResultUtils.ok({
      command,
      output: result.output,
    });
  }
}
