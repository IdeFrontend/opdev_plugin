import { ProjectManager } from '../core/project/project-manager';
import { configService } from '../service/config-service';
import { buildService } from '../service/build-service';
import {
  GetConfigDataResult,
  SaveBuildConfigParams,
  SaveConfigParams,
} from 'shared:/api-types';

export const configMethods = {
  /**
   * 获取配置数据
   * @returns 配置数据
   */
  async getConfigData(): Promise<GetConfigDataResult> {
    // 确保projectId已初始化
    await ProjectManager.getInstance().ensureProjectId();
    const buildConfigs = await buildService.getBuildConfigsList();

    console.log('buildConfigs', buildConfigs);
    if (!buildConfigs.length) {
      return {};
    }

    return { [buildConfigs[0].config_name]: buildConfigs };
  },

  /**
   * 保存构建配置
   * @param params 保存参数
   */
  async saveBuildConfig(params: SaveBuildConfigParams): Promise<void> {
    await ProjectManager.getInstance().initProject();
    await configService.saveBuildConfig(params);
  },

  /**
   * 保存配置（仿真/上板）
   * @param params 保存参数
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await ProjectManager.getInstance().initProject();
    await configService.saveConfig(params);
  },
};
