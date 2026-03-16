import {
  IStrategyConfigRepository,
  OperatorProjectConfig,
  OperatorProjectType,
  DefaultStrategyConfigs,
} from '@plugin-v2/domain/operator/config/strategy-config';
import { TaskType } from '@plugin-v2/domain/operator/strategies/execution-strategy.factory';

/**
 * In-memory strategy config repository
 * Simple implementation; can be replaced with DB later
 */
export class InMemoryStrategyConfigRepository
implements IStrategyConfigRepository {
  private configs: Map<number, OperatorProjectConfig> = new Map();

  async getProjectConfig(projectId: number): Promise<OperatorProjectConfig> {
    // Return cached if present
    const cached = this.configs.get(projectId);

    if (cached) {
      return cached;
    }

    // Otherwise return default config (standard AiCore operator)
    return this.getDefaultConfig(OperatorProjectType.AICORE_STANDARD);
  }

  async getDefaultConfig(projectType: OperatorProjectType): Promise<OperatorProjectConfig> {
    const strategies = DefaultStrategyConfigs.getDefault(projectType);

    return {
      projectId: 0,
      projectType,
      taskStrategies: strategies as Record<TaskType, any>,
      customParameters: {},
    };
  }

  async saveProjectConfig(config: OperatorProjectConfig): Promise<void> {
    this.configs.set(config.projectId, config);
  }

  /**
   * Set project config (for tests or manual setup)
   */
  setConfig(projectId: number, config: OperatorProjectConfig): void {
    this.configs.set(projectId, config);
  }

  /**
   * Clear all configs
   */
  clear(): void {
    this.configs.clear();
  }
}
