import {
  StrategyVariant, TaskType,
} from '../strategies/execution-strategy.factory';

/**
 * Operator project type enum
 */
export enum OperatorProjectType {
  /** Standard AiCore operator */
  AICORE_STANDARD = 'aicore-standard',

  /** Standard Vector operator */
  VECTOR_STANDARD = 'vector-standard',

  /** Custom operator (special handling) */
  CUSTOM = 'custom',

  /** Hybrid operator */
  HYBRID = 'hybrid',
}

/**
 * Task strategy config
 * Strategy used by a project type for a given task
 */
export interface TaskStrategyConfig {
  taskType: TaskType;
  variant: StrategyVariant;
  customStrategyId?: string;
}

/**
 * Operator project config
 * Loaded from config file or database
 */
export interface OperatorProjectConfig {
  /** Project ID */
  projectId: number;

  /** Project type */
  projectType: OperatorProjectType;

  /** Task strategy mapping */
  taskStrategies: Record<TaskType, TaskStrategyConfig>;

  /** Custom parameters */
  customParameters?: Record<string, unknown>;
}

/**
 * Strategy config repository interface
 */
export interface IStrategyConfigRepository {
  /**
   * Get config by project ID
   */
  getProjectConfig(projectId: number): Promise<OperatorProjectConfig>;

  /**
   * Get default config by project type
   */
  getDefaultConfig(
    projectType: OperatorProjectType,
  ): Promise<OperatorProjectConfig>;

  /**
   * Save project config
   */
  saveProjectConfig(config: OperatorProjectConfig): Promise<void>;
}

/**
 * Default strategy configs
 * Used when no config in database
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
        variant: StrategyVariant.WITH_VALIDATION, // Custom operator needs validation step
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
   * Get default config
   */
  static getDefault(projectType: OperatorProjectType): Partial<Record<TaskType, TaskStrategyConfig>> {
    return this.CONFIGS[projectType] || {};
  }
}
