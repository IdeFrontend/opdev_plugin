import { ConfigType } from '../value-objects/config-type.vo';

/**
 * 构建配置实体
 */
export class BuildConfigEntity {
  constructor(
    public readonly configId: number,
    public readonly configName: string,
    public readonly configType: ConfigType,
    public readonly userOptions?: Record<string, unknown>,
  ) {}

  /**
   * 从原始数据创建实体
   */
  static fromRaw(data: {
    config_id: number;
    config_name: string;
    config_type: string;
    user_options?: Record<string, unknown>;
  }): BuildConfigEntity | undefined {
    const configType = ConfigType.fromString(data.config_type);

    if (!configType) {
      return undefined;
    }

    return new BuildConfigEntity(
      data.config_id,
      data.config_name,
      configType,
      data.user_options,
    );
  }

  /**
   * 转换为原始数据
   */
  toRaw(): {
    config_id: number;
    config_name: string;
    config_type: string;
    user_options?: Record<string, unknown>;
  } {
    return {
      config_id: this.configId,
      config_name: this.configName,
      config_type: this.configType.value,
      user_options: this.userOptions,
    };
  }

  /**
   * 更新用户选项（返回新实体，保持不可变性）
   */
  updateUserOptions(newOptions: Record<string, unknown>): BuildConfigEntity {
    return new BuildConfigEntity(
      this.configId,
      this.configName,
      this.configType,
      newOptions,
    );
  }
}
