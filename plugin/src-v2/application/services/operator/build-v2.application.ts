import {
  Result, ResultUtils,
} from '@plugin-v2/domain/shared/types/result.type';
import {
  BuildFailedError,
  OnBoardFailedError,
} from '@plugin-v2/domain/operator/errors/operator.error';
import { ConfigNotFoundError } from '@plugin-v2/domain/shared/errors/base.error';
import { IConfigRepository } from '@plugin-v2/domain/operator/repositories/config.repository';
import { ConfigType } from '@plugin-v2/domain/operator/value-objects/config-type.vo';
import { BuildOrchestratorServiceV2 } from '@plugin-v2/domain/operator/services/build-orchestrator-v2.service';
import {
  IStrategyConfigRepository,
  OperatorProjectConfig,
  DefaultStrategyConfigs,
} from '@plugin-v2/domain/operator/config/strategy-config';
import {
  TaskType, StrategyVariant,
} from '@plugin-v2/domain/operator/strategies/execution-strategy.factory';

/**
 * 构建应用服务 V2
 * 集成策略配置,支持基于工程类型的差异化执行
 */
export class BuildApplicationServiceV2 {
  constructor(
    private configRepo: IConfigRepository,
    private strategyConfigRepo: IStrategyConfigRepository,
    private buildOrchestrator: BuildOrchestratorServiceV2,
    private projectId: number,
  ) {}

  /**
   * 执行上板分析 (智能策略选择)
   */
  async startOnBoard(): Promise<
    Result<void, OnBoardFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    // 1. 获取工程配置,确定使用哪个策略
    const projectConfig = await this.strategyConfigRepo.getProjectConfig(this.projectId);

    // 2. 获取上板配置
    const onBoardConfigResult = await this.configRepo.findByType(ConfigType.ON_BOARD);

    if (ResultUtils.isErr(onBoardConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('on_board', { reason: '未找到上板配置' }));
    }

    // 3. 获取构建配置ID
    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    // 4. 获取示例配置ID
    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 5. 根据工程配置选择策略变体
    const strategyConfig = projectConfig.taskStrategies[TaskType.ON_BOARD];
    const variant = strategyConfig?.variant || StrategyVariant.STANDARD;

    // 6. 执行上板 (使用选定的策略)
    return this.buildOrchestrator.onBoard(
      buildConfigResult.value.configId,
      onBoardConfigResult.value.configId,
      exampleConfigResult.value.configId,
      variant,
    );
  }

  /**
   * 使用指定策略执行上板
   * 提供给高级用户手动指定策略
   */
  async startOnBoardWithStrategy(variant: StrategyVariant): Promise<
    Result<void, OnBoardFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    const onBoardConfigResult = await this.configRepo.findByType(ConfigType.ON_BOARD);

    if (ResultUtils.isErr(onBoardConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('on_board', { reason: '未找到上板配置' }));
    }

    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 使用指定的策略变体
    return this.buildOrchestrator.onBoard(
      buildConfigResult.value.configId,
      onBoardConfigResult.value.configId,
      exampleConfigResult.value.configId,
      variant,
    );
  }

  // 其他方法类似...
}
