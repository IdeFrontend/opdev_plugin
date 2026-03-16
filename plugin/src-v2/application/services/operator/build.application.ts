import {
  Result, ResultUtils,
} from '@plugin-v2/domain/shared/types/result.type';
import {
  BuildFailedError,
  SimulateFailedError,
  OnBoardFailedError,
  SanitizerFailedError,
} from '@plugin-v2/domain/operator/errors/operator.error';
import { ConfigNotFoundError } from '@plugin-v2/domain/shared/errors/base.error';
import { IConfigRepository } from '@plugin-v2/domain/operator/repositories/config.repository';
import { BuildOrchestratorService } from '@plugin-v2/domain/operator/services/build-orchestrator.service';
import { ConfigType } from '@plugin-v2/domain/operator/value-objects/config-type.vo';

/**
 * Build application service DTOs
 */
export interface StartBuildDto {
  configId?: number;
  compileOption?: string;
  operatorNames?: string; // Operator names, comma-separated (e.g. standard custom)
  operatorType?: string; // Operator type for build (e.g. 'standard-custom')
}

export interface StartRunDto {
  configId?: number;
  filePath?: string; // File path (e.g. when invoked from context menu)
}

export interface StartBuildExampleDto {
  configId?: number;
  operatorNames?: string; // Operator names, comma-separated (e.g. standard custom)
  operatorType?: string; // Operator type for build (e.g. 'standard-custom')
}

/**
 * Build application service
 * Application layer; business orchestration
 */
export class BuildApplicationService {
  constructor(
    private configRepo: IConfigRepository,
    private buildOrchestrator: BuildOrchestratorService,
  ) {}

  /**
   * Start operator build
   */
  async startBuild(dto: StartBuildDto): Promise<Result<void, BuildFailedError | ConfigNotFoundError>> {
    // 1. Resolve config ID
    let configId = dto.configId;

    if (!configId) {
      const configResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

      if (ResultUtils.isErr(configResult)) {
        return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
      }

      configId = configResult.value.configId;
    }

    // 2. Execute build
    return this.buildOrchestrator.build(configId, dto.compileOption, dto.operatorNames);
  }

  /**
   * Start operator run
   */
  async startRun(dto: StartRunDto): Promise<Result<void, BuildFailedError | ConfigNotFoundError>> {
    // 1. Resolve config ID
    let configId = dto.configId;

    if (!configId) {
      const configResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

      if (ResultUtils.isErr(configResult)) {
        return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到运行配置' }));
      }

      configId = configResult.value.configId;
    }

    // 2. Execute run
    return this.buildOrchestrator.run(configId);
  }

  /**
   * Start build example
   */
  async startBuildExample(dto: StartBuildExampleDto): Promise<Result<void, BuildFailedError | ConfigNotFoundError>> {
    // 1. Resolve config ID
    let configId = dto.configId;

    if (!configId) {
      const configResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

      if (ResultUtils.isErr(configResult)) {
        return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例构建配置' }));
      }

      configId = configResult.value.configId;
    }

    // 2. Execute build
    return this.buildOrchestrator.buildExample(configId, dto.operatorNames);
  }

  /**
   * Get build config ID
   */
  async getBuildConfigId(): Promise<Result<number, ConfigNotFoundError>> {
    const configResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * Get build example config ID
   */
  async getBuildExampleConfigId(): Promise<
    Result<number, ConfigNotFoundError>
  > {
    const configResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例构建配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * Get simulate config ID
   */
  async getSimulateConfigId(): Promise<Result<number, ConfigNotFoundError>> {
    const configResult = await this.configRepo.findByType(ConfigType.SIMULATE);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('simulate', { reason: '未找到仿真配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * Get on-board config ID
   */
  async getOnBoardConfigId(): Promise<Result<number, ConfigNotFoundError>> {
    const configResult = await this.configRepo.findByType(ConfigType.ON_BOARD);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('on_board', { reason: '未找到上板配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * Get sanitizer config ID
   */
  async getSanitizerConfigId(): Promise<Result<number, ConfigNotFoundError>> {
    const configResult = await this.configRepo.findByType(ConfigType.SANITIZER);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('sanitizer', { reason: '未找到异常检测配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * Start simulation analysis
   * Flow: 1) get simulate config and simulator type 2) get build/example configs 3) run simulate (with pre-build)
   */
  async startSimulate(): Promise<
    Result<void, SimulateFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    // 1. Get simulate config and simulator type
    const simulateConfigResult = await this.configRepo.findByType(ConfigType.SIMULATE);

    if (ResultUtils.isErr(simulateConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('simulate', { reason: '未找到仿真配置' }));
    }

    const simulatorType =
      (simulateConfigResult.value.userOptions?.simulatorType as
      | string
      | undefined) ?? '';

    // 2. Get build config ID
    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    // 3. Get example config ID
    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 4. Execute simulate
    return this.buildOrchestrator.simulate(
      buildConfigResult.value.configId,
      simulateConfigResult.value.configId,
      exampleConfigResult.value.configId,
      simulatorType,
    );
  }

  /**
   * Start on-board analysis
   * Flow: 1) get on-board config 2) get build/example configs 3) run on-board (with pre-build)
   */
  async startOnBoard(): Promise<
    Result<void, OnBoardFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    // 1. Get on-board config
    const onBoardConfigResult = await this.configRepo.findByType(ConfigType.ON_BOARD);

    if (ResultUtils.isErr(onBoardConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('on_board', { reason: '未找到上板配置' }));
    }

    // 2. Get build config ID
    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    // 3. Get example config ID
    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 4. Execute on-board
    return this.buildOrchestrator.onBoard(
      buildConfigResult.value.configId,
      onBoardConfigResult.value.configId,
      exampleConfigResult.value.configId,
    );
  }

  /**
   * Run sanitizer (anomaly detection)
   * Flow: 1) get sanitizer config 2) get build/example configs 3) run sanitizer (with pre-build)
   */
  async runSanitizer(): Promise<
    Result<void, SanitizerFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    // 1. Get sanitizer config
    const sanitizerConfigResult = await this.configRepo.findByType(ConfigType.SANITIZER);

    if (ResultUtils.isErr(sanitizerConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('sanitizer', { reason: '未找到异常检测配置' }));
    }

    // 2. Get build config ID
    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    // 3. Get example config ID
    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 4. Execute sanitizer
    return this.buildOrchestrator.sanitizer(
      buildConfigResult.value.configId,
      sanitizerConfigResult.value.configId,
      exampleConfigResult.value.configId,
    );
  }

  /**
   * Get sanitizer config list
   */
  async getSanitizerConfigs(): Promise<Result<unknown[], Error>> {
    try {
      const configResult = await this.configRepo.findByType(ConfigType.SANITIZER);

      if (ResultUtils.isErr(configResult)) {
        // No config: return empty array
        return ResultUtils.ok([]);
      }

      // Convert to format expected by frontend
      const config = {
        config_id: configResult.value.configId,
        config_name: configResult.value.configName,
        config_type: configResult.value.configType.value,
        user_options: configResult.value.userOptions,
      };

      return ResultUtils.ok([config]);
    }
    catch (error) {
      return ResultUtils.err(error as Error);
    }
  }

  /**
   * Save sanitizer form config
   */
  async saveSanitizerForm(params: {
    data: unknown;
    showMessage?: boolean;
  }): Promise<Result<void, Error>> {
    try {
      // 1. Get current config
      const configsResult = await this.getSanitizerConfigs();

      if (ResultUtils.isErr(configsResult)) {
        return configsResult;
      }

      const currentConfig = configsResult.value[0] as {
        config_id: number;
        config_name: string;
        config_type: string;
        user_options?: Record<string, unknown>;
      };

      if (!currentConfig) {
        return ResultUtils.err(new Error('未找到异常检测配置'));
      }

      // 2. Merge config
      const updatedConfig = {
        ...currentConfig,
        user_options: {
          ...(currentConfig.user_options || {}),
          ...(params.data as Record<string, unknown>),
        },
      };

      // 3. Save config
      const entities = await this.configRepo.findAll();

      if (ResultUtils.isErr(entities)) {
        return entities;
      }

      // Find sanitizer config and update
      const updatedEntities = entities.value.map((entity) => {
        if (entity.configType.value === 'sanitizer') {
          return entity.updateUserOptions(updatedConfig.user_options as Record<string, unknown>);
        }

        return entity;
      });

      // Save
      const saveResult = await this.configRepo.save(updatedEntities);

      if (ResultUtils.isErr(saveResult)) {
        return saveResult;
      }

      return ResultUtils.ok(undefined);
    }
    catch (error) {
      return ResultUtils.err(error as Error);
    }
  }
}
