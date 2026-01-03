import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ProjectManager } from '../core/project/project-manager';
import {
  SaveBuildConfigParams,
  SaveConfigParams,
  SaveSanitizerFormParams,
  BuildConfig,
} from 'shared:/api-types';
import { postConfig, getConfig } from '../../autogen-server';

const CONFIG_TYPES = {
  SANITIZER: 'sanitizer',
} as const;

export class ConfigService {
  /**
   * 保存构建配置
   */
  async saveBuildConfig(params: SaveBuildConfigParams): Promise<void> {
    try {
      await postConfig('build', params.data);
      if (params.showMessage) {
        vscode.window.showInformationMessage(`保存编译配置成功`);
      }
    } catch {
      vscode.window.showErrorMessage(`保存编译配置失败`);
    }
  }

  /**
   * 保存配置（仿真/上板）
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await postConfig(params.type, params.data);
    if (params.showMessage) {
      vscode.window.showInformationMessage(`保存配置成功`);
    }
  }

  /**
   * 检查 devtool_config.json 配置文件是否存在
   */
  async checkDevtoolConfig(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const devtoolConfigPath = path.join(
      workspacePath,
      '.vscode',
      'devtool_config.json',
    );

    try {
      return fs.existsSync(devtoolConfigPath);
    } catch (error) {
      console.error('检查 devtool_config.json 文件时出错:', error);

      return false;
    }
  }

  /**
   * 获取异常检测配置列表
   */
  async getSanitizerConfigsList(): Promise<BuildConfig[]> {
    const projectId = ProjectManager.getInstance().projectId;
    const config = getConfig(Number(projectId), CONFIG_TYPES.SANITIZER);

    return [...config] as BuildConfig[];
  }

  /**
   * 保存异常检测表单配置
   */
  async saveSanitizerForm(params: SaveSanitizerFormParams): Promise<void> {
    try {
      const formData = (await this.getSanitizerConfigsList())[0];

      await postConfig(CONFIG_TYPES.SANITIZER, [
        {
          ...formData,
          user_options: { ...formData.user_options, ...params.data },
        },
      ]);
      if (params.showMessage) {
        vscode.window.showInformationMessage(`保存异常检测配置成功`);
      }
    } catch {
      vscode.window.showErrorMessage(`保存异常检测配置失败`);
    }
  }
}

export const configService = new ConfigService();
