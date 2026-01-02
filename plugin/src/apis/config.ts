import { ApiGroup } from 'plugin:/core/ApiServer';
import { ProjectManager } from '../services/project/project-manager';
import { opsApis, OpsApi } from './ops';
import { getFiles } from '../../autogen-server';
import {
  GetBuildConfigResult,
  SaveAndStartBuildParams,
  SaveAndStartBuildExampleParams,
  SetActiveConfigParams,
  GetActiveConfigResult,
  RemotePathSearchParams,
  RemotePathSearchResult,
  SaveBuildConfigParams,
} from 'shared:/api-types';

// 获取正确类型的 ops API
const ops = opsApis.ops as unknown as OpsApi;

// 临时存储当前激活的配置
const tempObj = { currentActiveConfig: '' };

export const configApis: ApiGroup = {
  webview: {
    /**
     * 获取构建配置
     * @returns {Promise<GetBuildConfigResult>} 构建配置对象
     */
    async getBuildConfig(): Promise<GetBuildConfigResult> {
      await ProjectManager.getInstance().initProject();

      return await ops.getConfigData();
    },

    /**
     * 保存构建配置
     * @param {SaveBuildConfigParams} params - 保存参数
     * @returns {Promise<GetBuildConfigResult>} 更新后的构建配置对象
     */
    async saveBuildConfig(
      params: SaveBuildConfigParams,
    ): Promise<GetBuildConfigResult> {
      await ProjectManager.getInstance().initProject();
      await ops.saveBuildConfig(params);

      return await ops.getConfigData();
    },

    /**
     * 保存并开始构建
     * @param {SaveAndStartBuildParams} params - 参数
     */
    async saveAndStartBuild(params: SaveAndStartBuildParams): Promise<void> {
      await ProjectManager.getInstance().initProject();
      await ops.saveBuildConfig({ data: params.data, showMessage: false });
      const config_id = params.data.find(
        (v: any) => v.config_type === 'build_op',
      ).config_id;

      await ops.startBuild({ configId: config_id });
    },

    /**
     * 保存并开始构建示例
     * @param {SaveAndStartBuildExampleParams} params - 参数
     */
    async saveAndStartBuildExample(
      params: SaveAndStartBuildExampleParams,
    ): Promise<void> {
      await ProjectManager.getInstance().initProject();
      await ops.saveBuildConfig({ data: params.data, showMessage: false });
      const config_id = params.data.find(
        (v: any) => v.config_type === 'build_example',
      ).config_id;

      await ops.startBuildExample({ configId: config_id });
    },

    /**
     * 设置激活的配置
     * @param {SetActiveConfigParams} params - 参数
     */
    setActiveConfig(params: SetActiveConfigParams): void {
      tempObj.currentActiveConfig = params.configId;
    },

    /**
     * 获取激活的配置
     * @returns {GetActiveConfigResult} 激活的配置ID
     */
    getActiveConfig(): GetActiveConfigResult {
      return tempObj.currentActiveConfig;
    },

    /**
     * 保存通用配置
     * @param {object} params - 类型和数据
     */
    async saveConfig(params: { type: string; data: any }): Promise<void> {
      await ProjectManager.getInstance().initProject();
      await ops.saveConfig(params);
    },

    /**
     * 远程路径搜索
     * @param {RemotePathSearchParams} params - 搜索参数
     * @returns {RemotePathSearchResult} 搜索结果
     */
    remotePathSearch(params: RemotePathSearchParams): RemotePathSearchResult {
      const res = getFiles(params.keyword);

      return {
        type: params.type,
        list: res,
      };
    },
  },
};
