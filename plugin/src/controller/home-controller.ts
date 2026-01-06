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
};
