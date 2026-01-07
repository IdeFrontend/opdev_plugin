import {
  IStrategyConfigRepository,
  OperatorProjectConfig,
  OperatorProjectType,
  DefaultStrategyConfigs,
} from '@plugin-v2/domain/operator/config/strategy-config';
import { TaskType } from '@plugin-v2/domain/operator/strategies/execution-strategy.factory';

/**
 * 内存策略配置仓储
 * 简单实现,后续可替换为数据库实现
 */
export class InMemoryStrategyConfigRepository
implements IStrategyConfigRepository {
  private configs: Map<number, OperatorProjectConfig> = new Map();

  async getProjectConfig(projectId: number): Promise<OperatorProjectConfig> {
    // 如果有缓存,返回缓存
    const cached = this.configs.get(projectId);

    if (cached) {
      return cached;
    }

    // 否则返回默认配置 (标准 AiCore 算子)
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
   * 设置项目配置 (用于测试或手动配置)
   */
  setConfig(projectId: number, config: OperatorProjectConfig): void {
    this.configs.set(projectId, config);
  }

  /**
   * 清除所有配置
   */
  clear(): void {
    this.configs.clear();
  }
}
