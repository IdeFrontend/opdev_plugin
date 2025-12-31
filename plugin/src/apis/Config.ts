import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { OpsAPI } from '../helpers/OpsAPI';
import { getFiles } from '../../autogen-server';
import {
  GetBuildConfigResult,
  SaveAndStartBuildParams,
  SaveAndStartBuildExampleParams,
  SetActiveConfigParams,
  GetActiveConfigResult,
  CheckDevtoolConfigResult,
  RemotePathSearchParams,
  RemotePathSearchResult,
  SaveBuildConfigParams,
} from 'shared:/api-types';

// 临时存储当前激活的配置
const tempObj = { currentActiveConfig: '' };

export const configApis: ApiGroup = {
  webview: {
    // 获取构建配置
    async getBuildConfig(): Promise<GetBuildConfigResult> {
      await OpsAPI.init();
      const configData = await OpsAPI.getConfigData();
      return JSON.stringify(configData);
    },

    // 保存构建配置（返回字符串格式）
    async saveBuildConfig(params: SaveBuildConfigParams): Promise<GetBuildConfigResult> {
      await OpsAPI.init();
      await OpsAPI.saveBuildConfig(params.data);
      const configData = await OpsAPI.getConfigData();
      return JSON.stringify(configData);
    },

    // 保存并开始构建
    async saveAndStartBuild(params: SaveAndStartBuildParams): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.saveBuildConfig(params.data, false);
      const configData = await OpsAPI.getConfigData();
      const config_id = params.data.find((v: any) => v.config_type === 'build_op').config_id;
      await OpsAPI.startBuild(config_id);
    },

    // 保存并开始构建示例
    async saveAndStartBuildExample(params: SaveAndStartBuildExampleParams): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.saveBuildConfig(params.data, false);
      const config_id = params.data.find((v: any) => v.config_type === 'build_example').config_id;
      await OpsAPI.startBuildExample(config_id);
    },

    // 设置激活的配置
    setActiveConfig(params: SetActiveConfigParams): void {
      tempObj.currentActiveConfig = params.configId;
    },

    // 获取激活的配置
    getActiveConfig(): GetActiveConfigResult {
      return tempObj.currentActiveConfig;
    },

    // 保存配置
    async saveConfig(params: { type: string; data: any }): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.saveConfig(params.type, params.data);
    },

    // 远程路径搜索
    remotePathSearch(params: RemotePathSearchParams): RemotePathSearchResult {
      const res = getFiles(params.keyword);
      return {
        type: params.type,
        list: res,
      };
    },
  },
};

