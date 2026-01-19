import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from '@plugin/service/project-service';
import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';
import { RemoteConfig } from '@plugin/helpers/remote-config';
import {
  GetProjectIdResult,
  GetHomeResult,
  InitOpsParams,
  GetWorkspaceResult,
  GetLastProjectPathResult,
} from '@shared/api-types';

export const homeMethods = {
  /**
   * 获取项目ID
   * @returns 项目ID
   */
  async getProjectId(): Promise<GetProjectIdResult> {
    await ProjectManager.getInstance()
      .initProject();

    return ProjectManager.getInstance().projectId;
  },

  /**
   * 获取工作区路径
   * @returns 工作区路径
   */
  async getWorkspace(): Promise<GetWorkspaceResult> {
    const root = ExplorerRootUtils.getPrimaryRoot();

    return root ? root.path : null;
  },

  /**
   * 获取最后项目路径
   * @returns 最后项目路径
   */
  async getLastProjectPath(): Promise<GetLastProjectPathResult> {
    return RemoteConfig.getLastProjectPath();
  },

  /**
   * 初始化项目
   * @param params - 初始化参数
   * @returns 初始化结果
   */
  async initOps(params: InitOpsParams): Promise<GetHomeResult> {
    return await projectService.init(params);
  },

  /**
   * 获取HOME目录
   * @returns HOME目录
   */
  async getHome(): Promise<GetHomeResult> {
    return process.env.HOME || process.env.USERPROFILE || '';
  },

  /**
   * 更新Project
   */
  async updateProject(): Promise<void> {
    // 刷新项目信息
    await ProjectManager.getInstance()
      .initProject();
  },

  /**
   * 检查当前目录下是否有多个算子工程
   * 通过查找包含 .vscode/devtool_config.json 的目录来判断
   * @returns 如果有多个算子工程返回 true，否则返回 false
   */
  async checkMultipleOperators(): Promise<{ hasMultiple: boolean }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { hasMultiple: false };
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const operatorProjects: string[] = [];

    try {
      // 递归查找所有包含 .vscode/devtool_config.json 的目录
      const findOperatorProjects = (dir: string): void => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            // 跳过 node_modules、.git 等常见目录
            if (entry.name.startsWith('.') && entry.name !== '.vscode') {
              continue;
            }

            if (entry.name === 'node_modules' || entry.name === '.git') {
              continue;
            }

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              // 检查该目录下是否有 .vscode/devtool_config.json
              const devtoolConfigPath = path.join(
                fullPath,
                '.vscode',
                'devtool_config.json',
              );

              if (fs.existsSync(devtoolConfigPath)) {
                operatorProjects.push(fullPath);
              }
              else {
                // 继续递归查找子目录
                findOperatorProjects(fullPath);
              }
            }
          }
        }
        catch (error) {
          // 忽略无法访问的目录
          console.warn(`[checkMultipleOperators] 无法访问目录: ${dir}`, error);
        }
      };

      findOperatorProjects(workspacePath);

      const hasMultiple = operatorProjects.length > 1;

      console.log(
        '[checkMultipleOperators] 找到算子工程数量:',
        operatorProjects.length,
        '路径:',
        operatorProjects,
      );

      return { hasMultiple };
    }
    catch (error) {
      console.error('[checkMultipleOperators] 检查算子工程失败:', error);
      return { hasMultiple: false };
    }
  },
};
