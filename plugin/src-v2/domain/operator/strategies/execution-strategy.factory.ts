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
 * 任务类型枚举
 */
export enum TaskType {
  SIMULATE = 'simulate',
  ON_BOARD = 'onboard',
  SANITIZER = 'sanitizer',
  BUILD = 'build',
  RUN = 'run',
}

/**
 * 策略变体 (同一任务的不同执行方式)
 */
export enum StrategyVariant {
  STANDARD = 'standard',
  FAST = 'fast',
  WITH_VALIDATION = 'with-validation',
  CUSTOM = 'custom',
}

/**
 * 策略选择器配置
 */
export interface StrategySelector {
  taskType: TaskType;
  variant?: StrategyVariant;
  /** 自定义策略标识 (用于插件扩展) */
  customStrategyId?: string;
}

/**
 * 执行策略工厂
 * 负责根据任务类型和变体创建对应的策略
 */
export class ExecutionStrategyFactory {
  private strategyRegistry = new Map<string, ()=> IExecutionStrategy>();

  constructor(private commandGenerator: CommandGeneratorService) {
    this.registerDefaultStrategies();
  }

  /**
   * 注册默认策略
   */
  private registerDefaultStrategies(): void {
    // 仿真策略
    this.register(
      TaskType.SIMULATE,
      StrategyVariant.STANDARD,
      () => new StandardSimulateStrategy(this.commandGenerator),
    );

    // 上板策略
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

    // 异常检测策略
    this.register(
      TaskType.SANITIZER,
      StrategyVariant.STANDARD,
      () => new StandardSanitizerStrategy(this.commandGenerator),
    );
  }

  /**
   * 注册策略 (支持插件扩展)
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
   * 注册自定义策略
   */
  registerCustom(
    customStrategyId: string,
    factory: ()=> IExecutionStrategy,
  ): void {
    this.strategyRegistry.set(customStrategyId, factory);
  }

  /**
   * 创建策略
   */
  create(selector: StrategySelector): IExecutionStrategy {
    // 优先使用自定义策略
    if (selector.customStrategyId) {
      const customStrategy = this.strategyRegistry.get(selector.customStrategyId);

      if (customStrategy) {
        return customStrategy();
      }
    }

    // 使用标准策略
    const variant = selector.variant || StrategyVariant.STANDARD;
    const key = this.getRegistryKey(selector.taskType, variant);
    const strategyFactory = this.strategyRegistry.get(key);

    if (!strategyFactory) {
      throw new Error(`Strategy not found for task=${selector.taskType}, variant=${variant}`);
    }

    return strategyFactory();
  }

  /**
   * 获取注册键
   */
  private getRegistryKey(taskType: TaskType, variant: StrategyVariant): string {
    return `${taskType}:${variant}`;
  }

  /**
   * 列出所有已注册的策略
   */
  listStrategies(): string[] {
    return Array.from(this.strategyRegistry.keys());
  }
}
