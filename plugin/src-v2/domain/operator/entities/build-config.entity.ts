import { ConfigType } from '../value-objects/config-type.vo';

/**
 * Build config entity
 */
export class BuildConfigEntity {
  constructor(
    public readonly configId: number,
    public readonly configName: string,
    public readonly configType: ConfigType,
    public readonly userOptions?: Record<string, unknown>,
  ) {}

  /**
   * Create entity from raw data
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
   * Convert to raw data
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
   * Update user options (returns new entity, immutable)
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
