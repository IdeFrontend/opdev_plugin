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
 * 构建应用服务 DTO
 */
export interface StartBuildDto {
  configId?: number;
  compileOption?: string;
  operatorNames?: string; // 算子名称，多个用逗号分隔（用于标准自定义算子等场景）
  operatorType?: string; // 算子类型，用于标识编译哪种类型的算子（如 'standard-custom'）
}

export interface StartRunDto {
  configId?: number;
}

export interface StartBuildExampleDto {
  configId?: number;
  operatorNames?: string; // 算子名称，多个用逗号分隔（用于标准自定义算子等场景）
  operatorType?: string; // 算子类型，用于标识编译哪种类型的算子（如 'standard-custom'）
}

/**
 * 构建应用服务
 * 应用层,负责业务编排
 */
export class BuildApplicationService {
  constructor(
    private configRepo: IConfigRepository,
    private buildOrchestrator: BuildOrchestratorService,
  ) {}

  /**
   * 开始构建算子
   */
  async startBuild(dto: StartBuildDto): Promise<Result<void, BuildFailedError | ConfigNotFoundError>> {
    // 1. 获取配置ID
    let configId = dto.configId;

    if (!configId) {
      const configResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

      if (ResultUtils.isErr(configResult)) {
        return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
      }

      configId = configResult.value.configId;
    }

    // 2. 执行构建
    return this.buildOrchestrator.build(configId, dto.compileOption, dto.operatorNames);
  }

  /**
   * 开始运行算子
   */
  async startRun(dto: StartRunDto): Promise<Result<void, BuildFailedError | ConfigNotFoundError>> {
    // 1. 获取配置ID
    let configId = dto.configId;

    if (!configId) {
      const configResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

      if (ResultUtils.isErr(configResult)) {
        return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到运行配置' }));
      }

      configId = configResult.value.configId;
    }

    // 2. 执行运行
    return this.buildOrchestrator.run(configId);
  }

  /**
   * 开始构建示例
   */
  async startBuildExample(dto: StartBuildExampleDto): Promise<Result<void, BuildFailedError | ConfigNotFoundError>> {
    // 1. 获取配置ID
    let configId = dto.configId;

    if (!configId) {
      const configResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

      if (ResultUtils.isErr(configResult)) {
        return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例构建配置' }));
      }

      configId = configResult.value.configId;
    }

    // 2. 执行构建
    return this.buildOrchestrator.buildExample(configId, dto.operatorNames);
  }

  /**
   * 获取构建配置ID
   */
  async getBuildConfigId(): Promise<Result<number, ConfigNotFoundError>> {
    const configResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * 获取示例构建配置ID
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
   * 获取仿真配置ID
   */
  async getSimulateConfigId(): Promise<Result<number, ConfigNotFoundError>> {
    const configResult = await this.configRepo.findByType(ConfigType.SIMULATE);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('simulate', { reason: '未找到仿真配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * 获取上板配置ID
   */
  async getOnBoardConfigId(): Promise<Result<number, ConfigNotFoundError>> {
    const configResult = await this.configRepo.findByType(ConfigType.ON_BOARD);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('on_board', { reason: '未找到上板配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * 获取异常检测配置ID
   */
  async getSanitizerConfigId(): Promise<Result<number, ConfigNotFoundError>> {
    const configResult = await this.configRepo.findByType(ConfigType.SANITIZER);

    if (ResultUtils.isErr(configResult)) {
      return ResultUtils.err(new ConfigNotFoundError('sanitizer', { reason: '未找到异常检测配置' }));
    }

    return ResultUtils.ok(configResult.value.configId);
  }

  /**
   * 开始仿真分析
   * 业务流程:
   * 1. 获取仿真配置和仿真器类型
   * 2. 获取构建配置和示例配置
   * 3. 执行仿真 (包含前置编译)
   */
  async startSimulate(): Promise<
    Result<void, SimulateFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    // 1. 获取仿真配置及仿真器类型
    const simulateConfigResult = await this.configRepo.findByType(ConfigType.SIMULATE);

    if (ResultUtils.isErr(simulateConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('simulate', { reason: '未找到仿真配置' }));
    }

    const simulatorType =
      (simulateConfigResult.value.userOptions?.simulatorType as
      | string
      | undefined) ?? '';

    // 2. 获取构建配置ID
    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    // 3. 获取示例配置ID
    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 4. 执行仿真
    return this.buildOrchestrator.simulate(
      buildConfigResult.value.configId,
      simulateConfigResult.value.configId,
      exampleConfigResult.value.configId,
      simulatorType,
    );
  }

  /**
   * 开始上板分析
   * 业务流程:
   * 1. 获取上板配置
   * 2. 获取构建配置和示例配置
   * 3. 执行上板 (包含前置编译)
   */
  async startOnBoard(): Promise<
    Result<void, OnBoardFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    // 1. 获取上板配置
    const onBoardConfigResult = await this.configRepo.findByType(ConfigType.ON_BOARD);

    if (ResultUtils.isErr(onBoardConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('on_board', { reason: '未找到上板配置' }));
    }

    // 2. 获取构建配置ID
    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    // 3. 获取示例配置ID
    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 4. 执行上板
    return this.buildOrchestrator.onBoard(
      buildConfigResult.value.configId,
      onBoardConfigResult.value.configId,
      exampleConfigResult.value.configId,
    );
  }

  /**
   * 运行异常检测
   * 业务流程:
   * 1. 获取异常检测配置
   * 2. 获取构建配置和示例配置
   * 3. 执行异常检测 (包含前置编译)
   */
  async runSanitizer(): Promise<
    Result<void, SanitizerFailedError | BuildFailedError | ConfigNotFoundError>
  > {
    // 1. 获取异常检测配置
    const sanitizerConfigResult = await this.configRepo.findByType(ConfigType.SANITIZER);

    if (ResultUtils.isErr(sanitizerConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('sanitizer', { reason: '未找到异常检测配置' }));
    }

    // 2. 获取构建配置ID
    const buildConfigResult = await this.configRepo.findByType(ConfigType.BUILD_OP);

    if (ResultUtils.isErr(buildConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_op', { reason: '未找到构建配置' }));
    }

    // 3. 获取示例配置ID
    const exampleConfigResult = await this.configRepo.findByType(ConfigType.BUILD_EXAMPLE);

    if (ResultUtils.isErr(exampleConfigResult)) {
      return ResultUtils.err(new ConfigNotFoundError('build_example', { reason: '未找到示例配置' }));
    }

    // 4. 执行异常检测
    return this.buildOrchestrator.sanitizer(
      buildConfigResult.value.configId,
      sanitizerConfigResult.value.configId,
      exampleConfigResult.value.configId,
    );
  }

  /**
   * 获取异常检测配置列表
   */
  async getSanitizerConfigs(): Promise<Result<unknown[], Error>> {
    try {
      const configResult = await this.configRepo.findByType(ConfigType.SANITIZER);

      if (ResultUtils.isErr(configResult)) {
        // 如果没有配置，返回空数组
        return ResultUtils.ok([]);
      }

      // 转换为前端需要的格式
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
   * 保存异常检测表单配置
   */
  async saveSanitizerForm(params: {
    data: unknown;
    showMessage?: boolean;
  }): Promise<Result<void, Error>> {
    try {
      // 1. 获取当前配置
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

      // 2. 合并配置
      const updatedConfig = {
        ...currentConfig,
        user_options: {
          ...(currentConfig.user_options || {}),
          ...(params.data as Record<string, unknown>),
        },
      };

      // 3. 保存配置
      const entities = await this.configRepo.findAll();

      if (ResultUtils.isErr(entities)) {
        return entities;
      }

      // 找到 sanitizer 配置并更新
      const updatedEntities = entities.value.map((entity) => {
        if (entity.configType.value === 'sanitizer') {
          return entity.updateUserOptions(updatedConfig.user_options as Record<string, unknown>);
        }

        return entity;
      });

      // 保存
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
