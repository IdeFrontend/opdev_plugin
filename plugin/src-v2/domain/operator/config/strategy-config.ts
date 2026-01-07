import {
  StrategyVariant, TaskType,
} from '../strategies/execution-strategy.factory';

/**
 * 算子工程类型枚举
 */
export enum OperatorProjectType {
  /** 标准 AiCore 算子 */
  AICORE_STANDARD = 'aicore-standard',

  /** 标准 Vector 算子 */
  VECTOR_STANDARD = 'vector-standard',

  /** 自定义算子 (需要特殊处理) */
  CUSTOM = 'custom',

  /** 混合算子 */
  HYBRID = 'hybrid',
}

/**
 * 任务策略配置
 * 定义某个算子工程类型在执行特定任务时使用的策略
 */
export interface TaskStrategyConfig {
  taskType: TaskType;
  variant: StrategyVariant;
  customStrategyId?: string;
}

/**
 * 算子工程配置
 * 从配置文件或数据库加载
 */
export interface OperatorProjectConfig {
  /** 工程ID */
  projectId: number;

  /** 工程类型 */
  projectType: OperatorProjectType;

  /** 任务策略映射 */
  taskStrategies: Record<TaskType, TaskStrategyConfig>;

  /** 自定义参数 */
  customParameters?: Record<string, unknown>;
}

/**
 * 策略配置仓储接口
 */
export interface IStrategyConfigRepository {
  /**
   * 根据工程ID获取配置
   */
  getProjectConfig(projectId: number): Promise<OperatorProjectConfig>;

  /**
   * 根据工程类型获取默认配置
   */
  getDefaultConfig(
    projectType: OperatorProjectType,
  ): Promise<OperatorProjectConfig>;

  /**
   * 保存工程配置
   */
  saveProjectConfig(config: OperatorProjectConfig): Promise<void>;
}

/**
 * 默认策略配置
 * 当数据库无配置时使用
 */
export class DefaultStrategyConfigs {
  static readonly CONFIGS: Record<OperatorProjectType, Partial<Record<TaskType, TaskStrategyConfig>>> = {
    [OperatorProjectType.AICORE_STANDARD]: {
      [TaskType.SIMULATE]: {
        taskType: TaskType.SIMULATE,
        variant: StrategyVariant.STANDARD,
      },
      [TaskType.ON_BOARD]: {
        taskType: TaskType.ON_BOARD,
        variant: StrategyVariant.STANDARD,
      },
      [TaskType.SANITIZER]: {
        taskType: TaskType.SANITIZER,
        variant: StrategyVariant.STANDARD,
      },
    },

    [OperatorProjectType.VECTOR_STANDARD]: {
      [TaskType.SIMULATE]: {
        taskType: TaskType.SIMULATE,
        variant: StrategyVariant.STANDARD,
      },
      [TaskType.ON_BOARD]: {
        taskType: TaskType.ON_BOARD,
        variant: StrategyVariant.STANDARD,
      },
      [TaskType.SANITIZER]: {
        taskType: TaskType.SANITIZER,
        variant: StrategyVariant.STANDARD,
      },
    },

    [OperatorProjectType.CUSTOM]: {
      [TaskType.ON_BOARD]: {
        taskType: TaskType.ON_BOARD,
        variant: StrategyVariant.WITH_VALIDATION, // 自定义算子需要验证步骤
      },
    },

    [OperatorProjectType.HYBRID]: {
      [TaskType.ON_BOARD]: {
        taskType: TaskType.ON_BOARD,
        variant: StrategyVariant.STANDARD,
      },
    },
  };

  /**
   * 获取默认配置
   */
  static getDefault(projectType: OperatorProjectType): Partial<Record<TaskType, TaskStrategyConfig>> {
    return this.CONFIGS[projectType] || {};
  }
}
