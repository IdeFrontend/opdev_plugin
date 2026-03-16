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
 * Build orchestrator service V2
 * Refactored with strategy pattern for flexible execution flow
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
   * Execute simulation analysis
   * @param buildConfigId Build config ID
   * @param simulateConfigId Simulate config ID
   * @param exampleConfigId Example config ID
   * @param simulatorType Simulator type
   * @param variant Strategy variant (default standard)
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
   * Execute on-board analysis
   * @param buildConfigId Build config ID
   * @param onBoardConfigId On-board config ID
   * @param exampleConfigId Example config ID
   * @param variant Strategy variant (default standard)
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
   * Execute sanitizer (anomaly detection)
   * @param buildConfigId Build config ID
   * @param sanitizerConfigId Sanitizer config ID
   * @param exampleConfigId Example config ID
   * @param variant Strategy variant (default standard)
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
   * Execute task with custom strategy
   * @param customStrategyId Custom strategy ID
   * @param context Execution context
   */
  async executeWithCustomStrategy(
    customStrategyId: string,
    context: ExecutionContext,
  ): Promise<Result<void, Error>> {
    const strategy = this.strategyFactory.create({ customStrategyId } as any);

    return strategy.execute(context);
  }

  /**
   * Get strategy factory (for registering custom strategies)
   */
  getStrategyFactory(): ExecutionStrategyFactory {
    return this.strategyFactory;
  }
}
