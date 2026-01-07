import { containerV2 } from '@plugin-v2/di';
import { DI_TOKENS } from '@plugin-v2/di/tokens';
import { BuildControllerV2 } from './build.controller';
import type {
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
} from '@shared/api-types';

/**
 * 获取 BuildController 实例
 */
function getBuildController(): BuildControllerV2 {
  return containerV2.get<BuildControllerV2>(DI_TOKENS.BuildController);
}

/**
 * Task 控制器方法 V2
 * 导出给 api-routes 使用
 */
export const taskMethodsV2 = {
  /**
   * 开始构建算子
   */
  async startBuild(params: StartBuildParams = {}): Promise<void> {
    return getBuildController()
      .startBuild(params);
  },

  /**
   * 开始运行算子
   */
  async startRun(params: StartRunParams = {}): Promise<void> {
    return getBuildController()
      .startRun(params);
  },

  /**
   * 开始构建示例
   */
  async startBuildExample(params: StartBuildExampleParams = {}): Promise<void> {
    return getBuildController()
      .startBuildExample(params);
  },

  /**
   * 获取构建配置ID
   */
  async getBuildConfig(): Promise<number | undefined> {
    return getBuildController()
      .getBuildConfigId();
  },

  /**
   * 获取示例构建配置ID
   */
  async getBuildExampleConfig(): Promise<number | undefined> {
    return getBuildController()
      .getBuildExampleConfigId();
  },

  // 其他方法暂时返回 undefined,待后续实现
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
};
