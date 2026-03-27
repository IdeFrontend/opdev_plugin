import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
  getUtTestCommand,
  getConfig,
  postConfig,
  objectToCommandString,
  getProjectById,
} from '@plugin/domain';
import { getOpRunPath } from '@plugin/domain/utils/op-util';
import { getOpByProjectIdAndOpName } from '@plugin/domain/models/model';
import { joinCommands } from '@plugin/domain/utils/command-utils';
import { getConfigById } from '@plugin/domain/services/configuration';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';
import { markOperatorsAsCompiled, getProjectByPath } from '@plugin/domain/models/project-model';
import { homeMethods } from '../controller/home-controller';
import { soc_version } from '@plugin/domain/utils/ascend-util';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';

const CONFIG_TYPES = {
  BUILD_OP: 'build_op',
  BUILD_EXAMPLE: 'build_example',
  SIMULATE: 'simulate',
  ON_BOARD: 'on_board',
  UT_TEST: 'ut_test',
} as const;

/**
 * Checks whether the VS Code workspace root is a STANDARD_CUSTOM operator project.
 * Uses OperatorPluginRegistry.detectProject() — routing through the plugin registry.
 */
async function isRootStandardCustom(): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return false;
  try {
    const match = await OperatorPluginRegistry.detectProject(workspaceFolders[0].uri.fsPath);
    return match?.projectType === OperatorProjectType.STANDARD_CUSTOM;
  } catch (error) {
    console.warn('[isRootStandardCustom] 检测失败:', error);
    return false;
  }
}

/**
 * 编译成功后，将 operatorNames（逗号分隔）对应的算子标记为已编译，写入 projects.json。
 * 仅对标准自定义算子工程生效。
 */
async function tryMarkOperatorsAsCompiled(
  configId: number,
  operatorNames: string | undefined,
): Promise<void> {
  console.log('[tryMarkOperatorsAsCompiled] 编译成功后，将 operatorNames（逗号分隔）对应的算子标记为已编译，写入 projects.json。', operatorNames);
  if (!operatorNames || !operatorNames.trim()) {
    return;
  }

  try {
    const config = getConfigById(configId);
    console.log('[tryMarkOperatorsAsCompiled] 找到配置，config:', config);
    if (!config) {
      console.warn('[tryMarkOperatorsAsCompiled] 未找到配置，configId:', configId);
      return;
    }

    const project = getProjectById(config.project_id);
    console.log('[tryMarkOperatorsAsCompiled] 找到项目，project:', project);

    if (!project || !project.project_path) {
      return;
    }

    try {
      const match = await OperatorPluginRegistry.detectProject(project.project_path);
      if (match?.projectType !== OperatorProjectType.STANDARD_CUSTOM) {
        return;
      }
    }
    catch (error) {
      console.warn('[tryMarkOperatorsAsCompiled] 检测项目类型失败:', error);
      return;
    }

    console.log('[tryMarkOperatorsAsCompiled] 开始标记算子为已编译');
    await markOperatorsAsCompiled(project.project_path, operatorNames);
    console.log('[tryMarkOperatorsAsCompiled] 已标记算子为已编译:', operatorNames);
  }
  catch (error) {
    console.warn(
      '[tryMarkOperatorsAsCompiled] 更新算子编译状态失败:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export class BuildService {
  /**
   * 获取构建配置列表
   */
  async getBuildConfigsList(): Promise<BuildConfig[]> {
    await ProjectManager.getInstance().initProject();
    const projectId = ProjectManager.getInstance().projectId;

    console.log('getBuildConfigsList: 查询配置，projectId:', projectId);
    const array = [
      getConfig(Number(projectId), CONFIG_TYPES.BUILD_OP),
      getConfig(Number(projectId), CONFIG_TYPES.BUILD_EXAMPLE),
      getConfig(Number(projectId), CONFIG_TYPES.SIMULATE),
      getConfig(Number(projectId), CONFIG_TYPES.ON_BOARD),
      getConfig(Number(projectId), CONFIG_TYPES.UT_TEST),
    ];
    const [
      opConfig,
      exampleConfig,
      simulateConfig,
      onBoardConfig,
      utTestConfig,
    ] = await Promise.all(array);

    console.log('getBuildConfigsList: 查询结果', {
      build_op: opConfig.length,
      build_example: exampleConfig.length,
      simulate: simulateConfig.length,
      on_board: onBoardConfig.length,
      ut_test: utTestConfig.length,
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
      ...utTestConfig.map((c) => ({
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
   * 获取UT测试配置ID
   */
  async getUtTestConfigId(): Promise<number | undefined> {
    const config = await this.getConfigByType(CONFIG_TYPES.UT_TEST);

    return config?.config_id;
  }

  /**
   * 编译算子
   */
  async startBuild(params: StartBuildParams): Promise<void> {
    console.log('[startBuild] ========== 开始编译算子 ==========');
    console.log('[startBuild] 传入参数:', JSON.stringify(params, null, 2));
    const pm = ProjectManager.getInstance();

    // 如果传入了 projectId，则设置 ProjectManager 的项目ID
    if (params.projectId !== undefined) {
      console.log('[startBuild] 检测到传入的 projectId:', params.projectId);
      const projectIdStr = String(params.projectId);
      const project = getProjectById(Number(params.projectId));

      if (project) {
        console.log('[startBuild] 找到项目信息:', {
          id: project.id,
          project_name: project.project_name,
          project_path: project.project_path,
          project_type: project.project_type,
        });
        pm['_projectId'] = projectIdStr;
        pm['_projectName'] = project.project_name;
        pm['_projectPath'] = project.project_path;
        console.log('[startBuild] 已设置 ProjectManager 项目信息');
      } else {
        console.warn('[startBuild] 未找到对应的项目，projectId:', params.projectId);
      }
    } else {
      console.log('[startBuild] 未传入 projectId，使用 ProjectManager 中的项目ID');
    }

    const projectId = pm.projectId;
    console.log('[startBuild] 当前使用的项目ID:', projectId);
    console.log('[startBuild] ProjectManager 项目信息:', {
      projectId: pm.projectId,
      projectName: pm['_projectName'],
      projectPath: pm['_projectPath'],
    });

    let configId = params.configId ? Number(params.configId) : undefined;
    console.log('[startBuild] 传入的 configId:', configId);

    if (!configId) {
      console.log('[startBuild] 未传入 configId，尝试获取当前项目的配置');
      configId = await this.getBuildConfigId();
      console.log('[startBuild] 获取到的 configId:', configId);
    }

    if (!configId) {
      const errorMsg = t('build.noBuildConfig');
      console.error('[startBuild]', errorMsg);
      vscode.window.showErrorMessage(errorMsg);

      return;
    }

    console.log('[startBuild] 使用配置ID:', configId);
    console.log('[startBuild] 编译参数:', {
      configId,
      compileOption: params.compileOption,
      operatorNames: params.operatorNames,
      operatorType: params.operatorType,
    });

    try {
      const buildCommand = getBuildOpCommand(
        Number(configId),
        params.compileOption,
        params.operatorNames,
        params.scriptField
      );
      console.log('[startBuild] 生成的编译命令:', buildCommand);
      const executor = ProjectManager.getInstance()
        .getExecutor();
      console.log('[startBuild] 开始执行编译命令...');
      const res = await executor.execute(buildCommand, [], [], {}, true);

      console.log('[startBuild] 编译执行结果:', {
        code: res.code,
        output: res.output,
      });

      if (res.code !== 0) {
        console.error('[startBuild] 编译失败，退出码:', res.code, '输出:', res.output);
        vscode.window.showErrorMessage(t('build.compileFailed', { output: res.output }));

        return;
      }

      console.log('[startBuild] 编译成功');
      vscode.window.showInformationMessage(t('build.compileSuccess'));

      await tryMarkOperatorsAsCompiled(Number(configId), params.operatorNames);
    }
    catch (e) {
      console.error('[startBuild] 编译过程出错:', e);
      vscode.window.showErrorMessage(t('build.getCompileCommandFailed', { error: (e as Error).message }));
    }

    console.log('[startBuild] ========== 结束编译算子 ==========');
  }

  /**
   * 运行算子
   */
  async startRun(params: StartRunParams): Promise<void> {
    // Option A: preserve V1 behavior exactly — startRun uses homeMethods.getProjectType()
    // (live detection) and skips the active-file check when params.filePath is set.
    const projectTypeInfo = await homeMethods.getProjectType();
    const opPlugin = OperatorPluginRegistry.getOpPlugin(projectTypeInfo.projectType);
    const behavior = opPlugin.buildBehavior;

    if (behavior.requiresActiveFileCheck && !params.filePath) {
      const activeEditor = vscode.window.activeTextEditor;
      const isPyFile = activeEditor?.document.fileName.endsWith(behavior.activeFileExtension!);

      if (!isPyFile) {
        vscode.window.showWarningMessage(t('build.openPyFirst'));
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage(t('build.workspacePathNotFound'));
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const filePath = activeEditor!.document.uri.fsPath;
      const relativePath = path.relative(workspacePath, filePath).replace(/\\/g, '/');

      const buildConfigId = await this.getBuildConfigId();
      if (buildConfigId) {
        const projectIdStr = ProjectManager.getInstance().projectId;
        if (projectIdStr) {
          const projectId = Number(projectIdStr);
          const configs = await getConfig(projectId, 'build_op');
          const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);
          if (buildOpConfig) {
            await postConfig('build_op', [{
              config_id: buildConfigId,
              config_type: 'build_op',
              user_options: {
                ...buildOpConfig.user_options,
                target_file: `python3 ${relativePath}`,
              },
            }]);
          }
        }
      }
    }

    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      // pyasc uses build_op config (no separate example build); others use build_example
      configId = behavior.requiresBuildBeforeAnalysis
        ? await this.getBuildExampleConfigId()
        : await this.getBuildConfigId();
    }

    try {
      const runCommand = getRunCommand(Number(configId));

      console.log('runCommand', runCommand);
      const executor = ProjectManager.getInstance().getExecutor();
      const res = await executor.execute(runCommand, [], [], {}, true);

      console.log('runRes', res);

      if (res.code !== 0) {
        const output = res.output ?? '';
        const isQemuSegfault = /qemu/i.test(output) && (/signal\s+11|Segmentation\s+fault/i.test(output) || /core\s+dumped/i.test(output));
        const isPyascRuntime = !behavior.requiresBuildBeforeAnalysis && /runtime_camodel|cannot find -lruntime_camodel|Runtime library must be available/i.test(output);
        const message = isQemuSegfault
          ? t('build.runFailedQemuSegfault', { output })
          : isPyascRuntime
            ? t('build.runFailedPyascRuntime', { output })
            : t('build.runFailed', { output });
        vscode.window.showErrorMessage(message);
        return;
      }

      vscode.window.showInformationMessage(t('build.runSuccess'));
    }
    catch (e) {
      vscode.window.showErrorMessage(t('build.getRunCommandFailed', { error: (e as Error).message }));
    }
  }

  /**
   * 编译示例
   */
  async startBuildExample(params: StartBuildExampleParams): Promise<void> {
    const pm = ProjectManager.getInstance();

    // 如果传入了 projectId，则设置 ProjectManager 的项目信息（与 startBuild 一致）
    if (params.projectId !== undefined) {
      const project = getProjectById(Number(params.projectId));
      if (project) {
        pm['_projectId'] = String(params.projectId);
        pm['_projectName'] = project.project_name;
        pm['_projectPath'] = project.project_path;
      }
    }

    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      configId = await this.getBuildExampleConfigId();
    }

    try {
      const buildCommand = getBuildExampleCommand(
        Number(configId),
        params.compileOption,
        params.operatorNames,
      );
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executor.execute(buildCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage(t('build.executeFailed', { output: '' }));

        return;
      }

      vscode.window.showInformationMessage(t('build.executeSuccess'));
    }
    catch (e) {
      vscode.window.showErrorMessage(t('build.getExecuteCommandFailed', { error: (e as Error).message }));
    }
  }

  /**
   * 开始仿真分析
   */
  async startSimulate(params: { operatorNames?: string } = {}): Promise<void> {
    const configData = await this.getBuildConfigsList();
    const simulatorItem = configData.find((v) => v.config_type === CONFIG_TYPES.SIMULATE);

    const projectId = ProjectManager.getInstance().projectId;
    const project = projectId ? getProjectById(Number(projectId)) : null;
    // Option A: preserve V1 behavior — startSimulate reads project.project_type (stored value)
    // and throws on active-file-check failure.
    const opPlugin = OperatorPluginRegistry.getOpPlugin(project?.project_type);
    const behavior = opPlugin.buildBehavior;

    if (behavior.requiresActiveFileCheck && !params.operatorNames) {
      const activeEditor = vscode.window.activeTextEditor;
      const isPyFile = activeEditor?.document.fileName.endsWith(behavior.activeFileExtension!);

      if (!isPyFile) {
        vscode.window.showWarningMessage(t('build.openPyFirst'));
        throw new Error(t('task.openPyFirst'));
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage(t('build.workspacePathNotFound'));
        throw new Error(t('task.workspacePathNotFound'));
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const filePath = activeEditor!.document.uri.fsPath;
      const relativePath = path.relative(workspacePath, filePath).replace(/\\/g, '/');

      const buildConfigId = await this.getBuildConfigId();
      if (buildConfigId && projectId) {
        const configs = await getConfig(Number(projectId), 'build_op');
        const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);
        if (buildOpConfig) {
          await postConfig('build_op', [{
            config_id: buildConfigId,
            config_type: 'build_op',
            user_options: {
              ...buildOpConfig.user_options,
              target_file: `python3 ${relativePath}`,
            },
          }]);
        }
      }
    }

    if (behavior.requiresBuildBeforeAnalysis) {
      const buildCommand = getBuildOpCommand(Number(simulatorItem?.config_id), '', params.operatorNames);
      const buildRes = await ProjectManager.getInstance().getExecutor().execute(buildCommand, [], [], {}, true);

      console.log('buildRes', buildRes);

      if (buildRes.code !== 0) {
        vscode.window.showErrorMessage(t('build.compileFailed', { output: buildRes.output }));
        throw new Error(t('build.compileFailedThrow', { output: buildRes.output }));
      }

      await tryMarkOperatorsAsCompiled(Number(simulatorItem?.config_id), params.operatorNames);

      if (await isRootStandardCustom()) {
        const exConfigId = await this.getBuildExampleConfigId();
        const exampleBuildCommand = getBuildExampleCommand(
          Number(exConfigId),
          `--simulator --soc=${soc_version}`,
          params.operatorNames,
        );
        const exampleBuildRes = await ProjectManager.getInstance().getExecutor()
          .execute(exampleBuildCommand, [], [], {}, true);

        console.log('example buildRes', exampleBuildRes);

        if (exampleBuildRes.code !== 0) {
          vscode.window.showErrorMessage(t('build.executeFailed', { output: exampleBuildRes.output }));
          throw new Error(t('build.executeFailedThrow', { output: exampleBuildRes.output }));
        }
      }
    }

    const configId = await this.getSimulateConfigId();
    const exConfigId = await this.getBuildExampleConfigId();

    console.log('simulate configId', configId, exConfigId);

    try {
      const simulateCommand = getSimulateCommand(Number(configId), Number(exConfigId), params.operatorNames);

      console.log('simulateCommand', simulateCommand);
      const res = await ProjectManager.getInstance().getExecutor().execute(simulateCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage(t('build.simulationFailed'));
        throw new Error(t('build.simulationFailedThrow', { output: res.output ?? '' }));
      }

      vscode.window.showInformationMessage(t('build.simulationSuccess'));
      vscode.commands.executeCommand('huawei-op-devtools.open-performance-panel-view');
      vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData');
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(t('build.getSimulationCommandFailed', { error: (e as Error).message }));
      throw e;
    }
  }

  /**
   * 开始上板分析
   */
  async startOnBoard(params: { operatorNames?: string } = {}): Promise<void> {
    const projectId = ProjectManager.getInstance().projectId;
    const project = projectId ? getProjectById(Number(projectId)) : null;
    // Option A: preserve V1 behavior — startOnBoard reads project.project_type (stored value)
    // and returns (not throws) on active-file-check failure.
    const opPlugin = OperatorPluginRegistry.getOpPlugin(project?.project_type);
    const behavior = opPlugin.buildBehavior;

    if (behavior.requiresActiveFileCheck && !params.operatorNames) {
      const activeEditor = vscode.window.activeTextEditor;
      const isPyFile = activeEditor?.document.fileName.endsWith(behavior.activeFileExtension!);

      if (!isPyFile) {
        vscode.window.showWarningMessage(t('build.openPyFirst'));
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage(t('build.workspacePathNotFound'));
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      const filePath = activeEditor!.document.uri.fsPath;
      const relativePath = path.relative(workspacePath, filePath).replace(/\\/g, '/');

      const buildConfigId = await this.getBuildConfigId();
      if (buildConfigId && projectId) {
        const configs = await getConfig(Number(projectId), 'build_op');
        const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);
        if (buildOpConfig) {
          await postConfig('build_op', [{
            config_id: buildConfigId,
            config_type: 'build_op',
            user_options: {
              ...buildOpConfig.user_options,
              target_file: `python3 ${relativePath}`,
            },
          }]);
        }
      }
    }

    const configId = await this.getOnBoardConfigId();

    if (behavior.requiresBuildBeforeAnalysis) {
      const buildCommand = getBuildOpCommand(Number(configId), '', params.operatorNames);
      const buildRes = await ProjectManager.getInstance().getExecutor().execute(buildCommand, [], [], {}, true);

      console.log('buildRes', buildRes);

      if (buildRes.code !== 0) {
        vscode.window.showErrorMessage(t('build.compileFailed', { output: buildRes.output }));
        return;
      }

      await tryMarkOperatorsAsCompiled(Number(configId), params.operatorNames);

      if (await isRootStandardCustom()) {
        const exConfigId = await this.getBuildExampleConfigId();
        const exampleBuildCommand = getBuildExampleCommand(Number(exConfigId), '', params.operatorNames);
        const exampleBuildRes = await ProjectManager.getInstance().getExecutor()
          .execute(exampleBuildCommand, [], [], {}, true);

        console.log('example buildRes', exampleBuildRes);

        if (exampleBuildRes.code !== 0) {
          vscode.window.showErrorMessage(t('build.executeFailed', { output: exampleBuildRes.output }));
          return;
        }
      }
    }

    const exConfigId = await this.getBuildExampleConfigId();

    console.log('onboard configId', configId, exConfigId);

    try {
      const onBoardCommand = getOnBoardCommand(Number(configId), Number(exConfigId), params.operatorNames);

      console.log('onBoardCommand', onBoardCommand);
      const res = await ProjectManager.getInstance().getExecutor().execute(onBoardCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage(t('build.onBoardFailed'));
        return;
      }

      vscode.window.showInformationMessage(t('build.onBoardSuccess'));
      vscode.commands.executeCommand('huawei-op-devtools.open-performance-panel-view');
      vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData');
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(t('build.getOnBoardCommandFailed', { error: (e as Error).message }));
    }
  }

  /**
   * 开始DumpTensor分析
   */
  async startDumpTensor(params: { operatorNames?: string, compileOption?: string } = {}): Promise<void> {
    let configId = await this.getBuildConfigId();
    console.log('[startDumpTensor] 查询到 configId:', configId);

    // 获取当前目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('未找到工作区路径');
      return;
    }
    const currentDir = workspaceFolders[0].uri.fsPath;
    const tempDataPath = path.join(currentDir, '.vscode', 'dump_tensor_temp_data');
    const dumpTensorPath = path.join(currentDir, '.vscode', 'DumpTensor');

    // 删除临时数据目录
    console.log('[startDumpTensor] 删除临时数据目录:', tempDataPath);
    try {
      if (fs.existsSync(tempDataPath)) {
        fs.rmSync(tempDataPath, { recursive: true, force: true });
        console.log('[startDumpTensor] 临时数据目录已删除');
      }
    } catch (error) {
      console.error('[startDumpTensor] 删除临时数据目录失败:', error);
    }

    const buildCommand = getBuildOpCommand(
      Number(configId),
      params.compileOption,
      params.operatorNames,
    );
    console.log('[startDumpTensor] 生成的编译命令:', buildCommand);

    const executor = ProjectManager.getInstance()
      .getExecutor();
    console.log('[startDumpTensor] 开始执行编译命令...');

    const res = await executor.execute(buildCommand, [], [], {}, true);
    console.log('[startDumpTensor] 编译执行结果:', {
      code: res.code,
      output: res.output,
    });

    if (res.code !== 0) {
      console.error('[startDumpTensor] 编译失败，退出码:', res.code, '输出:', res.output);
      vscode.window.showErrorMessage(t('build.compileFailed', { output: res.output }));
      return;
    }

    await tryMarkOperatorsAsCompiled(Number(configId), params.operatorNames);

    const exConfigId = await this.getBuildExampleConfigId();
    if (await isRootStandardCustom()) {
      const exampleBuildCommand = getBuildExampleCommand(
        Number(exConfigId),
        params.compileOption,
        params.operatorNames,
      );
      const exampleBuildExecutor = ProjectManager.getInstance()
        .getExecutor();
      const exampleBuildRes = await exampleBuildExecutor.execute(
        `export ASCEND_GLOBAL_LOG_LEVEL=1 && export ASCEND_DUMP_PATH=../.vscode/dump_tensor_temp_data && ${exampleBuildCommand}`,
        [],
        [],
        {},
        true,
      );
      console.log('[startDumpTensor] example buildRes', exampleBuildRes);

      if (exampleBuildRes.code !== 0) {
        vscode.window.showErrorMessage(t('build.executeFailed', { output: exampleBuildRes.output }));
        return;
      }

      // 执行show_kernel_debug_data命令
      await this.executeShowKernelDebugData(tempDataPath, dumpTensorPath);

      vscode.window.showInformationMessage(t('build.dumpTensorSuccess'));

      // 打开DumpTensor数据面板并刷新数据
      await this.openDumpTensorPanel();
    } else {
      try {
        const runCommand = getRunCommand(Number(exConfigId));
        console.log('[startDumpTensor] runCommand', runCommand);

        const executor = ProjectManager.getInstance()
          .getExecutor();
        const res = await executor.execute(`export ASCEND_GLOBAL_LOG_LEVEL=1 && export ASCEND_DUMP_PATH=../.vscode/dump_tensor_temp_data && ${runCommand}`, [], [], {}, true);
        console.log('[startDumpTensor] runRes', res);

        if (res.code !== 0) {
          const output = res.output ?? '';
          const isQemuSegfault = /qemu/i.test(output) && (/signal\s+11|Segmentation\s+fault/i.test(output) || /core\s+dumped/i.test(output));
          const message = isQemuSegfault ? t('build.runFailedQemuSegfault', { output }) : t('build.runFailed', { output });
          vscode.window.showErrorMessage(message);
          return;
        }

        // 执行show_kernel_debug_data命令
        await this.executeShowKernelDebugData(tempDataPath, dumpTensorPath);

        vscode.window.showInformationMessage(t('build.dumpTensorSuccess'));

        // 打开DumpTensor数据面板并刷新数据
        await this.openDumpTensorPanel();
      }
      catch (e) {
        vscode.window.showErrorMessage(t('build.getRunCommandFailed', { error: (e as Error).message }));
      }
    }
  }

  /**
   * 执行UT测试
   */
  async startUtTest(params: { operatorNames?: string, projectId?: string | number, configId?: string } = {}): Promise<void> {
    const pm = ProjectManager.getInstance();

    // 如果传入了 projectId，则设置 ProjectManager 的项目信息
    if (params.projectId !== undefined) {
      const project = getProjectById(Number(params.projectId));
      if (project) {
        pm['_projectId'] = String(params.projectId);
        pm['_projectName'] = project.project_name;
        pm['_projectPath'] = project.project_path;
      }
    }

    let configId = params.configId ? Number(params.configId) : undefined;

    if (!configId) {
      configId = await this.getUtTestConfigId();
    }

    try {
      // 构建UT测试命令
      const buildCommand = getUtTestCommand(
        Number(configId),
        params.operatorNames,
      );
      
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executor.execute(buildCommand, [], [], {}, true);

      if (res.code !== 0) {
        vscode.window.showErrorMessage('UT测试执行失败');
        return;
      }

      vscode.window.showInformationMessage('UT测试执行成功');
    }
    catch (e) {
      vscode.window.showErrorMessage(`获取UT测试命令失败 ${(e as Error).message}`);
    }
  }

  /**
   * 执行show_kernel_debug_data命令
   */
  private async executeShowKernelDebugData(tempDataPath: string, dumpTensorPath: string): Promise<void> {
    try {
      const showCommand = `show_kernel_debug_data ${tempDataPath} ${dumpTensorPath}`;
      console.log('[startDumpTensor] 执行show_kernel_debug_data命令:', showCommand);
      
      const executor = ProjectManager.getInstance().getExecutor();
      const showRes = await executor.execute(showCommand, [], [], {}, true);
      console.log('[startDumpTensor] show_kernel_debug_data执行结果:', {
        code: showRes.code,
        output: showRes.output,
      });
      
      if (showRes.code !== 0) {
        console.error('[startDumpTensor] show_kernel_debug_data执行失败，退出码:', showRes.code, '输出:', showRes.output);
        // 不影响主流程，只记录错误
      }
    } catch (error) {
      console.error('[startDumpTensor] 执行show_kernel_debug_data命令失败:', error);
      // 不影响主流程，只记录错误
    }
  }

  /**
   * 打开DumpTensor数据面板并刷新数据
   */
  private async openDumpTensorPanel(): Promise<void> {
    try {
      console.log('[startDumpTensor] 打开DumpTensor数据面板');
      // 打开DumpTensor数据面板
      await vscode.commands.executeCommand('huawei-op-devtools.open-dump-tensor-panel-view');
      // 刷新DumpTensor数据
      await vscode.commands.executeCommand('huawei-op-devtools.flashDumpTensorData');
      console.log('[startDumpTensor] DumpTensor数据面板已打开并刷新');
    } catch (error) {
      console.error('[startDumpTensor] 打开DumpTensor数据面板失败:', error);
    }
  }

  /**
   * 导入DumpTensor .bin文件
   */
  async importDumpTensorBinFile(binFilePath: string): Promise<void> {
    try {
      console.log('[importDumpTensorBinFile] 开始导入.bin文件:', binFilePath);
      
      // 获取当前目录
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('未找到工作区路径');
        return;
      }
      const currentDir = workspaceFolders[0].uri.fsPath;
      const tempDataPath = path.join(currentDir, '.vscode', 'dump_tensor_temp_data');
      const dumpTensorPath = path.join(currentDir, '.vscode', 'DumpTensor');

      // 删除临时数据目录
      console.log('[importDumpTensorBinFile] 删除临时数据目录:', tempDataPath);
      try {
        if (fs.existsSync(tempDataPath)) {
          fs.rmSync(tempDataPath, { recursive: true, force: true });
          console.log('[importDumpTensorBinFile] 临时数据目录已删除');
        }
      } catch (error) {
        console.error('[importDumpTensorBinFile] 删除临时数据目录失败:', error);
      }

      // 确保临时数据目录存在
      if (!fs.existsSync(tempDataPath)) {
        fs.mkdirSync(tempDataPath, { recursive: true });
        console.log('[importDumpTensorBinFile] 创建临时数据目录:', tempDataPath);
      }

      // 复制选中的.bin文件到临时目录
      const fileName = path.basename(binFilePath);
      const destPath = path.join(tempDataPath, fileName);
      fs.copyFileSync(binFilePath, destPath);
      console.log('[importDumpTensorBinFile] .bin文件已复制到临时目录:', destPath);

      // 执行show_kernel_debug_data命令
      await this.executeShowKernelDebugData(tempDataPath, dumpTensorPath);
      
      vscode.window.showInformationMessage('导入DumpTensor .bin文件成功');
      
      // 打开DumpTensor数据面板并刷新数据
      await this.openDumpTensorPanel();
    } catch (error) {
      console.error('[importDumpTensorBinFile] 导入DumpTensor .bin文件失败:', error);
      vscode.window.showErrorMessage('导入DumpTensor .bin文件失败');
    }
  }
}

export const buildService = new BuildService();
