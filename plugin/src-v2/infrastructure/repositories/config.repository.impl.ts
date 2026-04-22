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
 * Config repository implementation
 * Infrastructure layer; bridges to existing domain data access
 */
export class ConfigRepositoryImpl implements IConfigRepository {
  constructor(private projectId: number) {}

  async findById(configId: number): Promise<Result<BuildConfigEntity, Error>> {
    try {
      // Get all configs
      const allConfigsResult = await this.findAll();

      if (ResultUtils.isErr(allConfigsResult)) {
        return allConfigsResult;
      }

      // Find config by ID
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

      // Call existing getConfig
      const configs = await getConfig(this.projectId, typeValue);

      if (!configs || configs.length === 0) {
        return ResultUtils.err(new ConfigNotFoundError(typeValue, { configType: typeValue }));
      }

      // Convert to entity (type assertion: getConfig return type is more complex)
      const entity = BuildConfigEntity.fromRaw(configs[0] as unknown as {
        config_id: number;
        config_name: string;
        config_type: string;
        user_options?: Record<string, unknown>;
      });

      if (!entity) {
        return ResultUtils.err(new Error(`Cannot parse config type: ${configs[0].config_type}`));
      }

      return ResultUtils.ok(entity);
    }
    catch (error) {
      return ResultUtils.err(error as Error);
    }
  }

  async findAll(): Promise<Result<BuildConfigEntity[], Error>> {
    try {
      // Get configs for all types
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

      // Merge all configs and convert to entities
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
      // Convert to raw format
      const rawConfigs = configs.map((c) => c.toRaw());

      // Call existing postConfig
      await postConfig('build', rawConfigs);

      return ResultUtils.ok(undefined);
    }
    catch (error) {
      return ResultUtils.err(error as Error);
    }
  }
}
