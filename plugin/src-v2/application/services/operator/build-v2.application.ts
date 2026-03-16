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
 * Build application service V2
 * Integrates strategy config; execution varies by project type
 */
export class BuildApplicationServiceV2 {
  constructor(
    private configRepo: IConfigRepository,
    private strategyConfigRepo: IStrategyConfigRepository,
    private buildOrchestrator: BuildOrchestratorServiceV2,
    private projectId: number,
  ) {}

  /**
   * Execute on-board analysis (strategy chosen by project config)
   */
  async startOnBoard(): Promise<
    Result<void, OnBoardFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    // 1. Get project config to determine strategy
    const projectConfig = await this.strategyConfigRepo.getProjectConfig(this.projectId);

    // 2. Get on-board config
    const onBoardConfigResult = await this.configRepo.findByType(ConfigType.ON_BOARD);

    if (ResultUtils.isErr(onBoardConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('on_board', { reason: '未找到上板配置' }));
    }

    // 3. Get build config ID
    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    // 4. Get example config ID
    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 5. Select strategy variant from project config
    const strategyConfig = projectConfig.taskStrategies[TaskType.ON_BOARD];
    const variant = strategyConfig?.variant || StrategyVariant.STANDARD;

    // 6. Execute on-board (with selected strategy)
    return this.buildOrchestrator.onBoard(
      buildConfigResult.value.configId,
      onBoardConfigResult.value.configId,
      exampleConfigResult.value.configId,
      variant,
    );
  }

  /**
   * Execute on-board with specified strategy
   * For advanced users who want to pick strategy manually
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

    // Use specified strategy variant
    return this.buildOrchestrator.onBoard(
      buildConfigResult.value.configId,
      onBoardConfigResult.value.configId,
      exampleConfigResult.value.configId,
      variant,
    );
  }

  // Other methods similar...
}
