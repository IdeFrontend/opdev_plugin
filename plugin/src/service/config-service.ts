import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  SaveBuildConfigParams,
  SaveConfigParams,
  SaveSanitizerFormParams,
  BuildConfig,
  RemotePathSearchParams,
  RemotePathSearchResult,
} from '@shared/api-types';
import {
  postConfig, getConfig, getFiles,
} from '@plugin/domain';

const CONFIG_TYPES = { SANITIZER: 'sanitizer' } as const;

export class ConfigService {
  /**
   * 远程路径搜索
   */
  async remotePathSearch(params: RemotePathSearchParams): Promise<RemotePathSearchResult> {
    const res = getFiles(params.keyword);

    return {
      type: params.type,
      list: res,
    };
  }

  /**
   * 保存构建配置
   */
  async saveBuildConfig(params: SaveBuildConfigParams): Promise<void> {
    try {
      await postConfig('build', params.data as unknown[]);

      if (params.showMessage) {
        vscode.window.showInformationMessage('保存编译配置成功');
      }
    }
    catch {
      vscode.window.showErrorMessage('保存编译配置失败');
    }
  }

  /**
   * 保存配置（仿真/上板）
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await postConfig(params.type, params.data as unknown[]);

    if (params.showMessage) {
      vscode.window.showInformationMessage('保存配置成功');
    }
  }

  /**
   * 检查 devtool_config.json 配置文件是否存在
   * 优先检查 ProjectManager 中的项目路径，如果不存在则检查当前工作区
   */
  async checkDevtoolConfig(): Promise<boolean> {
    const pm = ProjectManager.getInstance();

    // 优先使用 ProjectManager 的项目路径
    const projectInfo = pm.getProjectInfo();
    let checkPath: string | undefined;

    if (projectInfo?.path) {
      checkPath = projectInfo.path;
      console.log('checkDevtoolConfig: 使用 ProjectManager 项目路径:', checkPath);
    }
    else {
      // 回退到工作区路径
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 0) {
        checkPath = workspaceFolders[0].uri.fsPath;
        console.log('checkDevtoolConfig: 使用工作区路径:', checkPath);
      }
    }

    if (!checkPath) {
      console.log('checkDevtoolConfig: 没有可用的路径，返回 false');

      return false;
    }

    const devtoolConfigPath = path.join(
      checkPath,
      '.vscode',
      'devtool_config.json',
    );

    try {
      const exists = fs.existsSync(devtoolConfigPath);

      console.log('checkDevtoolConfig: 配置文件路径:', devtoolConfigPath, '存在:', exists);

      return exists;
    }
    catch (error) {
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

    return config.map((c) => ({
      ...c,
      user_options: c.user_options ? (c.user_options as Record<string, unknown>) : undefined,
    })) as BuildConfig[];
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
          user_options: {
            ...(formData.user_options || {}),
            ...(params.data as Record<string, unknown>),
          },
        },
      ]);

      if (params.showMessage) {
        vscode.window.showInformationMessage('保存异常检测配置成功');
      }
    }
    catch {
      vscode.window.showErrorMessage('保存异常检测配置失败');
    }
  }
}

export const configService = new ConfigService();
