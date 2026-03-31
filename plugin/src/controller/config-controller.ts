import * as vscode from 'vscode';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { configService } from '@plugin/service/config-service';
import { buildService } from '@plugin/service/build-service';
import { ConfigHelper } from '@plugin/helpers/ConfigHelper';
import {
  GetConfigDataResult,
  SaveBuildConfigParams,
  SaveConfigParams,
  RemotePathSearchParams,
  RemotePathSearchResult,
  OperatorInfo,
} from '@shared/api-types';
import { getOpsByProjectId } from '@plugin/domain/models/model';

let targetTab: string | undefined;
let targetOperator: { opName: string; projectId?: number } | undefined;

export const configMethods = {
  /**
   * Get the target tab and clear it
   * @returns target tab page
   */
  async getTargetTab(): Promise<string | undefined> {
    const tab = targetTab;

    targetTab = undefined; // Clear immediately after reading

    return tab;
  },

  /**
   * Get the target operator and clear it
   * @returns target operator information
   */
  async getTargetOperator(): Promise<{ opName: string; projectId?: number } | undefined> {
    const operator = targetOperator;

    targetOperator = undefined; // Clear immediately after reading

    return operator;
  },
  /**
   * Get a list of build configurations
   * @returns build configuration list
   */
  async getBuildConfigs() {
    // Make sure projectId is initialized
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getBuildConfigsList();
  },

  /**
   * Get configuration data
   * @param params parameter object, including opName and projectId
   * @returns configuration data
   */
  async getConfigData(params?: { opName?: string; projectId?: number } | string): Promise<GetConfigDataResult> {
    // Compatible with older versions: If a string is passed in, it will be treated as opName.
    let opName: string | undefined;
    let projectId: number | undefined;
    
    if (typeof params === 'string') {
      opName = params;
    } else if (params) {
      opName = params.opName;
      projectId = params.projectId;
    }
    // If projectId is specified, temporarily set the projectId of ProjectManager
    const pm = ProjectManager.getInstance();
    const originalProjectId = pm.projectId;
    
    if (projectId) {
      // Temporarily set projectId
      (pm as any)._projectId = String(projectId);
    } else {
      // Make sure projectId is initialized
      await pm.ensureProjectId();
    }

    try {
      const buildConfigs = await buildService.getBuildConfigsList();

      console.log('getConfigData: buildConfigs', buildConfigs);
      console.log('getConfigData: opName', opName, 'projectId', projectId || pm.projectId);

      if (!buildConfigs.length) {
        return {};
      }

      // If an operator name is specified, only the configuration of the operator is returned.
      if (opName) {
        // Get config_name from user_options for matching
        const filteredConfigs = buildConfigs.filter(config => {
          const configName = (config.user_options as any)?.config_name || config.config_name;
          return configName === opName;
        });
        if (filteredConfigs.length > 0) {
          return { [opName]: filteredConfigs };
        }
        return {};
      }

      // If no operator name is specified, the configuration of the first operator is returned.
      const firstConfigName = (buildConfigs[0].user_options as any)?.config_name || buildConfigs[0].config_name;
      return { [firstConfigName]: buildConfigs };
    } finally {
      // Restore original projectId
      if (projectId) {
        (pm as any)._projectId = originalProjectId;
      }
    }
  },

  /**
   * Get a list of all operators under the current project
   * @returns operator list
   */
  async getOperators(): Promise<OperatorInfo[]> {
    // Make sure projectId is initialized
    const pm = ProjectManager.getInstance();
    await pm.ensureProjectId();
    
    const projectId = parseInt(pm.projectId || '0', 10);
    if (!projectId) {
      return [];
    }

    const ops = getOpsByProjectId(projectId);
    return ops.map(op => ({
      id: op.id,
      op_name: op.op_name,
      op_type: op.op_type,
      op_path: op.op_path,
      config_name: op.op_name,
    }));
  },

  /**
   * Save build configuration
   * @param params save parameters
   */
  async saveBuildConfig(params: SaveBuildConfigParams): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await configService.saveBuildConfig(params);
  },

  /**
   * Save configuration (simulation/boarding)
   * @param params save parameters
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await configService.saveConfig(params);
  },

  /**
   * Remote path search
   * @param params search parameters
   * @returns search results
   */
  async remotePathSearch(params: RemotePathSearchParams): Promise<RemotePathSearchResult> {
    return await configService.remotePathSearch(params);
  },

  /**
   * Get build configuration ID
   * @returns build configuration ID
   */
  async getBuildConfig(): Promise<number | undefined> {
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getBuildConfigId();
  },

  /**
   * Get sample build configuration ID
   * @returns sample build configuration ID
   */
  async getBuildExampleConfig(): Promise<number | undefined> {
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getBuildExampleConfigId();
  },

  /**
   * Get simulation configuration ID
   * @returns simulation configuration ID
   */
  async getSimulateConfig(): Promise<string> {
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getSimulateConfigId();
  },

  /**
   * Get board configuration ID
   * @returns Upper board configuration ID
   */
  async getOnBoardConfig(): Promise<string> {
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getOnBoardConfigId();
  },

  /**
   * Open configuration page
   * @param params parameters
   */
  async openConfig(params: { configName?: string, key?: string, opName?: string, projectId?: number }) {
    if (params.key) {
      targetTab = params.key;
    }

    if (params.opName) {
      targetOperator = {
        opName: params.opName,
        projectId: params.projectId,
      };
    }

    if (params.configName) {
      await vscode.commands.executeCommand(params.configName, params.key);
    }
  },

  /**
   * Get debug mode status
   * @returns whether to enable debugging mode
   */
  async getDebugMode(): Promise<boolean> {
    return ConfigHelper.isDebugModeEnabled();
  },
};
