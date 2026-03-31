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
   * Update script file
   * @param params update parameters
   * @returns update results
   */
  async updateShScript(params: UpdateShScriptParams): Promise<GetProjectSHResult> {
    await ProjectManager.getInstance()
      .initProject();

    return await projectService.updateShScript(params);
  },



  /**
   * Get project environment configuration (Ascend script and SoC version)
   * @returns project environment values
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
   * Save project environment configuration
   * @param params save parameters
   */
  async saveProjectEnv(params: { ascendEnvScript: string; socVersion: string }): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    // Reuse updateShScript logic
    await projectService.updateShScript({
      ascendEnvScript: params.ascendEnvScript,
      soc_version: params.socVersion,
    });
  },
};
