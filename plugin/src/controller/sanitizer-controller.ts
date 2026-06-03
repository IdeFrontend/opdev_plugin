import { ProjectManager } from '@plugin/core/project/project-manager';
import { configService } from '@plugin/service/config-service';
import { SaveSanitizerFormParams } from '@shared/api-types';

export const sanitizerViewMethods = {
  /**
   * Get a list of Sanitizer configurations (ops/getSanitizerConfigs)
   */
  async getSanitizerConfigs() {
    await ProjectManager.getInstance()
      .initProject();

    return await configService.getSanitizerConfigsList();
  },

  /**
   * Save Sanitizer configuration
   */
  async saveSanitizerForm(params: SaveSanitizerFormParams): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await configService.saveSanitizerForm(params);
  },
};
