import * as vscode from 'vscode';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { OpsAPI } from '../helpers/OpsAPI';
import { RemoteConfig } from '../helpers/RemoteConfig';
import { Project } from '../services/project/Project';
import {
  GetProjectIdResult,
  GetHomeResult,
  GetProjectSHResult,
  GetWorkspaceResult,
  GetLastProjectPathResult,
} from 'shared:/api-types';

export const homeApis: ApiGroup = {
  webview: {
    // 获取项目ID
    async getProjectId(): Promise<GetProjectIdResult> {
      await OpsAPI.init();

      return OpsAPI.getProjectId();
    },

    // 获取HOME目录
    getHome(): GetHomeResult {
      return process.env.HOME || '';
    },

    // 获取项目SH脚本
    async getProjectSH(): Promise<GetProjectSHResult> {
      const project = Project.getInstance();

      return process.env.ASCEND_ENV_SCRIPT || project.projectSH || '';
    },

    // 更新Project
    async updateProject(): Promise<void> {
      const project = Project.getInstance();

      project.updateView();
    },

    // 获取工作区路径
    getWorkspace(): GetWorkspaceResult {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      return workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].uri.fsPath
        : null;
    },

    // 获取最后项目路径 - 从远程服务器读取
    async getLastProjectPath(): Promise<GetLastProjectPathResult> {
      return RemoteConfig.getLastProjectPath();
    },
  },
};
