import * as vscode from 'vscode';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { OpsAPI } from '../helpers/OpsAPI';
import { Project } from '../services/project/Project';
import { SaveProjectSHParams } from 'shared:/api-types';

export const projectSHApis: ApiGroup = {
  webview: {
    // 保存项目SH脚本
    async saveProjectSH(params: SaveProjectSHParams): Promise<void> {
      try {
        await OpsAPI.updateShScript(params.accendEnvScript);
        vscode.window.showInformationMessage('环境变量设置成功', params.accendEnvScript);
        const project = Project.getInstance();
        project.updateView();
      } catch (error) {
        vscode.window.showErrorMessage(`环境变量设置失败: ${error}`);
        throw error;
      }
    },
  },
};

