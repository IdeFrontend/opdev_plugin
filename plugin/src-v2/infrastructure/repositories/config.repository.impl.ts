import {
  Result, ResultUtils,
} from '@plugin-v2/domain/shared/types/result.type';
import { IConfigRepository } from '@plugin-v2/domain/operator/repositories/config.repository';
import { BuildConfigEntity } from '@plugin-v2/domain/operator/entities/build-config.entity';
import { ConfigType } from '@plugin-v2/domain/operator/value-objects/config-type.vo';
import { ConfigNotFoundError } from '@plugin-v2/domain/shared/errors/base.error';
import {
  getConfig, postConfig,
} from '@plugin/domain';

/**
 * 配置仓储实现
 * 基础设施层,对接现有的 domain 层数据访问
 */
export class ConfigRepositoryImpl implements IConfigRepository {
  constructor(private projectId: number) {}

  async findById(configId: number): Promise<Result<BuildConfigEntity, Error>> {
    try {
      // 获取所有配置
      const allConfigsResult = await this.findAll();

      if (ResultUtils.isErr(allConfigsResult)) {
        return allConfigsResult;
      }

      // 查找指定ID的配置
      const config = allConfigsResult.value.find((c) => c.configId === configId);

      if (!config) {
        return ResultUtils.err(new ConfigNotFoundError(`配置ID: ${configId}`, { configId }));
      }

      return ResultUtils.ok(config);
    }
    catch (error) {
      return ResultUtils.err(error as Error);
    }
  }

  async findByType(configType: ConfigType | string): Promise<Result<BuildConfigEntity, Error>> {
    try {
      const typeValue =
        typeof configType === 'string' ? configType : configType.value;

      // 调用现有的 getConfig 函数
      const configs = await getConfig(this.projectId, typeValue);

      if (!configs || configs.length === 0) {
        return ResultUtils.err(new ConfigNotFoundError(typeValue, { configType: typeValue }));
      }

      // 转换为实体 - 使用类型断言,因为 getConfig 返回的类型更复杂
      const entity = BuildConfigEntity.fromRaw(configs[0] as unknown as {
        config_id: number;
        config_name: string;
        config_type: string;
        user_options?: Record<string, unknown>;
      });

      if (!entity) {
        return ResultUtils.err(new Error(`无法解析配置类型: ${configs[0].config_type}`));
      }

      return ResultUtils.ok(entity);
    }
    catch (error) {
      return ResultUtils.err(error as Error);
    }
  }

  async findAll(): Promise<Result<BuildConfigEntity[], Error>> {
    try {
      // 获取所有类型的配置
      const [
        opConfigs,
        exampleConfigs,
        simulateConfigs,
        onBoardConfigs,
      ] =
        await Promise.all([
          getConfig(this.projectId, 'build_op'),
          getConfig(this.projectId, 'build_example'),
          getConfig(this.projectId, 'simulate'),
          getConfig(this.projectId, 'on_board'),
        ]);

      // 合并所有配置并转换为实体
      const allConfigs = [
        ...opConfigs,
        ...exampleConfigs,
        ...simulateConfigs,
        ...onBoardConfigs,
      ];

      const entities = allConfigs
        .map((c) => BuildConfigEntity.fromRaw(c as unknown as {
          config_id: number;
          config_name: string;
          config_type: string;
          user_options?: Record<string, unknown>;
        }))
        .filter((e): e is BuildConfigEntity => e !== undefined);

      return ResultUtils.ok(entities);
    }
    catch (error) {
      return ResultUtils.err(error as Error);
    }
  }

  async save(configs: BuildConfigEntity[]): Promise<Result<void, Error>> {
    try {
      // 转换为原始数据格式
      const rawConfigs = configs.map((c) => c.toRaw());

      // 调用现有的 postConfig 函数
      await postConfig('build', rawConfigs);

      return ResultUtils.ok(undefined);
    }
    catch (error) {
      return ResultUtils.err(error as Error);
    }
  }
}
