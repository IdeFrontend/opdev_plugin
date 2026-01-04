import * as vscode from 'vscode';
import { ProjectManager } from '../core/project/project-manager';
import { configService } from '../service/config-service';
import { buildService } from '../service/build-service';
import {
  GetConfigDataResult,
  SaveBuildConfigParams,
  SaveConfigParams,
  RemotePathSearchParams,
  RemotePathSearchResult,
} from 'shared:/api-types';

export const configMethods = {
  /**
   * 获取构建配置列表
   * @returns 构建配置列表
   */
  async getBuildConfigs() {
    // 确保projectId已初始化
    await ProjectManager.getInstance().ensureProjectId();

    return await buildService.getBuildConfigsList();
  },

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

  /**
   * 远程路径搜索
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async remotePathSearch(
    params: RemotePathSearchParams,
  ): Promise<RemotePathSearchResult> {
    return await configService.remotePathSearch(params);
  },

  /**
   * 获取构建配置ID
   * @returns 构建配置ID
   */
  async getBuildConfig(): Promise<number | undefined> {
    await ProjectManager.getInstance().ensureProjectId();

    return await buildService.getBuildConfigId();
  },

  /**
   * 获取示例构建配置ID
   * @returns 示例构建配置ID
   */
  async getBuildExampleConfig(): Promise<number | undefined> {
    await ProjectManager.getInstance().ensureProjectId();

    return await buildService.getBuildExampleConfigId();
  },

  /**
   * 获取仿真配置ID
   * @returns 仿真配置ID
   */
  async getSimulateConfig(): Promise<string> {
    await ProjectManager.getInstance().ensureProjectId();

    return await buildService.getSimulateConfigId();
  },

  /**
   * 获取上板配置ID
   * @returns 上板配置ID
   */
  async getOnBoardConfig(): Promise<string> {
    await ProjectManager.getInstance().ensureProjectId();

    return await buildService.getOnBoardConfigId();
  },

  /**
   * 打开配置页面
   * @param params 参数
   */
};
