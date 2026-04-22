import { IExecutionStrategy } from './execution-strategy.interface';
import { CommandGeneratorService } from '../services/command-generator.service';
import {
  StandardSimulateStrategy,
  StandardOnBoardStrategy,
  StandardSanitizerStrategy,
  CustomOnBoardWithValidationStrategy,
  FastOnBoardStrategy,
} from './concrete-strategies';

/**
 * Task type enum
 */
export enum TaskType {
  SIMULATE = 'simulate',
  ON_BOARD = 'onboard',
  SANITIZER = 'sanitizer',
  BUILD = 'build',
  RUN = 'run',
}

/**
 * Strategy variant (different execution for same task)
 */
export enum StrategyVariant {
  STANDARD = 'standard',
  FAST = 'fast',
  WITH_VALIDATION = 'with-validation',
  CUSTOM = 'custom',
}

/**
 * Strategy selector config
 */
export interface StrategySelector {
  taskType: TaskType;
  variant?: StrategyVariant;
  /** Custom strategy id (for plugin extension) */
  customStrategyId?: string;
}

/**
 * Execution strategy factory
 * Creates strategy by task type and variant
 */
export class ExecutionStrategyFactory {
  private strategyRegistry = new Map<string, ()=> IExecutionStrategy>();

  constructor(private commandGenerator: CommandGeneratorService) {
    this.registerDefaultStrategies();
  }

  /**
   * Register default strategies
   */
  private registerDefaultStrategies(): void {
    // Simulate strategy
    this.register(
      TaskType.SIMULATE,
      StrategyVariant.STANDARD,
      () => new StandardSimulateStrategy(this.commandGenerator),
    );

    // On-board strategy
    this.register(
      TaskType.ON_BOARD,
      StrategyVariant.STANDARD,
      () => new StandardOnBoardStrategy(this.commandGenerator),
    );

    this.register(
      TaskType.ON_BOARD,
      StrategyVariant.WITH_VALIDATION,
      () => new CustomOnBoardWithValidationStrategy(this.commandGenerator),
    );

    this.register(
      TaskType.ON_BOARD,
      StrategyVariant.FAST,
      () => new FastOnBoardStrategy(this.commandGenerator),
    );

    // Sanitizer strategy
    this.register(
      TaskType.SANITIZER,
      StrategyVariant.STANDARD,
      () => new StandardSanitizerStrategy(this.commandGenerator),
    );
  }

  /**
   * Register strategy (supports plugin extension)
   */
  register(
    taskType: TaskType,
    variant: StrategyVariant,
    factory: ()=> IExecutionStrategy,
  ): void {
    const key = this.getRegistryKey(taskType, variant);

    this.strategyRegistry.set(key, factory);
  }

  /**
   * Register custom strategy
   */
  registerCustom(
    customStrategyId: string,
    factory: ()=> IExecutionStrategy,
  ): void {
    this.strategyRegistry.set(customStrategyId, factory);
  }

  /**
   * Create strategy
   */
  create(selector: StrategySelector): IExecutionStrategy {
    // Prefer custom strategy
    if (selector.customStrategyId) {
      const customStrategy = this.strategyRegistry.get(selector.customStrategyId);

      if (customStrategy) {
        return customStrategy();
      }
    }

    // Use standard strategy
    const variant = selector.variant || StrategyVariant.STANDARD;
    const key = this.getRegistryKey(selector.taskType, variant);
    const strategyFactory = this.strategyRegistry.get(key);

    if (!strategyFactory) {
      throw new Error(`Strategy not found for task=${selector.taskType}, variant=${variant}`);
    }

    return strategyFactory();
  }

  /**
   * Get registry key
   */
  private getRegistryKey(taskType: TaskType, variant: StrategyVariant): string {
    return `${taskType}:${variant}`;
  }

  /**
   * List all registered strategies
   */
  listStrategies(): string[] {
    return Array.from(this.strategyRegistry.keys());
  }
}
