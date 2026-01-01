import * as vscode from 'vscode';
import * as fs from 'fs';
import path from 'node:path';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { CommandExecutor } from 'plugin:/class/CommandOptions';
import { ProjectManager } from 'plugin:/services/project/project-manager';
import {
  InitOpsParams,
  CreateOpsParams,
  CreateOpsByPrototypeParams,
  GetConfigDataResult,
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
  SaveBuildConfigParams,
  SaveConfigParams,
  SaveSanitizerFormParams,
  UpdateShScriptParams,
  BuildConfig,
} from 'shared:/api-types';
import {
  updataShScript,
  generateOpsPrototype,
  generateStructure,
  getBuildExampleCommand,
  getSimulateCommand,
  getOnBoardCommand,
  getBuildOpCommand,
  getRunCommand,
  getSanitizerCommand,
  getConfig,
  postConfig,
} from '../../autogen-server';

// 定义 OpsApi 接口
export interface OpsApi {
  init(params: InitOpsParams): Promise<string>;
  createOps(params: CreateOpsParams): Promise<string>;
  createOpsByPrototype(params: CreateOpsByPrototypeParams): Promise<void>;
  getConfigData(): Promise<GetConfigDataResult>;
  getBuildConfigs(): Promise<BuildConfig[]>;
  saveBuildConfig(params: SaveBuildConfigParams): Promise<void>;
  saveConfig(params: SaveConfigParams): Promise<void>;
  startBuild(params: StartBuildParams): Promise<void>;
  startRun(params: StartRunParams): Promise<void>;
  startBuildExample(params: StartBuildExampleParams): Promise<void>;
  startSimulate(): Promise<void>;
  startOnBoard(): Promise<void>;
  getBuildConfig(): Promise<number | undefined>;
  getBuildExampleConfig(): Promise<number | undefined>;
  getSimulateConfig(): Promise<string>;
  getOnBoardConfig(): Promise<string>;
  getSanitizerConfigs(): Promise<BuildConfig[]>;
  getSanitizerConfigId(): Promise<number | undefined>;
  saveSanitizerForm(params: SaveSanitizerFormParams): Promise<void>;
  runSanitizer(): Promise<void>;
  updateShScript(params: UpdateShScriptParams): Promise<string>;
  checkVscode(): Promise<boolean>;
  checkDevtoolConfig(): Promise<boolean>;
  getExecutor(): CommandExecutor;
  clearExecutor(): void;
  getProjectId(): string;
  stopTask(): Promise<void>;
  openConfig(params: { configName?: string }): Promise<void>;
}

/**
 * 获取 ExtensionContext
 */
function getContext(): vscode.ExtensionContext {
  return (globalThis as any).extensionContext as vscode.ExtensionContext;
}

/**
 * 获取构建配置列表
 */
async function getBuildConfigsList(): Promise<any[]> {
  const projectId = ProjectManager.getInstance().projectId;
  const array = [
    getConfig(Number(projectId), 'build_op'),
    getConfig(Number(projectId), 'build_example'),
    getConfig(Number(projectId), 'simulate'),
    getConfig(Number(projectId), 'on_board'),
  ];
  const [opConfig, exampleConfig, simulateConfig, onBoardConfig] =
    await Promise.all(array);

  return [...opConfig, ...exampleConfig, ...simulateConfig, ...onBoardConfig];
}

/**
 * 获取构建配置ID
 */
async function getBuildConfigId(): Promise<number | undefined> {
  try {
    const configData = await getBuildConfigsList();

    // console.log('configData in build', configData);

    return configData.find((v: any) => v.config_type === 'build_op')?.config_id;
  } catch {
    return undefined;
  }
}

/**
 * 获取示例构建配置ID
 */
async function getBuildExampleConfigId(): Promise<number | undefined> {
  try {
    const configData = await getBuildConfigsList();

    // console.log('configData in exam', configData);

    return configData.find((v: any) => v.config_type === 'build_example')
      ?.config_id;
  } catch {
    return undefined;
  }
}

/**
 * 获取仿真配置ID
 */
async function getSimulateConfigId(): Promise<string> {
  try {
    const configData = await getBuildConfigsList();

    // console.log('configData in simulate', configData);

    return (
      configData.find((v: any) => v.config_type === 'simulate')?.config_id || ''
    );
  } catch {
    return '';
  }
}

/**
 * 获取上板配置ID
 */
async function getOnBoardConfigId(): Promise<string> {
  try {
    const configData = await getBuildConfigsList();

    // console.log('configData in onBoard', configData);

    return (
      configData.find((v: any) => v.config_type === 'on_board')?.config_id || ''
    );
  } catch {
    return '';
  }
}

/**
 * 获取异常检测配置列表
 */
async function getSanitizerConfigsList(): Promise<any[]> {
  const projectId = ProjectManager.getInstance().projectId;
  const config = await getConfig(Number(projectId), 'sanitizer');

  return [...config];
}

/**
 * 获取异常检测配置ID
 */
async function getSanitizerConfigIdInternal(): Promise<number | undefined> {
  try {
    const configData = await getSanitizerConfigsList();

    // console.log('configData in sanitizer', configData);

    return configData.find((v: any) => v.config_type === 'sanitizer')
      ?.config_id;
  } catch {
    return undefined;
  }
}

export const opsApis: ApiGroup = {
  ops: {
    /**
     * 初始化算子项目
     */
    async init(params: InitOpsParams): Promise<string> {
      return await ProjectManager.getInstance().initProject(params);
    },

    /**
     * 创建算子原型文件
     */
    async createOps(params: CreateOpsParams): Promise<string> {
      const pm = ProjectManager.getInstance();
      const info = pm.getProjectInfo();
      const op_name = params.projectName || info.name;
      const project_id = params.projectId || pm.projectId;
      const prototype_name = params.prototypeName || undefined;

      console.log('生成算子原型文件参数', op_name, project_id, prototype_name);

      try {
        const context = getContext();
        const result = await generateOpsPrototype(
          Number(project_id),
          op_name,
          prototype_name,
          context.extensionPath,
        );

        vscode.window.showInformationMessage(`新建算子原型文件成功`);

        // 检查并设置 .vscode 目录权限
        await pm.checkVscode();

        return result;
      } catch {
        vscode.window.showErrorMessage(`新建算子原型文件失败`);

        return '';
      }
    },

    /**
     * 通过原型生成算子工程
     */
    async createOpsByPrototype(
      params: CreateOpsByPrototypeParams,
    ): Promise<void> {
      const pm = ProjectManager.getInstance();
      const context = getContext();

      try {
        const result = await generateStructure(
          {
            ops_prototype_file: params.opsPrototypeFile,
            project_id: Number(pm.projectId),
            op_type: params.opType || 'ascend',
          },
          context.extensionPath,
        );

        console.log(
          '生成算子工程参数',
          {
            ops_prototype_file: params.opsPrototypeFile,
            project_id: pm.projectId,
            op_type: params.opType,
          },
          result,
        );

        vscode.window.showInformationMessage(`新建算子文件成功`);
        await pm.checkVscode();
      } catch (e) {
        vscode.window.showErrorMessage(
          `新建算子文件失败 ${e instanceof Error ? e.message : ''}`,
        );
      }
    },

    /**
     * 获取配置数据
     */
    async getConfigData(): Promise<GetConfigDataResult> {
      // 确保projectId已初始化
      await ProjectManager.getInstance().ensureProjectId();
      const buildConfigs = await getBuildConfigsList();

      console.log('buildConfigs', buildConfigs);
      if (!buildConfigs.length) {
        return {};
      }

      return { [buildConfigs[0].config_name]: buildConfigs };
    },

    /**
     * 获取构建配置列表
     */
    async getBuildConfigs(): Promise<BuildConfig[]> {
      return getBuildConfigsList() as Promise<BuildConfig[]>;
    },

    /**
     * 保存构建配置
     */
    async saveBuildConfig(params: SaveBuildConfigParams): Promise<void> {
      try {
        await postConfig('build', params.data);
        if (params.showMessage) {
          vscode.window.showInformationMessage(`保存编译配置成功`);
        }
      } catch {
        vscode.window.showErrorMessage(`保存编译配置失败`);
      }
    },

    /**
     * 保存配置（仿真/上板）
     */
    async saveConfig(params: SaveConfigParams): Promise<void> {
      await postConfig(params.type, params.data);
      if (params.showMessage) {
        vscode.window.showInformationMessage(`保存配置成功`);
      }
    },

    /**
     * 编译算子
     */
    async startBuild(params: StartBuildParams): Promise<void> {
      let configId = params.configId ? Number(params.configId) : undefined;

      if (!configId) {
        configId = await getBuildConfigId();
      }

      try {
        const buildCommand = await getBuildOpCommand(
          Number(configId),
          params.compileOption,
        );
        const executor = ProjectManager.getInstance().getExecutor();
        const res = await executor.execute(buildCommand, [], [], {}, true);

        if (res.code !== 0) {
          vscode.window.showErrorMessage(`编译算子失败 ${res.output}`);

          return;
        }
        vscode.window.showInformationMessage(`编译算子成功`);
      } catch (e) {
        vscode.window.showErrorMessage(
          `获取编译算子命令失败 ${(e as Error).message}`,
        );
      }
    },

    /**
     * 运行算子
     */
    async startRun(params: StartRunParams): Promise<void> {
      let configId = params.configId ? Number(params.configId) : undefined;

      if (!configId) {
        configId = await getBuildExampleConfigId();
      }

      try {
        const runCommand = await getRunCommand(Number(configId));

        console.log('runCommand', runCommand);
        const executor = ProjectManager.getInstance().getExecutor();
        const res = await executor.execute(runCommand, [], [], {}, true);

        console.log('runRes', res);
        if (res.code !== 0) {
          vscode.window.showErrorMessage(`运行失败 ${res.output}`);

          return;
        }
        vscode.window.showInformationMessage(`运行成功`);
      } catch (e) {
        vscode.window.showErrorMessage(
          `获取运行命令失败 ${(e as Error).message}`,
        );
      }
    },

    /**
     * 编译示例
     */
    async startBuildExample(params: StartBuildExampleParams): Promise<void> {
      let configId = params.configId ? Number(params.configId) : undefined;

      if (!configId) {
        configId = await getBuildExampleConfigId();
      }

      try {
        const buildCommand = await getBuildExampleCommand(Number(configId));
        const executor = ProjectManager.getInstance().getExecutor();
        const res = await executor.execute(buildCommand, [], [], {}, true);

        if (res.code !== 0) {
          vscode.window.showErrorMessage(`编译example失败`);

          return;
        }
        vscode.window.showInformationMessage(`编译example成功`);
      } catch (e) {
        vscode.window.showErrorMessage(
          `获取编译example命令失败 ${(e as Error).message}`,
        );
      }
    },

    /**
     * 开始仿真分析
     */
    async startSimulate(): Promise<void> {
      const configData = await getBuildConfigsList();
      const simulatorItem = configData.find(
        (v: any) => v.config_type === 'simulate',
      );
      const simulatorType = simulatorItem?.user_options?.simulatorType ?? '';

      // 仿真分析前编译
      const buildConfigId = await getBuildConfigId();
      const buildCommand = await getBuildOpCommand(
        Number(buildConfigId),
        `--simulator ${simulatorType}`,
      );
      const buildExecutor = ProjectManager.getInstance().getExecutor();
      const buildRes = await buildExecutor.execute(
        buildCommand,
        [],
        [],
        {},
        true,
      );

      console.log('buildRes', buildRes);
      if (buildRes.code !== 0) {
        vscode.window.showErrorMessage(`编译算子失败 ${buildRes.output}`);

        return;
      }

      const configId = await getSimulateConfigId();
      const exConfigId = await getBuildExampleConfigId();

      console.log('simulate configId', configId, exConfigId);

      try {
        const simulateCommand = await getSimulateCommand(
          Number(configId),
          Number(exConfigId),
        );

        console.log('simulateCommand', simulateCommand);
        const executor = ProjectManager.getInstance().getExecutor();
        const res = await executor.execute(simulateCommand, [], [], {}, true);

        if (res.code !== 0) {
          vscode.window.showErrorMessage(`执行仿真分析失败`);

          return;
        }
        vscode.window.showInformationMessage(`执行仿真分析成功`);
        vscode.commands.executeCommand('performanceSidebarView.focus');
        vscode.commands.executeCommand(
          'huawei-op-devtools.flashPerformanceRunData',
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(`获取仿真命令失败 ${e.message}`);
      }
    },

    /**
     * 开始上板分析
     */
    async startOnBoard(): Promise<void> {
      // 上板分析前编译
      const buildConfigId = await getBuildConfigId();
      const buildCommand = await getBuildOpCommand(
        Number(buildConfigId),
        '--onboard',
      );
      const buildExecutor = ProjectManager.getInstance().getExecutor();
      const buildRes = await buildExecutor.execute(
        buildCommand,
        [],
        [],
        {},
        true,
      );

      console.log('buildRes', buildRes);
      if (buildRes.code !== 0) {
        vscode.window.showErrorMessage(`编译算子失败 ${buildRes.output}`);

        return;
      }

      const configId = await getOnBoardConfigId();
      const exConfigId = await getBuildExampleConfigId();

      console.log('onboard configId', configId, exConfigId);

      try {
        const onBoardCommand = await getOnBoardCommand(
          Number(configId),
          Number(exConfigId),
        );

        console.log('onBoardCommand', onBoardCommand);
        const executor = ProjectManager.getInstance().getExecutor();
        const res = await executor.execute(onBoardCommand, [], [], {}, true);

        if (res.code !== 0) {
          vscode.window.showErrorMessage(`执行上板分析失败`);

          return;
        }
        vscode.window.showInformationMessage(`执行上板分析成功`);
        vscode.commands.executeCommand('performanceSidebarView.focus');
        vscode.commands.executeCommand(
          'huawei-op-devtools.flashPerformanceRunData',
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(`获取上板命令失败 ${e.message}`);
      }
    },

    /**
     * 获取构建配置ID
     */
    async getBuildConfig(): Promise<number | undefined> {
      return getBuildConfigId();
    },

    /**
     * 获取示例构建配置ID
     */
    async getBuildExampleConfig(): Promise<number | undefined> {
      return getBuildExampleConfigId();
    },

    /**
     * 获取仿真配置ID
     */
    async getSimulateConfig(): Promise<string> {
      return getSimulateConfigId();
    },

    /**
     * 获取上板配置ID
     */
    async getOnBoardConfig(): Promise<string> {
      return getOnBoardConfigId();
    },

    /**
     * 获取异常检测配置列表
     */
    async getSanitizerConfigs(): Promise<BuildConfig[]> {
      return getSanitizerConfigsList() as Promise<BuildConfig[]>;
    },

    /**
     * 获取异常检测配置ID
     */
    async getSanitizerConfigId(): Promise<number | undefined> {
      return getSanitizerConfigIdInternal();
    },

    /**
     * 保存异常检测表单配置
     */
    async saveSanitizerForm(params: SaveSanitizerFormParams): Promise<void> {
      try {
        const formData = (await getSanitizerConfigsList())[0];

        await postConfig('sanitizer', [
          {
            ...formData,
            user_options: { ...formData.user_options, ...params.data },
          },
        ]);
        if (params.showMessage) {
          vscode.window.showInformationMessage(`保存异常检测配置成功`);
        }
      } catch {
        vscode.window.showErrorMessage(`保存异常检测配置失败`);
      }
    },

    /**
     * 运行异常检测
     */
    async runSanitizer(): Promise<void> {
      try {
        // 异常检测前编译
        const buildConfigId = await getBuildConfigId();
        const buildCommand = await getBuildOpCommand(
          Number(buildConfigId),
          '--mssanitizer',
        );
        const buildExecutor = ProjectManager.getInstance().getExecutor();
        const buildRes = await buildExecutor.execute(
          buildCommand,
          [],
          [],
          {},
          true,
        );

        if (buildRes.code !== 0) {
          vscode.window.showErrorMessage(`编译算子失败 ${buildRes.output}`);

          return;
        }

        // 创建文件夹
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (workspaceFolders && workspaceFolders.length > 0) {
          const workspacePath = workspaceFolders[0].uri.fsPath;
          const logPath = path.join(
            workspacePath,
            '.vscode/mindstudio_sanitizer_log',
          );

          if (!fs.existsSync(logPath)) {
            fs.mkdirSync(logPath, { mode: 0o750 });
          }
        }

        // 开启异常检测
        const sanitizerConfigId: Number | undefined =
          await getSanitizerConfigIdInternal();
        const exampleConfigId: Number | undefined | string =
          await getBuildExampleConfigId();

        const sanitizerCommand =
          (await getSanitizerCommand(
            Number(sanitizerConfigId),
            Number(exampleConfigId),
          )) || '';
        const executor = ProjectManager.getInstance().getExecutor();
        const res = await executor.execute(sanitizerCommand, [], [], {}, true);

        if (res.code !== 0) {
          vscode.window.showErrorMessage(`异常检测失败 ${res.output}`);

          return;
        }
        vscode.window.showInformationMessage(`异常检测成功`);

        // 执行完检测后，获取最新的列表数据
        vscode.commands.executeCommand(
          'huawei-op-devtools.flashMsSanitizerRunData',
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(`异常检测失败: ${e.message}`);
      }
    },

    /**
     * 更新脚本文件
     */
    async updateShScript(params: UpdateShScriptParams): Promise<string> {
      const pm = ProjectManager.getInstance();
      const info = pm.getProjectInfo();
      const project_name = info.name ?? '';
      const project_path = info.path;

      if (project_path === undefined) {
        return '';
      }

      const ascend_env_script = params.accendEnvScript || undefined;
      const projectRes = await updataShScript({
        project_name,
        project_path,
        ascend_env_script,
      });

      console.log('projectRes', projectRes);

      return String(projectRes);
    },

    /**
     * 检查 .vscode 目录
     */
    async checkVscode(): Promise<boolean> {
      return ProjectManager.getInstance().checkVscode();
    },

    /**
     * 检查 devtool_config.json 配置文件是否存在
     */
    async checkDevtoolConfig(): Promise<boolean> {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        return false;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const devtoolConfigPath = path.join(
        workspacePath,
        '.vscode',
        'devtool_config.json',
      );

      try {
        return fs.existsSync(devtoolConfigPath);
      } catch (error) {
        console.error('检查 devtool_config.json 文件时出错:', error);

        return false;
      }
    },

    /**
     * 获取当前 executor（用于外部停止任务）
     */
    getExecutor(): CommandExecutor {
      return ProjectManager.getInstance().getExecutor();
    },

    /**
     * 清除当前 executor
     */
    clearExecutor(): void {
      ProjectManager.getInstance().clearExecutor();
    },

    /**
     * 获取当前项目ID
     */
    getProjectId(): string {
      return ProjectManager.getInstance().projectId;
    },

    /**
     * 停止当前任务
     */
    async stopTask(): Promise<void> {
      return await ProjectManager.getInstance().stopTask();
    },

    /**
     * 打开配置页面
     */
    async openConfig(_params: { configName: string }): Promise<void> {
      // 触发打开配置页面的命令
      vscode.commands.executeCommand(_params.configName);
    },
  },
};
