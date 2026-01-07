import { Result } from '@plugin-v2/domain/shared/types/result.type';
import { BuildConfigEntity } from '../entities/build-config.entity';
import { ConfigType } from '../value-objects/config-type.vo';

/**
 * 配置仓储接口
 * 定义数据访问抽象
 */
export interface IConfigRepository {
  /**
   * 根据ID查找配置
   */
  findById(configId: number): Promise<Result<BuildConfigEntity, Error>>;

  /**
   * 根据类型查找配置
   */
  findByType(configType: ConfigType | string): Promise<Result<BuildConfigEntity, Error>>;

  /**
   * 获取所有配置
   */
  findAll(): Promise<Result<BuildConfigEntity[], Error>>;

  /**
   * 保存配置
   */
  save(configs: BuildConfigEntity[]): Promise<Result<void, Error>>;
}
