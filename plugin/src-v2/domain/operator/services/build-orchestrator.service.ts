import {
  Result, ResultUtils,
} from '@plugin-v2/domain/shared/types/result.type';
import {
  BuildFailedError,
  CommandExecutionError,
  SimulateFailedError,
  OnBoardFailedError,
  SanitizerFailedError,
} from '../errors/operator.error';
import { ICommandExecutor } from '@plugin-v2/application/interfaces/command-executor.interface';
import { CommandGeneratorService } from './command-generator.service';
import {
  ExecutionStrategyFactory,
  TaskType,
  StrategyVariant,
} from '../strategies/execution-strategy.factory';
import { ExecutionContext } from '../strategies/execution-step.interface';

/**
 * Build orchestrator service
 * Domain service; core build business logic
 * V2: supports strategy pattern, backward compatible
 */
export class BuildOrchestratorService {
  private strategyFactory: ExecutionStrategyFactory;

  constructor(
    private commandGenerator: CommandGeneratorService,
    private executor: ICommandExecutor,
  ) {
    // Initialize strategy factory
    this.strategyFactory = new ExecutionStrategyFactory(commandGenerator);
  }

  /**
   * Execute operator build
   */
  async build(
    configId: number,
    compileOption?: string,
    operatorNames?: string,
  ): Promise<Result<void, BuildFailedError>> {
    // 1. Generate build command
    const command = this.commandGenerator.generateBuildCommand(
      configId,
      compileOption,
      operatorNames,
    );

    // 2. Execute command
    const execResult = await this.executor.execute(command, [], [], {}, true);

    // 3. Handle result
    if (execResult.code !== 0) {
      return ResultUtils.err(new BuildFailedError('编译算子失败', {
        command,
        exitCode: execResult.code,
        output: execResult.output,
      }));
    }

    return ResultUtils.ok(undefined);
  }

  /**
   * Execute example build
   */
  async buildExample(configId: number, operatorNames?: string): Promise<Result<void, BuildFailedError>> {
    const command = this.commandGenerator.generateBuildExampleCommand(configId, operatorNames);
    const execResult = await this.executor.execute(command, [], [], {}, true);

    if (execResult.code !== 0) {
      return ResultUtils.err(new BuildFailedError('编译示例失败', {
        command,
        exitCode: execResult.code,
        output: execResult.output,
      }));
    }

    return ResultUtils.ok(undefined);
  }

  /**
   * Execute operator run
   */
  async run(configId: number): Promise<Result<void, BuildFailedError>> {
    const command = this.commandGenerator.generateRunCommand(configId);
    const execResult = await this.executor.execute(command, [], [], {}, true);

    if (execResult.code !== 0) {
      return ResultUtils.err(new BuildFailedError('运行失败', {
        command,
        exitCode: execResult.code,
        output: execResult.output,
      }));
    }

    return ResultUtils.ok(undefined);
  }

  /**
   * Execute simulation analysis
   * Two steps: 1) build with simulator type 2) run simulate command
   */
  async simulate(
    buildConfigId: number,
    simulateConfigId: number,
    exampleConfigId: number,
    simulatorType: string,
  ): Promise<Result<void, SimulateFailedError | BuildFailedError>> {
    // Step 1: pre-simulate build (with simulator params)
    const buildCommand = this.commandGenerator.generateBuildWithSimulatorCommand(
      buildConfigId,
      simulatorType,
    );
    const buildResult = await this.executor.execute(buildCommand, [], [], {}, true);

    if (buildResult.code !== 0) {
      return ResultUtils.err(new BuildFailedError('仿真前编译失败', {
        command: buildCommand,
        exitCode: buildResult.code,
        output: buildResult.output,
        phase: 'pre-simulate-build',
      }));
    }

    // Step 2: execute simulation analysis
    const simulateCommand = this.commandGenerator.generateSimulateCommand(
      simulateConfigId,
      exampleConfigId,
    );
    const simulateResult = await this.executor.execute(
      simulateCommand,
      [],
      [],
      {},
      true,
    );

    if (simulateResult.code !== 0) {
      return ResultUtils.err(new SimulateFailedError('执行仿真分析失败', {
        command: simulateCommand,
        exitCode: simulateResult.code,
        output: simulateResult.output,
      }));
    }

    return ResultUtils.ok(undefined);
  }

  /**
   * Execute on-board analysis
   * Two steps: 1) pre-on-board build 2) run on-board command
   */
  async onBoard(
    buildConfigId: number,
    onBoardConfigId: number,
    exampleConfigId: number,
  ): Promise<Result<void, OnBoardFailedError | BuildFailedError>> {
    // Step 1: pre-on-board build (with onboard param)
    const buildCommand = this.commandGenerator.generateBuildForOnBoardCommand(buildConfigId);
    const buildResult = await this.executor.execute(buildCommand, [], [], {}, true);

    if (buildResult.code !== 0) {
      return ResultUtils.err(new BuildFailedError('上板前编译失败', {
        command: buildCommand,
        exitCode: buildResult.code,
        output: buildResult.output,
        phase: 'pre-onboard-build',
      }));
    }

    // Step 2: execute on-board analysis
    const onBoardCommand = this.commandGenerator.generateOnBoardCommand(
      onBoardConfigId,
      exampleConfigId,
    );
    const onBoardResult = await this.executor.execute(
      onBoardCommand,
      [],
      [],
      {},
      true,
    );

    if (onBoardResult.code !== 0) {
      return ResultUtils.err(new OnBoardFailedError('执行上板分析失败', {
        command: onBoardCommand,
        exitCode: onBoardResult.code,
        output: onBoardResult.output,
      }));
    }

    return ResultUtils.ok(undefined);
  }

  /**
   * Execute sanitizer (anomaly detection)
   * Two steps: 1) pre-sanitizer build (--mssanitizer) 2) run sanitizer command
   */
  async sanitizer(
    buildConfigId: number,
    sanitizerConfigId: number,
    exampleConfigId: number,
  ): Promise<Result<void, SanitizerFailedError | BuildFailedError>> {
    // Step 1: pre-sanitizer build (with --mssanitizer)
    const buildCommand = this.commandGenerator.generateBuildForSanitizerCommand(buildConfigId);
    const buildResult = await this.executor.execute(buildCommand, [], [], {}, true);

    if (buildResult.code !== 0) {
      return ResultUtils.err(new BuildFailedError('异常检测前编译失败', {
        command: buildCommand,
        exitCode: buildResult.code,
        output: buildResult.output,
        phase: 'pre-sanitizer-build',
      }));
    }

    // Step 2: execute sanitizer
    const sanitizerCommand = this.commandGenerator.generateSanitizerCommand(
      sanitizerConfigId,
      exampleConfigId,
    );
    const sanitizerResult = await this.executor.execute(
      sanitizerCommand,
      [],
      [],
      {},
      true,
    );

    if (sanitizerResult.code !== 0) {
      return ResultUtils.err(new SanitizerFailedError('异常检测失败', {
        command: sanitizerCommand,
        exitCode: sanitizerResult.code,
        output: sanitizerResult.output,
      }));
    }

    return ResultUtils.ok(undefined);
  }

  /**
   * Execute simulate with strategy (new API)
   * @param buildConfigId Build config ID
   * @param simulateConfigId Simulate config ID
   * @param exampleConfigId Example config ID
   * @param simulatorType Simulator type
   * @param variant Strategy variant
   */
  async simulateWithStrategy(
    buildConfigId: number,
    simulateConfigId: number,
    exampleConfigId: number,
    simulatorType: string,
    variant: StrategyVariant = StrategyVariant.STANDARD,
  ): Promise<Result<void, SimulateFailedError | BuildFailedError>> {
    const strategy = this.strategyFactory.create({
      taskType: TaskType.SIMULATE,
      variant,
    });

    const context: ExecutionContext = {
      primaryConfigId: simulateConfigId,
      buildConfigId,
      exampleConfigId,
      parameters: { simulatorType },
      executor: this.executor,
    };

    return strategy.execute(context) as Promise<
      Result<void, SimulateFailedError | BuildFailedError>
    >;
  }

  /**
   * Execute on-board with strategy (new API)
   * @param buildConfigId Build config ID
   * @param onBoardConfigId On-board config ID
   * @param exampleConfigId Example config ID
   * @param variant Strategy variant
   */
  async onBoardWithStrategy(
    buildConfigId: number,
    onBoardConfigId: number,
    exampleConfigId: number,
    variant: StrategyVariant = StrategyVariant.STANDARD,
  ): Promise<Result<void, OnBoardFailedError | BuildFailedError>> {
    const strategy = this.strategyFactory.create({
      taskType: TaskType.ON_BOARD,
      variant,
    });

    const context: ExecutionContext = {
      primaryConfigId: onBoardConfigId,
      buildConfigId,
      exampleConfigId,
      executor: this.executor,
    };

    return strategy.execute(context) as Promise<
      Result<void, OnBoardFailedError | BuildFailedError>
    >;
  }

  /**
   * Execute sanitizer with strategy (new API)
   * @param buildConfigId Build config ID
   * @param sanitizerConfigId Sanitizer config ID
   * @param exampleConfigId Example config ID
   * @param variant Strategy variant
   */
  async sanitizerWithStrategy(
    buildConfigId: number,
    sanitizerConfigId: number,
    exampleConfigId: number,
    variant: StrategyVariant = StrategyVariant.STANDARD,
  ): Promise<Result<void, SanitizerFailedError | BuildFailedError>> {
    const strategy = this.strategyFactory.create({
      taskType: TaskType.SANITIZER,
      variant,
    });

    const context: ExecutionContext = {
      primaryConfigId: sanitizerConfigId,
      buildConfigId,
      exampleConfigId,
      executor: this.executor,
    };

    return strategy.execute(context) as Promise<
      Result<void, SanitizerFailedError | BuildFailedError>
    >;
  }

  /**
   * Get strategy factory (for extension and custom strategy registration)
   */
  getStrategyFactory(): ExecutionStrategyFactory {
    return this.strategyFactory;
  }
}
