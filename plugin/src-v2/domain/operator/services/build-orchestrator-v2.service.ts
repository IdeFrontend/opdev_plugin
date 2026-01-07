import { Result } from '@plugin-v2/domain/shared/types/result.type';
import {
  BuildFailedError,
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
 * 构建编排服务 V2
 * 使用策略模式重构,支持灵活的执行流程定制
 */
export class BuildOrchestratorServiceV2 {
  private strategyFactory: ExecutionStrategyFactory;

  constructor(
    private commandGenerator: CommandGeneratorService,
    private executor: ICommandExecutor,
  ) {
    this.strategyFactory = new ExecutionStrategyFactory(commandGenerator);
  }

  /**
   * 执行仿真分析
   * @param buildConfigId 构建配置ID
   * @param simulateConfigId 仿真配置ID
   * @param exampleConfigId 示例配置ID
   * @param simulatorType 仿真器类型
   * @param variant 策略变体 (默认标准策略)
   */
  async simulate(
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
   * 执行上板分析
   * @param buildConfigId 构建配置ID
   * @param onBoardConfigId 上板配置ID
   * @param exampleConfigId 示例配置ID
   * @param variant 策略变体 (默认标准策略)
   */
  async onBoard(
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
   * 执行异常检测
   * @param buildConfigId 构建配置ID
   * @param sanitizerConfigId 异常检测配置ID
   * @param exampleConfigId 示例配置ID
   * @param variant 策略变体 (默认标准策略)
   */
  async sanitizer(
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
   * 使用自定义策略执行任务
   * @param customStrategyId 自定义策略ID
   * @param context 执行上下文
   */
  async executeWithCustomStrategy(
    customStrategyId: string,
    context: ExecutionContext,
  ): Promise<Result<void, Error>> {
    const strategy = this.strategyFactory.create({ customStrategyId } as any);

    return strategy.execute(context);
  }

  /**
   * 获取策略工厂 (用于注册自定义策略)
   */
  getStrategyFactory(): ExecutionStrategyFactory {
    return this.strategyFactory;
  }
}
