import { ProjectManager } from '../core/project/project-manager';
import { projectService } from '../service/project-service';
import {
  GetProjectSHResult,
  UpdateShScriptParams,
  SaveProjectSHParams,
} from 'shared:/api-types';

export const scriptMethods = {
  /**
   * 更新脚本文件
   * @param params 更新参数
   * @returns 更新结果
   */
  async updateShScript(
    params: UpdateShScriptParams,
  ): Promise<GetProjectSHResult> {
    await ProjectManager.getInstance().initProject();

    return await projectService.updateShScript(params);
  },

  /**
   * 获取项目SH脚本
   * @returns 项目SH脚本结果
   */
  async getProjectSH(): Promise<GetProjectSHResult> {
    return await projectService.getProjectSH();
  },

  /**
   * 保存项目SH脚本
   * @param params 保存参数
   */
  async saveProjectSH(params: SaveProjectSHParams): Promise<void> {
    await ProjectManager.getInstance().initProject();
    // 复用 updateShScript 逻辑
    await projectService.updateShScript({
      accendEnvScript: params.projectSH,
    });
  },
};


