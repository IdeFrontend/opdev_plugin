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
 * 构建编排服务
 * 领域服务,负责算子构建的核心业务逻辑
 * V2: 支持策略模式,保持向后兼容
 */
export class BuildOrchestratorService {
  private strategyFactory: ExecutionStrategyFactory;

  constructor(
    private commandGenerator: CommandGeneratorService,
    private executor: ICommandExecutor,
  ) {
    // 初始化策略工厂
    this.strategyFactory = new ExecutionStrategyFactory(commandGenerator);
  }

  /**
   * 执行算子构建
   */
  async build(
    configId: number,
    compileOption?: string,
    operatorNames?: string,
  ): Promise<Result<void, BuildFailedError>> {
    // 1. 生成构建命令
    const command = this.commandGenerator.generateBuildCommand(
      configId,
      compileOption,
      operatorNames,
    );

    // 2. 执行命令
    const execResult = await this.executor.execute(command, [], [], {}, true);

    // 3. 处理结果
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
   * 执行示例构建
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
   * 执行算子运行
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
   * 执行仿真分析
   * 包含两步:
   * 1. 使用指定仿真器类型编译算子
   * 2. 执行仿真分析命令
   */
  async simulate(
    buildConfigId: number,
    simulateConfigId: number,
    exampleConfigId: number,
    simulatorType: string,
  ): Promise<Result<void, SimulateFailedError | BuildFailedError>> {
    // 步骤 1: 仿真前编译 (带仿真器参数)
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

    // 步骤 2: 执行仿真分析
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
   * 执行上板分析
   * 包含两步:
   * 1. 上板前编译 (带 onboard 参数)
   * 2. 执行上板分析命令
   */
  async onBoard(
    buildConfigId: number,
    onBoardConfigId: number,
    exampleConfigId: number,
  ): Promise<Result<void, OnBoardFailedError | BuildFailedError>> {
    // 步骤 1: 上板前编译 (带 onboard 参数)
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

    // 步骤 2: 执行上板分析
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
   * 执行异常检测
   * 包含两步:
   * 1. 异常检测前编译 (带 --mssanitizer 参数)
   * 2. 执行异常检测命令
   */
  async sanitizer(
    buildConfigId: number,
    sanitizerConfigId: number,
    exampleConfigId: number,
  ): Promise<Result<void, SanitizerFailedError | BuildFailedError>> {
    // 步骤 1: 异常检测前编译 (带 --mssanitizer 参数)
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

    // 步骤 2: 执行异常检测
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
   * 使用策略执行仿真 (新方法)
   * @param buildConfigId 构建配置ID
   * @param simulateConfigId 仿真配置ID
   * @param exampleConfigId 示例配置ID
   * @param simulatorType 仿真器类型
   * @param variant 策略变体
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
   * 使用策略执行上板 (新方法)
   * @param buildConfigId 构建配置ID
   * @param onBoardConfigId 上板配置ID
   * @param exampleConfigId 示例配置ID
   * @param variant 策略变体
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
   * 使用策略执行异常检测 (新方法)
   * @param buildConfigId 构建配置ID
   * @param sanitizerConfigId 异常检测配置ID
   * @param exampleConfigId 示例配置ID
   * @param variant 策略变体
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
   * 获取策略工厂 (用于扩展和注册自定义策略)
   */
  getStrategyFactory(): ExecutionStrategyFactory {
    return this.strategyFactory;
  }
}
