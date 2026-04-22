import { Result } from '@plugin-v2/domain/shared/types/result.type';
import { BuildConfigEntity } from '../entities/build-config.entity';
import { ConfigType } from '../value-objects/config-type.vo';

/**
 * Config repository interface
 * Defines data access abstraction
 */
export interface IConfigRepository {
  /**
   * Find config by ID
   */
  findById(configId: number): Promise<Result<BuildConfigEntity, Error>>;

  /**
   * Find config by type
   */
  findByType(configType: ConfigType | string): Promise<Result<BuildConfigEntity, Error>>;

  /**
   * Get all configs
   */
  findAll(): Promise<Result<BuildConfigEntity[], Error>>;

  /**
   * Save configs
   */
  save(configs: BuildConfigEntity[]): Promise<Result<void, Error>>;
}
