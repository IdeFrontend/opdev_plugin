import * as vscode from 'vscode';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
  BuildConfig,
} from '@shared/api-types';
import {
  getBuildExampleCommand,
  getSimulateCommand,
  getOnBoardCommand,
  getBuildOpCommand,
  getRunCommand,
  getConfig,
  objectToCommandString,
} from '@plugin/domain';
import { getProjectById } from '@plugin/domain/models/project-model';

const CONFIG_TYPES = {
  BUILD_OP: 'build_op',
  BUILD_EXAMPLE: 'build_example',
  SIMULATE: 'simulate',
  ON_BOARD: 'on_board',
} as const;

export class BuildService {
  /**
   * 获取构建配置列表
   */
  async getBuildConfigsList(): Promise<BuildConfig[]> {
    const projectId = ProjectManager.getInstance().projectId;

    console.log('getBuildConfigsList: 查询配置，projectId:', projectId);
    const array = [
      getConfig(Number(projectId), CONFIG_TYPES.BUILD_OP),
      getConfig(Number(projectId), CONFIG_TYPES.BUILD_EXAMPLE),
      getConfig(Number(projectId), CONFIG_TYPES.SIMULATE),
      getConfig(Number(projectId), CONFIG_TYPES.ON_BOARD),
    ];
    const [
      opConfig,
      exampleConfig,
      simulateConfig,
      onBoardConfig,
    ] = await Promise.all(array);

    console.log('getBuildConfigsList: 查询结果', {
      build_op: opConfig.length,
      build_example: exampleConfig.length,
      simulate: simulateConfig.length,
      on_board: onBoardConfig.length,
    });

    return [
      ...opConfig.map((c) => ({
        ...c,
        user_options: c.user_options ? (c.user_options as Record<string, unknown>) : undefined,
      })),
      ...exampleConfig.map((c) => ({
        ...c,
        user_options: c.user_options ? (c.user_options as Record<string, unknown>) : undefined,
      })),
      ...simulateConfig.map((c) => ({
        ...c,
        user_options: c.user_options ? (c.user_options as Record<string, unknown>) : undefined,
      })),
      ...onBoardConfig.map((c) => ({
        ...c,
        user_options: c.user_options ? (c.user_options as Record<string, unknown>) : undefined,
      })),
    ] as BuildConfig[];
  }

  /**
   * 根据类型获取配置
   */
  async getConfigByType(type: string): Promise<BuildConfig | undefined> {
    try {
      const configData = await this.getBuildConfigsList();

      return configData.find((v) => v.config_type === type);
    }
    catch {
      return undefined;
    }
  }

  /**
   * 获取构建配置ID
   */
  async getBuildConfigId(): Promise<number | undefined> {
    const config = await this.getConfigByType(CONFIG_TYPES.BUILD_OP);

    return config?.config_id;
  }

  /**
   * 获取示例构建配置ID
   */
  async getBuildExampleConfigId(): Promise<number | undefined> {
    const config = await this.getConfigByType(CONFIG_TYPES.BUILD_EXAMPLE);

    return config?.config_id;
  }

  /**
   * 获取仿真配置ID
   */
  async getSimulateConfigId(): Promise<string> {
    const config = await this.getConfigByType(CONFIG_TYPES.SIMULATE);

    return config?.config_id ? String(config.config_id) : '';
  }

  /**
   * 获取上板配置ID
   */
  async getOnBoardConfigId(): Promise<string> {
    const config = await this.getConfigByType(CONFIG_TYPES.ON_BOARD);

    return config?.config_id ? String(config.config_id) : '';
  }

  /**
   * 编译算子
   */
  async startBuild(params: StartBuildParams): Promise<void> {
    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      configId = await this.getBuildConfigId();
    }

    try {
      const buildCommand = getBuildOpCommand(
        Number(configId),
        params.compileOption,
      );
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executor.execute(buildCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage(`编译算子失败 ${res.output}`);

        return;
      }

      vscode.window.showInformationMessage('编译算子成功');
    }
    catch (e) {
      vscode.window.showErrorMessage(`获取编译算子命令失败 ${(e as Error).message}`);
    }
  }

  /**
   * 运行算子
   */
  async startRun(params: StartRunParams): Promise<void> {
    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      configId = await this.getBuildExampleConfigId();
    }

    try {
      const runCommand = getRunCommand(Number(configId));

      console.log('runCommand', runCommand);
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executor.execute(runCommand, [], [], {}, true);

      console.log('runRes', res);

      if (res.code !== 0) {
        vscode.window.showErrorMessage(`运行失败 ${res.output}`);

        return;
      }

      vscode.window.showInformationMessage('运行成功');
    }
    catch (e) {
      vscode.window.showErrorMessage(`获取运行命令失败 ${(e as Error).message}`);
    }
  }

  /**
   * 编译示例
   */
  async startBuildExample(params: StartBuildExampleParams): Promise<void> {
    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      configId = await this.getBuildExampleConfigId();
    }

    try {
      const buildCommand = getBuildExampleCommand(Number(configId));
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executor.execute(buildCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage('编译example失败');

        return;
      }

      vscode.window.showInformationMessage('编译example成功');
    }
    catch (e) {
      vscode.window.showErrorMessage(`获取编译example命令失败 ${(e as Error).message}`);
    }
  }

  /**
   * 开始仿真分析
   */
  async startSimulate(): Promise<void> {
    const configData = await this.getBuildConfigsList();
    const simulatorItem = configData.find((v) => v.config_type === CONFIG_TYPES.SIMULATE);
    const simulatorType = (simulatorItem?.user_options?.simulatorType as string | undefined) ?? '';


    // 检查项目类型，pyasc 类型不需要编译
    const projectId = ProjectManager.getInstance().projectId;
    const project = projectId ? getProjectById(Number(projectId)) : null;
    const isPyascType = project?.project_type === 'pyasc';

    if (!isPyascType) {
      // 仿真分析前编译，pyasc 类型不需要编译
      const buildConfigId = await this.getBuildConfigId();
      const buildCommand = getBuildOpCommand(
        Number(buildConfigId),
        objectToCommandString({ [`simulator ${simulatorType || ''}`]: true }),
      );
      const buildExecutor = ProjectManager.getInstance()
        .getExecutor();
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
    }

    const configId = await this.getSimulateConfigId();
    const exConfigId = await this.getBuildExampleConfigId();

    console.log('simulate configId', configId, exConfigId);

    try {
      const simulateCommand = getSimulateCommand(
        Number(configId),
        Number(exConfigId),
      );

      console.log('simulateCommand', simulateCommand);
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executor.execute(simulateCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage('执行仿真分析失败');

        return;
      }

      vscode.window.showInformationMessage('执行仿真分析成功');
      vscode.commands.executeCommand('performanceSidebarView.focus');
      vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData');
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(`获取仿真命令失败 ${(e as Error).message}`);
    }
  }

  /**
   * 开始上板分析
   */
  async startOnBoard(): Promise<void> {
    // 检查项目类型，pyasc 类型不需要编译
    const projectId = ProjectManager.getInstance().projectId;
    const project = projectId ? getProjectById(Number(projectId)) : null;
    const isPyascType = project?.project_type === 'pyasc';

    // 上板分析前编译（pyasc 类型跳过）
    if (!isPyascType) {
      const buildConfigId = await this.getBuildConfigId();
      const buildCommand = getBuildOpCommand(
        Number(buildConfigId),
        objectToCommandString({ onboard: true }),
      );
      const buildExecutor = ProjectManager.getInstance()
        .getExecutor();
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
    }

    const configId = await this.getOnBoardConfigId();
    const exConfigId = await this.getBuildExampleConfigId();

    console.log('onboard configId', configId, exConfigId);

    try {
      const onBoardCommand = getOnBoardCommand(
        Number(configId),
        Number(exConfigId),
      );

      console.log('onBoardCommand', onBoardCommand);
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executor.execute(onBoardCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage('执行上板分析失败');

        return;
      }

      vscode.window.showInformationMessage('执行上板分析成功');
      vscode.commands.executeCommand('performanceSidebarView.focus');
      vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData');
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(`获取上板命令失败 ${(e as Error).message}`);
    }
  }
}

export const buildService = new BuildService();
