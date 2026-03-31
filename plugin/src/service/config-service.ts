import { t } from 'i18next';
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
   * Remote path search
   */
  async remotePathSearch(params: RemotePathSearchParams): Promise<RemotePathSearchResult> {
    const res = getFiles(params.keyword);

    return {
      type: params.type,
      list: res,
    };
  }

  /**
   * Save build configuration
   */
  async saveBuildConfig(params: SaveBuildConfigParams): Promise<void> {
    try {
      await postConfig('build', params.data as unknown[]);

      if (params.showMessage) {
        vscode.window.showInformationMessage(t('config.saveBuildConfigSuccess'));
      }
    }
    catch {
      vscode.window.showErrorMessage(t('config.saveBuildConfigFailed'));
    }
  }

  /**
   * Save configuration (simulation/boarding)
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await postConfig(params.type, params.data as unknown[]);

    if (params.showMessage) {
      vscode.window.showInformationMessage(t('config.saveConfigSuccess'));
    }
  }

  /**
   * Check whether the devtool_config.json configuration file exists
   * First check the project path in ProjectManager, if it does not exist, check the current workspace
   */
  async checkDevtoolConfig(): Promise<boolean> {
    const pm = ProjectManager.getInstance();

    // Prioritize the project path of ProjectManager
    const projectInfo = pm.getProjectInfo();
    let checkPath: string | undefined;

    if (projectInfo?.path) {
      checkPath = projectInfo.path;
      console.log('checkDevtoolConfig: using ProjectManager project path:', checkPath);
    }
    else {
      // Fallback to workspace path
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 0) {
        checkPath = workspaceFolders[0].uri.fsPath;
        console.log('checkDevtoolConfig: using workspace path:', checkPath);
      }
    }

    if (!checkPath) {
      console.log('checkDevtoolConfig: no available path, return false');

      return false;
    }

    const devtoolConfigPath = path.join(
      checkPath,
      '.vscode',
      'devtool_config.json',
    );

    try {
      const exists = fs.existsSync(devtoolConfigPath);

      console.log('checkDevtoolConfig: config file path:', devtoolConfigPath, 'exists:', exists);

      return exists;
    }
    catch (error) {
      console.error('Error while checking devtool_config.json file:', error);

      return false;
    }
  }

  /**
   * Get anomaly detection configuration list
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
   * Save anomaly detection form configuration
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
        vscode.window.showInformationMessage(t('config.saveSanitizerConfigSuccess'));
      }
    }
    catch {
      vscode.window.showErrorMessage(t('config.saveSanitizerConfigFailed'));
    }
  }
}

export const configService = new ConfigService();
