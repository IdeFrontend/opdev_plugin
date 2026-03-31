import { ProjectManager } from '@plugin/core/project/project-manager';
import { configService } from '@plugin/service/config-service';
import { sanitizerService } from '@plugin/service/sanitizer-service';
import {
  GetSanitizerFormResult,
  SaveSanitizerFormParams,
} from '@shared/api-types';

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
   * Get Sanitizer configuration ID
   * @returns Sanitizer configuration ID
   */
  async getSanitizerConfigId(): Promise<number | undefined> {
    await ProjectManager.getInstance()
      .initProject();
    const configData = await configService.getSanitizerConfigsList();

    return (configData || [])[0]?.config_id;
  },

  /**
   * Get Sanitizer configuration
   * @returns Sanitizer configuration object
   */
  async getSanitizerForm(): Promise<GetSanitizerFormResult> {
    await ProjectManager.getInstance()
      .initProject();
    const configData = await configService.getSanitizerConfigsList();

    return (configData || [])[0] || {};
  },

  /**
   * Save Sanitizer configuration
   * @param params save parameters
   * @returns updated Sanitizer configuration object
   */
  async saveSanitizerForm(params: SaveSanitizerFormParams): Promise<GetSanitizerFormResult> {
    await ProjectManager.getInstance()
      .initProject();
    await configService.saveSanitizerForm(params);
    const configData = await configService.getSanitizerConfigsList();

    return (configData || [])[0] || {};
  },

  /**
   * Run Sanitizer
   */
  async runSanitizer(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      await sanitizerService.runSanitizer();
    }
    finally {
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },
};
