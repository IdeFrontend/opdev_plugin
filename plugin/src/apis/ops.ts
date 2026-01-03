import * as vscode from 'vscode';
import * as fs from 'fs';
import path from 'node:path';

import { CommandExecutor } from 'plugin:/class/CommandOptions';
import { ProjectManager } from '../services/project/project-manager';
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

const CONFIG_TYPES = {
  BUILD_OP: 'build_op',
  BUILD_EXAMPLE: 'build_example',
  SIMULATE: 'simulate',
  ON_BOARD: 'on_board',
  SANITIZER: 'sanitizer',
} as const;

/**
 * 获取 ExtensionContext
 */
function getContext(): vscode.ExtensionContext {
  return (globalThis as any).extensionContext as vscode.ExtensionContext;
}

/**
 * 获取构建配置列表
 */
async function getBuildConfigsList(): Promise<BuildConfig[]> {
  const projectId = ProjectManager.getInstance().projectId;
  const array = [
    getConfig(Number(projectId), CONFIG_TYPES.BUILD_OP),
    getConfig(Number(projectId), CONFIG_TYPES.BUILD_EXAMPLE),
    getConfig(Number(projectId), CONFIG_TYPES.SIMULATE),
    getConfig(Number(projectId), CONFIG_TYPES.ON_BOARD),
  ];
  const [opConfig, exampleConfig, simulateConfig, onBoardConfig] =
    await Promise.all(array);

  return [
    ...opConfig,
    ...exampleConfig,
    ...simulateConfig,
    ...onBoardConfig,
  ] as BuildConfig[];
}

/**
 * 根据类型获取配置
 */
async function getConfigByType(type: string): Promise<BuildConfig | undefined> {
  try {
    const configData = await getBuildConfigsList();

    return configData.find((v) => v.config_type === type);
  } catch {
    return undefined;
  }
}

/**
 * 获取构建配置ID
 */
async function getBuildConfigId(): Promise<number | undefined> {
  const config = await getConfigByType(CONFIG_TYPES.BUILD_OP);

  return config?.config_id;
}

/**
 * 获取示例构建配置ID
 */
async function getBuildExampleConfigId(): Promise<number | undefined> {
  const config = await getConfigByType(CONFIG_TYPES.BUILD_EXAMPLE);

  return config?.config_id;
}

/**
 * 获取仿真配置ID
 */
async function getSimulateConfigId(): Promise<string> {
  const config = await getConfigByType(CONFIG_TYPES.SIMULATE);

  return config?.config_id ? String(config.config_id) : '';
}

/**
 * 获取上板配置ID
 */
async function getOnBoardConfigId(): Promise<string> {
  const config = await getConfigByType(CONFIG_TYPES.ON_BOARD);

  return config?.config_id ? String(config.config_id) : '';
}

/**
 * 获取异常检测配置列表
 */
async function getSanitizerConfigsList(): Promise<BuildConfig[]> {
  const projectId = ProjectManager.getInstance().projectId;
  const config = getConfig(Number(projectId), CONFIG_TYPES.SANITIZER);

  return [...config] as BuildConfig[];
}

/**
 * 获取异常检测配置ID
 */
async function getSanitizerConfigIdInternal(): Promise<number | undefined> {
  try {
    const configData = await getSanitizerConfigsList();

    return configData.find((v) => v.config_type === CONFIG_TYPES.SANITIZER)
      ?.config_id;
  } catch {
    return undefined;
  }
}

export const opsMethods = {
  /**
   * 初始化算子项目
   * @param params 初始化参数
   * @returns 初始化结果信息
   */
  async init(params: InitOpsParams): Promise<string> {
    return await ProjectManager.getInstance().initProject(params);
  },

  /**
   * 创建算子原型文件
   * @param params 创建参数
   * @returns 创建结果信息
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
   * @param params 生成参数
   */
  async createOpsByPrototype(
    params: CreateOpsByPrototypeParams,
  ): Promise<void> {
    const pm = ProjectManager.getInstance();
    const context = getContext();

    try {
      const result = generateStructure(
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
   * @returns 配置数据对象
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
   * @returns 构建配置数组
   */
  async getBuildConfigs(): Promise<BuildConfig[]> {
    return getBuildConfigsList() as Promise<BuildConfig[]>;
  },

  /**
   * 保存构建配置
   * @param params 保存参数
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
   * @param params 保存参数
   */
  async saveConfig(params: SaveConfigParams): Promise<void> {
    await postConfig(params.type, params.data);
    if (params.showMessage) {
      vscode.window.showInformationMessage(`保存配置成功`);
    }
  },

  /**
   * 编译算子
   * @param params 编译参数
   */
  async startBuild(params: StartBuildParams): Promise<void> {
    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      configId = await getBuildConfigId();
    }

    try {
      const buildCommand = getBuildOpCommand(
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
   * @param params 运行参数
   */
  async startRun(params: StartRunParams): Promise<void> {
    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      configId = await getBuildExampleConfigId();
    }

    try {
      const runCommand = getRunCommand(Number(configId));

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
   * @param params 编译参数
   */
  async startBuildExample(params: StartBuildExampleParams): Promise<void> {
    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      configId = await getBuildExampleConfigId();
    }

    try {
      const buildCommand = getBuildExampleCommand(Number(configId));
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
      (v) => v.config_type === CONFIG_TYPES.SIMULATE,
    );
    const simulatorType = simulatorItem?.user_options?.simulatorType ?? '';

    // 仿真分析前编译
    const buildConfigId = await getBuildConfigId();
    const buildCommand = getBuildOpCommand(
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
      const simulateCommand = getSimulateCommand(
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
    const buildCommand = getBuildOpCommand(Number(buildConfigId), '--onboard');
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
      const onBoardCommand = getOnBoardCommand(
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
   * @returns 构建配置ID
   */
  async getBuildConfig(): Promise<number | undefined> {
    return getBuildConfigId();
  },

  /**
   * 获取示例构建配置ID
   * @returns 示例构建配置ID
   */
  async getBuildExampleConfig(): Promise<number | undefined> {
    return getBuildExampleConfigId();
  },

  /**
   * 获取仿真配置ID
   * @returns 仿真配置ID
   */
  async getSimulateConfig(): Promise<string> {
    return getSimulateConfigId();
  },

  /**
   * 获取上板配置ID
   * @returns 上板配置ID
   */
  async getOnBoardConfig(): Promise<string> {
    return getOnBoardConfigId();
  },

  /**
   * 获取异常检测配置列表
   * @returns 异常检测配置数组
   */
  async getSanitizerConfigs(): Promise<BuildConfig[]> {
    return getSanitizerConfigsList() as Promise<BuildConfig[]>;
  },

  /**
   * 获取异常检测配置ID
   * @returns 异常检测配置ID
   */
  async getSanitizerConfigId(): Promise<number | undefined> {
    return getSanitizerConfigIdInternal();
  },

  /**
   * 保存异常检测表单配置
   * @param params 保存参数
   */
  async saveSanitizerForm(params: SaveSanitizerFormParams): Promise<void> {
    try {
      const formData = (await getSanitizerConfigsList())[0];

      await postConfig(CONFIG_TYPES.SANITIZER, [
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
      const buildCommand = getBuildOpCommand(
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
        getSanitizerCommand(
          Number(sanitizerConfigId),
          Number(exampleConfigId),
        ) || '';
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
   * @param params 更新参数
   * @returns 更新结果信息
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
   * @returns 检查结果
   */
  async checkVscode(): Promise<boolean> {
    return ProjectManager.getInstance().checkVscode();
  },

  /**
   * 检查 devtool_config.json 配置文件是否存在
   * @returns 存在返回 true，否则返回 false
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
   * @returns CommandExecutor 实例
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
   * @returns 项目ID字符串
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
   * @param params 配置参数
   */
  async openConfig(_params: { configName: string }): Promise<void> {
    // 触发打开配置页面的命令
    vscode.commands.executeCommand(_params.configName);
  },
};
