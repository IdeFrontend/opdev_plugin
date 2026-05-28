import { ProjectManager } from '@plugin/core/project/project-manager';
import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import { projectService } from '@plugin/service/project-service';
import {
  GetProjectSHResult,
  UpdateShScriptParams,
} from '@shared/api-types';

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
    return {
      ascendEnvScript: await projectService.getProjectSH(),
      socVersion: resolveEffectiveCannSoc(),
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
