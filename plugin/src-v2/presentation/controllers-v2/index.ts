import { containerV2 } from '@plugin-v2/di';
import { DI_TOKENS } from '@plugin-v2/di/tokens';
import { BuildControllerV2 } from './build.controller';
import type {
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
} from '@shared/api-types';

/**
 * Get BuildController instance
 */
function getBuildController(): BuildControllerV2 {
  return containerV2.get<BuildControllerV2>(DI_TOKENS.BuildController);
}

/**
 * Task controller methods V2
 * Exported for use by api-routes
 */
export const taskMethodsV2 = {
  /**
   * Start operator build
   */
  async startBuild(params: StartBuildParams = {}): Promise<void> {
    return getBuildController()
      .startBuild(params);
  },

  /**
   * Start operator run
   */
  async startRun(params: StartRunParams = {}): Promise<void> {
    return getBuildController()
      .startRun(params);
  },

  /**
   * Start build example
   */
  async startBuildExample(params: StartBuildExampleParams = {}): Promise<void> {
    return getBuildController()
      .startBuildExample(params);
  },

  /**
   * Get build config ID
   */
  async getBuildConfig(): Promise<number | undefined> {
    return getBuildController()
      .getBuildConfigId();
  },

  /**
   * Get build example config ID
   */
  async getBuildExampleConfig(): Promise<number | undefined> {
    return getBuildController()
      .getBuildExampleConfigId();
  },

  // Other methods return undefined for now; to be implemented
  async startSimulate(): Promise<void> {
    return getBuildController()
      .startSimulate();
  },

  async startOnBoard(): Promise<void> {
    return getBuildController()
      .startOnBoard();
  },

  async getSimulateConfig(): Promise<string> {
    return getBuildController()
      .getSimulateConfigId();
  },

  async getOnBoardConfig(): Promise<string> {
    return getBuildController()
      .getOnBoardConfigId();
  },

  async getSanitizerConfigs(): Promise<unknown[]> {
    return getBuildController()
      .getSanitizerConfigs();
  },

  async getSanitizerConfigId(): Promise<number | undefined> {
    return getBuildController()
      .getSanitizerConfigId();
  },

  async saveSanitizerForm(params: {
    data: unknown;
    showMessage?: boolean;
  }): Promise<void> {
    return getBuildController()
      .saveSanitizerForm(params);
  },

  async runSanitizer(): Promise<void> {
    return getBuildController()
      .runSanitizer();
  },

  /**
   * Stop current task
   */
  async stopTask(): Promise<void> {
    return getBuildController()
      .stopTask();
  },
};
