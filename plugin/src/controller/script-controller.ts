import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import { projectService } from '@plugin/service/project-service';

export const scriptMethods = {
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
};
