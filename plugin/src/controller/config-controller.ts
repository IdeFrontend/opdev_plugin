import { ProjectManager } from '@plugin/core/project/project-manager';
import { configService } from '@plugin/service/config-service';
import { buildService } from '@plugin/service/build-service';
import {
  GetConfigDataResult,
  SaveConfigParams,
  RemotePathSearchParams,
  RemotePathSearchResult,
} from '@shared/api-types';

export const configMethods = {
  /**
   * Get configuration data for options webviews (simulate / on-board).
   */
  async getConfigData(params?: { opName?: string;
    projectId?: number }): Promise<GetConfigDataResult> {
    const opName = params?.opName;
    const projectId = params?.projectId;

    const pm = ProjectManager.getInstance();
    const originalProjectId = pm.projectId;

    if (projectId) {
      (pm as any)._projectId = String(projectId);
    }
    else {
      await pm.ensureProjectId();
    }

    try {
      const buildConfigs = await buildService.getBuildConfigsList();

      if (!buildConfigs.length) {
        return {};
      }

      if (opName) {
        const filteredConfigs = buildConfigs.filter((config) => {
          const configName = (config.user_options as any)?.config_name || config.config_name;

          return configName === opName;
        });

        if (filteredConfigs.length > 0) {
          return { [opName]: filteredConfigs };
        }

        return {};
      }

      const firstConfigName = (buildConfigs[0].user_options as any)?.config_name || buildConfigs[0].config_name;

      return { [firstConfigName]: buildConfigs };
    }
    finally {
      if (projectId) {
        (pm as any)._projectId = originalProjectId;
      }
    }
  },

  /**
   * Save configuration (simulation / on-board) — settings.json only.
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await configService.saveConfig(params);
  },

  /**
   * Remote path search (new-project SSH wizard).
   */
  async remotePathSearch(params: RemotePathSearchParams): Promise<RemotePathSearchResult> {
    return await configService.remotePathSearch(params);
  },
};
