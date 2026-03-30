import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from '@plugin/service/project-service';
import {
  GetProjectSHResult,
  UpdateShScriptParams,
  SaveProjectSHParams,
} from '@shared/api-types';
import { getProjectById } from '@plugin/domain';

export const scriptMethods = {
  /**
   * 更新脚本文件
   * @param params 更新参数
   * @returns 更新结果
   */
  async updateShScript(params: UpdateShScriptParams): Promise<GetProjectSHResult> {
    await ProjectManager.getInstance()
      .initProject();

    return await projectService.updateShScript(params);
  },



  /**
   * 获取项目环境配置
   * @returns 项目环境配置
   */
  async getProjectEnv(): Promise<{ ascendEnvScript: string; socVersion: string }> {
    const pm = ProjectManager.getInstance();
    await pm.initProject();
    await pm.ensureProjectId();
    const projectId = pm.projectId;

    if (!projectId) {
      return { ascendEnvScript: '', socVersion: '' };
    }

    const project = getProjectById(Number(projectId));

    return {
      ascendEnvScript: project?.ascend_env_script || '',
      socVersion: project?.soc_version || ''
    };
  },

  /**
   * 保存项目环境配置
   * @param params 保存参数
   */
  async saveProjectEnv(params: { ascendEnvScript: string; socVersion: string }): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    // 复用 updateShScript 逻辑
    await projectService.updateShScript({ 
      ascendEnvScript: params.ascendEnvScript,
      soc_version: params.socVersion 
    });
  },
};
