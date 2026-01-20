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
   * 获取目标标签页并清除
   * @returns 目标标签页
   */
  async getTargetTab(): Promise<string | undefined> {
    const tab = targetTab;

    targetTab = undefined; // 读取后立即清除

    return tab;
  },

  /**
   * 获取目标算子并清除
   * @returns 目标算子信息
   */
  async getTargetOperator(): Promise<{ opName: string; projectId?: number } | undefined> {
    const operator = targetOperator;

    targetOperator = undefined; // 读取后立即清除

    return operator;
  },
  /**
   * 获取构建配置列表
   * @returns 构建配置列表
   */
  async getBuildConfigs() {
    // 确保projectId已初始化
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getBuildConfigsList();
  },

  /**
   * 获取配置数据
   * @param params 参数对象，包含 opName 和 projectId
   * @returns 配置数据
   */
  async getConfigData(params?: { opName?: string; projectId?: number } | string): Promise<GetConfigDataResult> {
    // 兼容旧版本：如果传入的是字符串，当作 opName 处理
    let opName: string | undefined;
    let projectId: number | undefined;
    
    if (typeof params === 'string') {
      opName = params;
    } else if (params) {
      opName = params.opName;
      projectId = params.projectId;
    }
    // 如果指定了projectId，临时设置ProjectManager的projectId
    const pm = ProjectManager.getInstance();
    const originalProjectId = pm.projectId;
    
    if (projectId) {
      // 临时设置projectId
      (pm as any)._projectId = String(projectId);
    } else {
      // 确保projectId已初始化
      await pm.ensureProjectId();
    }

    try {
      const buildConfigs = await buildService.getBuildConfigsList();

      console.log('getConfigData: buildConfigs', buildConfigs);
      console.log('getConfigData: opName', opName, 'projectId', projectId || pm.projectId);

      if (!buildConfigs.length) {
        return {};
      }

      // 如果指定了算子名称，只返回该算子的配置
      if (opName) {
        // 从user_options中获取config_name进行匹配
        const filteredConfigs = buildConfigs.filter(config => {
          const configName = (config.user_options as any)?.config_name || config.config_name;
          return configName === opName;
        });
        if (filteredConfigs.length > 0) {
          return { [opName]: filteredConfigs };
        }
        return {};
      }

      // 如果没有指定算子名称，返回第一个算子的配置
      const firstConfigName = (buildConfigs[0].user_options as any)?.config_name || buildConfigs[0].config_name;
      return { [firstConfigName]: buildConfigs };
    } finally {
      // 恢复原来的projectId
      if (projectId) {
        (pm as any)._projectId = originalProjectId;
      }
    }
  },

  /**
   * 获取当前项目下的所有算子列表
   * @returns 算子列表
   */
  async getOperators(): Promise<OperatorInfo[]> {
    // 确保projectId已初始化
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
   * 保存构建配置
   * @param params 保存参数
   */
  async saveBuildConfig(params: SaveBuildConfigParams): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await configService.saveBuildConfig(params);
  },

  /**
   * 保存配置（仿真/上板）
   * @param params 保存参数
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await configService.saveConfig(params);
  },

  /**
   * 远程路径搜索
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async remotePathSearch(params: RemotePathSearchParams): Promise<RemotePathSearchResult> {
    return await configService.remotePathSearch(params);
  },

  /**
   * 获取构建配置ID
   * @returns 构建配置ID
   */
  async getBuildConfig(): Promise<number | undefined> {
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getBuildConfigId();
  },

  /**
   * 获取示例构建配置ID
   * @returns 示例构建配置ID
   */
  async getBuildExampleConfig(): Promise<number | undefined> {
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getBuildExampleConfigId();
  },

  /**
   * 获取仿真配置ID
   * @returns 仿真配置ID
   */
  async getSimulateConfig(): Promise<string> {
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getSimulateConfigId();
  },

  /**
   * 获取上板配置ID
   * @returns 上板配置ID
   */
  async getOnBoardConfig(): Promise<string> {
    await ProjectManager.getInstance()
      .ensureProjectId();

    return await buildService.getOnBoardConfigId();
  },

  /**
   * 打开配置页面
   * @param params 参数
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
   * 获取调试模式状态
   * @returns 是否启用调试模式
   */
  async getDebugMode(): Promise<boolean> {
    return ConfigHelper.isDebugModeEnabled();
  },
};
