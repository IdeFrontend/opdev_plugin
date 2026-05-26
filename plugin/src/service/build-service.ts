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
import { joinIdeConfigPath, joinIdeConfigRelative } from '@plugin/helpers/ide-config-dir';
import { getOpByProjectIdAndOpName } from '@plugin/domain/models/model';
import { joinCommands } from '@plugin/domain/utils/command-utils';
import { getConfigById } from '@plugin/domain/services/configuration';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';
import {
  markOperatorsAsCompiled, getProjectByPath,
} from '@plugin/domain/models/project-model';
import { homeMethods } from '../controller/home-controller';
import { resolveAscendEnv } from '@plugin/domain/utils/ascend-util';
import {
  buildOperatorSpawnContext,
  executeOperatorCommand,
  resolveOpTypeForSpawn,
} from '@plugin/service/operator-command-executor';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { mergeBuildConfigsWithOperatorProjectWorkspace } from '@plugin/helpers/operator-project-workspace-config';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';

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

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }

  try {
    const match = await OperatorPluginRegistry.detectProject(workspaceFolders[0].uri.fsPath);

    return match?.projectType === OperatorProjectType.STANDARD_CUSTOM;
  }
  catch (error) {
    console.warn('[isRootStandardCustom] Detection failed:', error);

    return false;
  }
}

/**
 * After successful compilation, mark the operators corresponding to operatorNames (comma separated) as compiled and write them to projects.json.
 * It only takes effect for standard custom operator projects.
 */
async function tryMarkOperatorsAsCompiled(
  configId: number,
  operatorNames: string | undefined,
): Promise<void> {
  console.log('[tryMarkOperatorsAsCompiled] After successful build, mark operators in operatorNames (comma-separated) as compiled and write to projects.json.', operatorNames);

  if (!operatorNames || !operatorNames.trim()) {
    return;
  }

  try {
    const config = getConfigById(configId);

    console.log('[tryMarkOperatorsAsCompiled] Found config, config:', config);

    if (!config) {
      console.warn('[tryMarkOperatorsAsCompiled] Config not found, configId:', configId);

      return;
    }

    const project = getProjectById(config.project_id);

    console.log('[tryMarkOperatorsAsCompiled] Found project, project:', project);

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
      console.warn('[tryMarkOperatorsAsCompiled] Failed to detect project type:', error);

      return;
    }

    console.log('[tryMarkOperatorsAsCompiled] Start marking operators as compiled');
    await markOperatorsAsCompiled(project.project_path, operatorNames);
    console.log('[tryMarkOperatorsAsCompiled] Marked operators as compiled:', operatorNames);
  }
  catch (error) {
    console.warn(
      '[tryMarkOperatorsAsCompiled] Failed to update operator compile status:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * After a successful compile: persist `isCompiled` in the projects store when applicable, then refresh
 * the Operators / Actions trees so labels and selection state match.
 */
export async function notifyBuildSucceededForSidebar(
  configId: number,
  operatorNames: string | undefined,
): Promise<void> {
  await tryMarkOperatorsAsCompiled(configId, operatorNames);
  await requestSidebarContextsRefresh();
}

export class BuildService {
  private async guardSupportedProjectTypeForCurrentProject(): Promise<boolean> {
    const projectId = ProjectManager.getInstance().projectId;
    const project = projectId ? getProjectById(Number(projectId)) : null;
    const detectedType = project?.project_type || (await homeMethods.getProjectType()).projectType || '';

    if (!OperatorPluginRegistry.isProjectTypeSupported(detectedType)) {
      vscode.window.showErrorMessage(t('extension.unsupportedProjectTypeDisabled', { projectType: detectedType || 'unknown' }));

      return false;
    }

    return true;
  }

  /**
   * Build the example-build `compileOption` for simulator runs.
   *
   * Uses a single {@link resolveAscendEnv} call so the simulator directory
   * and the `--soc=<slug>` argument cannot drift apart. The plugin still
   * emits `SOC_VERSION` / `NPU_ARCH` / `SIMULATOR_TYPE` in the spawn env via
   * `executeOperatorCommand`; this option string only adds the Ascend
   * `--soc=` CLI flag that the ascend operator `build.sh` expects.
   */
  private buildSimulateExampleCompileOption(
    projectId: number | undefined,
    operatorNames?: string,
  ): string {
    const resolved = resolveAscendEnv({ isSimulator: true });
    const simDir = resolved.simulatorType ?? '';
    const opType = resolveOpTypeForSpawn(projectId, operatorNames);

    if (opType === 'ascend') {
      return `--simulator ${simDir} --soc=${resolved.socVersion}`;
    }

    return `--simulator ${simDir}`;
  }

  /**
   * Get a list of build configurations
   */
  async getBuildConfigsList(): Promise<BuildConfig[]> {
    await ProjectManager.getInstance()
      .initProject();
    const projectId = ProjectManager.getInstance().projectId;

    console.log('getBuildConfigsList: querying configs, projectId:', projectId);
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

    console.log('getBuildConfigsList: query result', {
      build_op: opConfig.length,
      build_example: exampleConfig.length,
      simulate: simulateConfig.length,
      on_board: onBoardConfig.length,
      ut_test: utTestConfig.length,
    });

    const configs = [
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

    return mergeBuildConfigsWithOperatorProjectWorkspace(configs);
  }

  /**
   * Get configuration based on type
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
   * Get build configuration ID
   */
  async getBuildConfigId(): Promise<number | undefined> {
    const config = await this.getConfigByType(CONFIG_TYPES.BUILD_OP);

    return config?.config_id;
  }

  /**
   * Get sample build configuration ID
   */
  async getBuildExampleConfigId(): Promise<number | undefined> {
    const config = await this.getConfigByType(CONFIG_TYPES.BUILD_EXAMPLE);

    return config?.config_id;
  }

  /**
   * Get simulation configuration ID
   */
  async getSimulateConfigId(): Promise<string> {
    const config = await this.getConfigByType(CONFIG_TYPES.SIMULATE);

    return config?.config_id ? String(config.config_id) : '';
  }

  /**
   * Get board configuration ID
   */
  async getOnBoardConfigId(): Promise<string> {
    const config = await this.getConfigByType(CONFIG_TYPES.ON_BOARD);

    return config?.config_id ? String(config.config_id) : '';
  }

  /**
   * Get UT test configuration ID
   */
  async getUtTestConfigId(): Promise<number | undefined> {
    const config = await this.getConfigByType(CONFIG_TYPES.UT_TEST);

    return config?.config_id;
  }

  /**
   * Compile operator
   */
  async startBuild(params: StartBuildParams): Promise<void> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return;
    }

    console.log('[startBuild] ========== Start building operators ==========');
    console.log('[startBuild] Input params:', JSON.stringify(params, null, 2));
    const pm = ProjectManager.getInstance();

    // If projectId is passed in, set the project ID of ProjectManager
    if (params.projectId !== undefined) {
      console.log('[startBuild] Detected incoming projectId:', params.projectId);
      const projectIdStr = String(params.projectId);
      const project = getProjectById(Number(params.projectId));

      if (project) {
        console.log('[startBuild] Found project info:', {
          id: project.id,
          project_name: project.project_name,
          project_path: project.project_path,
          project_type: project.project_type,
        });
        pm['_projectId'] = projectIdStr;
        pm['_projectName'] = project.project_name;
        pm['_projectPath'] = project.project_path;
        console.log('[startBuild] ProjectManager project info set');
      }
      else {
        console.warn('[startBuild] Matching project not found, projectId:', params.projectId);
      }
    }
    else {
      console.log('[startBuild] projectId not provided, using project ID in ProjectManager');
    }

    const projectId = pm.projectId;

    console.log('[startBuild] Current project ID in use:', projectId);
    console.log('[startBuild] ProjectManager project info:', {
      projectId: pm.projectId,
      projectName: pm['_projectName'],
      projectPath: pm['_projectPath'],
    });

    let configId = params.configId ? Number(params.configId) : undefined;

    console.log('[startBuild] Input configId:', configId);

    if (!configId) {
      console.log('[startBuild] configId not provided, trying to get current project config');
      configId = await this.getBuildConfigId();
      console.log('[startBuild] Retrieved configId:', configId);
    }

    if (!configId) {
      const errorMsg = t('build.noBuildConfig');

      console.error('[startBuild]', errorMsg);
      vscode.window.showErrorMessage(errorMsg);

      return;
    }

    console.log('[startBuild] Using config ID:', configId);
    console.log('[startBuild] Build params:', {
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
        params.scriptField,
      );

      console.log('[startBuild] Generated build command:', buildCommand);
      const executor = ProjectManager.getInstance()
        .getExecutor();

      console.log('[startBuild] Start executing build command...');
      const res = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          configId,
          operatorNames: params.operatorNames,
          scriptField: params.scriptField,
          script: buildCommand,
        }),
      );

      console.log('[startBuild] Build execution result:', {
        code: res.code,
        output: res.output,
      });

      if (res.code !== 0) {
        console.error('[startBuild] Build failed, exit code:', res.code, 'output:', res.output);
        vscode.window.showErrorMessage(t('build.compileFailed', { output: res.output }));

        return;
      }

      console.log('[startBuild] Build succeeded');
      vscode.window.showInformationMessage(t('build.compileSuccess'));

      await notifyBuildSucceededForSidebar(Number(configId), params.operatorNames);
    }
    catch (e) {
      console.error('[startBuild] Build process error:', e);
      vscode.window.showErrorMessage(t('build.getCompileCommandFailed', { error: (e as Error).message }));
    }

    console.log('[startBuild] ========== Finished building operators ==========');
  }

  /**
   * Run operator
   */
  async startRun(params: StartRunParams): Promise<void> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return;
    }

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
      const relativePath = path.relative(workspacePath, filePath)
        .replace(/\\/g, '/');

      const buildConfigId = await this.getBuildConfigId();

      if (buildConfigId) {
        const projectIdStr = ProjectManager.getInstance().projectId;

        if (projectIdStr) {
          const projectId = Number(projectIdStr);
          const configs = await getConfig(projectId, 'build_op');
          const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

          if (buildOpConfig) {
            await postConfig('build_op', [
              {
                config_id: buildConfigId,
                config_type: 'build_op',
                user_options: {
                  ...buildOpConfig.user_options,
                  target_file: `python3 ${relativePath}`,
                },
              },
            ]);
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
      const res = await executeOperatorCommand(
        runCommand,
        buildOperatorSpawnContext({
          configId,
          script: runCommand,
        }),
        { outputLabel: 'run' },
      );

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
   * Compile example
   */
  async startBuildExample(params: StartBuildExampleParams): Promise<void> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return;
    }

    const pm = ProjectManager.getInstance();

    // If projectId is passed in, set the project information of ProjectManager (consistent with startBuild)
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
      const res = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          configId,
          operatorNames: params.operatorNames,
          script: buildCommand,
        }),
      );

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
   * Start simulation analysis
   */
  async startSimulate(params: { operatorNames?: string; compileOption?: string } = {}): Promise<void> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return;
    }

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
      const relativePath = path.relative(workspacePath, filePath)
        .replace(/\\/g, '/');

      const buildConfigId = await this.getBuildConfigId();

      if (buildConfigId && projectId) {
        const configs = await getConfig(Number(projectId), 'build_op');
        const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

        if (buildOpConfig) {
          await postConfig('build_op', [
            {
              config_id: buildConfigId,
              config_type: 'build_op',
              user_options: {
                ...buildOpConfig.user_options,
                target_file: `python3 ${relativePath}`,
              },
            },
          ]);
        }
      }
    }

    if (behavior.requiresBuildBeforeAnalysis) {
      const simConfigId = Number(simulatorItem?.config_id);
      const buildCommand = getBuildOpCommand(simConfigId, params.compileOption, params.operatorNames);
      const buildRes = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          configId: simConfigId,
          operatorNames: params.operatorNames,
          script: buildCommand,
        }),
        { outputLabel: 'compile' },
      );

      console.log('buildRes', buildRes);

      if (buildRes.code !== 0) {
        vscode.window.showErrorMessage(t('build.compileFailed', { output: buildRes.output }));
        throw new Error(t('build.compileFailedThrow', { output: buildRes.output }));
      }

      await notifyBuildSucceededForSidebar(Number(simulatorItem?.config_id), params.operatorNames);

      if (await isRootStandardCustom()) {
        const exConfigId = await this.getBuildExampleConfigId();
        const exampleCompileOption = this.buildSimulateExampleCompileOption(
          project?.id,
          params.operatorNames,
        );
        const exampleBuildCommand = getBuildExampleCommand(
          Number(exConfigId),
          params.compileOption ?? exampleCompileOption,
          params.operatorNames,
        );
        const exampleBuildRes = await executeOperatorCommand(
          exampleBuildCommand,
          buildOperatorSpawnContext({
            configId: Number(exConfigId),
            operatorNames: params.operatorNames,
            script: exampleBuildCommand,
          }),
        );

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
      const res = await executeOperatorCommand(
        simulateCommand,
        buildOperatorSpawnContext({
          configId: Number(configId),
          operatorNames: params.operatorNames,
          script: simulateCommand,
        }),
      );

      if (res.code !== 0) {
        vscode.window.showErrorMessage(t('build.simulationFailed'));
        throw new Error(t('build.simulationFailedThrow', { output: res.output ?? '' }));
      }

      vscode.window.showInformationMessage(t('build.simulationSuccess'));
      await vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData', { focusIfNew: true });
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(t('build.getSimulationCommandFailed', { error: (e as Error).message }));
      throw e;
    }
  }

  /**
   * Start board analysis
   */
  async startOnBoard(params: { operatorNames?: string; compileOption?: string } = {}): Promise<void> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return;
    }

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
      const relativePath = path.relative(workspacePath, filePath)
        .replace(/\\/g, '/');

      const buildConfigId = await this.getBuildConfigId();

      if (buildConfigId && projectId) {
        const configs = await getConfig(Number(projectId), 'build_op');
        const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

        if (buildOpConfig) {
          await postConfig('build_op', [
            {
              config_id: buildConfigId,
              config_type: 'build_op',
              user_options: {
                ...buildOpConfig.user_options,
                target_file: `python3 ${relativePath}`,
              },
            },
          ]);
        }
      }
    }

    const configId = await this.getOnBoardConfigId();

    if (behavior.requiresBuildBeforeAnalysis) {
      const buildCommand = getBuildOpCommand(Number(configId), params.compileOption, params.operatorNames);
      const buildRes = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          configId: Number(configId),
          operatorNames: params.operatorNames,
          script: buildCommand,
        }),
        { outputLabel: 'compile' },
      );

      console.log('buildRes', buildRes);

      if (buildRes.code !== 0) {
        vscode.window.showErrorMessage(t('build.compileFailed', { output: buildRes.output }));

        return;
      }

      await notifyBuildSucceededForSidebar(Number(configId), params.operatorNames);

      if (await isRootStandardCustom()) {
        const exConfigId = await this.getBuildExampleConfigId();
        const exampleBuildCommand = getBuildExampleCommand(
          Number(exConfigId),
          params.compileOption,
          params.operatorNames,
        );
        const exampleBuildRes = await executeOperatorCommand(
          exampleBuildCommand,
          buildOperatorSpawnContext({
            configId: Number(exConfigId),
            operatorNames: params.operatorNames,
            script: exampleBuildCommand,
          }),
        );

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
      const res = await executeOperatorCommand(
        onBoardCommand,
        buildOperatorSpawnContext({
          configId: Number(configId),
          operatorNames: params.operatorNames,
          script: onBoardCommand,
        }),
      );

      if (res.code !== 0) {
        vscode.window.showErrorMessage(t('build.onBoardFailed'));

        return;
      }

      vscode.window.showInformationMessage(t('build.onBoardSuccess'));
      await vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData', { focusIfNew: true });
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(t('build.getOnBoardCommandFailed', { error: (e as Error).message }));
    }
  }

  /**
   * Start DumpTensor analysis
   */
  async startDumpTensor(params: { operatorNames?: string,
    compileOption?: string } = {}): Promise<void> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return;
    }

    const configId = await this.getBuildConfigId();

    console.log('[startDumpTensor] Queried configId:', configId);

    // Resolve workspace paths used by dump tensor flow.
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage(t('build.workspacePathNotFound'));

      return;
    }

    const currentDir = workspaceFolders[0].uri.fsPath;
    const tempDataPath = joinIdeConfigPath(currentDir, 'dump_tensor_temp_data');
    const dumpTensorPath = joinIdeConfigPath(currentDir, 'DumpTensor');

    // Remove temp data folder from previous runs.
    console.log('[startDumpTensor] Removing temp data directory:', tempDataPath);

    try {
      if (fs.existsSync(tempDataPath)) {
        fs.rmSync(tempDataPath, {
          recursive: true,
          force: true,
        });
        console.log('[startDumpTensor] Temp data directory removed');
      }
    }
    catch (error) {
      console.error('[startDumpTensor] Failed to remove temp data directory:', error);
    }

    const buildCommand = getBuildOpCommand(
      Number(configId),
      params.compileOption,
      params.operatorNames,
    );

    console.log('[startDumpTensor] Generated build command:', buildCommand);

    const executor = ProjectManager.getInstance()
      .getExecutor();

    console.log('[startDumpTensor] Start executing build command...');

    const res = await executeOperatorCommand(
      buildCommand,
      buildOperatorSpawnContext({
        configId: Number(configId),
        operatorNames: params.operatorNames,
        script: buildCommand,
      }),
    );

    console.log('[startDumpTensor] Build execution result:', {
      code: res.code,
      output: res.output,
    });

    if (res.code !== 0) {
      console.error('[startDumpTensor] Build failed, exit code:', res.code, 'output:', res.output);
      vscode.window.showErrorMessage(t('build.compileFailed', { output: res.output }));

      return;
    }

    await notifyBuildSucceededForSidebar(Number(configId), params.operatorNames);

    const exConfigId = await this.getBuildExampleConfigId();

    if (await isRootStandardCustom()) {
      const exampleBuildCommand = getBuildExampleCommand(
        Number(exConfigId),
        params.compileOption,
        params.operatorNames,
      );
      const exampleBuildExecutor = ProjectManager.getInstance()
        .getExecutor();
      const exampleCmd =
        `export ASCEND_GLOBAL_LOG_LEVEL=1 && export ASCEND_DUMP_PATH=../.vscode/dump_tensor_temp_data && ${exampleBuildCommand}`;
      const exampleBuildRes = await executeOperatorCommand(
        exampleCmd,
        buildOperatorSpawnContext({
          configId: Number(exConfigId),
          operatorNames: params.operatorNames,
          script: exampleBuildCommand,
        }),
      );

      console.log('[startDumpTensor] example buildRes', exampleBuildRes);

      if (exampleBuildRes.code !== 0) {
        vscode.window.showErrorMessage(t('build.executeFailed', { output: exampleBuildRes.output }));

        return;
      }

      vscode.window.showInformationMessage(t('build.dumpTensorSuccess'));
      await this.openDumpTensorPanel();
    }
    else {
      try {
        const runCommand = getRunCommand(Number(exConfigId));

        console.log('[startDumpTensor] runCommand', runCommand);

        const res = await executeOperatorCommand(
          runCommand,
          buildOperatorSpawnContext({
            configId: Number(exConfigId),
            operatorNames: params.operatorNames,
            script: runCommand,
          }),
          { outputLabel: 'run' },
        );

        console.log('[startDumpTensor] runRes', res);

        if (res.code !== 0) {
          const output = res.output ?? '';
          const isQemuSegfault = /qemu/i.test(output) && (/signal\s+11|Segmentation\s+fault/i.test(output) || /core\s+dumped/i.test(output));
          const message = isQemuSegfault ? t('build.runFailedQemuSegfault', { output }) : t('build.runFailed', { output });

          vscode.window.showErrorMessage(message);

          return;
        }

        vscode.window.showInformationMessage(t('build.dumpTensorSuccess'));

        // Open dump tensor panel and refresh.
        await this.openDumpTensorPanel();
      }
      catch (e) {
        vscode.window.showErrorMessage(t('build.getRunCommandFailed', { error: (e as Error).message }));
      }
    }
  }

  /**
   * Start UT test.
   */
  async startUtTest(params: { operatorNames?: string,
    projectId?: string | number,
    configId?: string } = {}): Promise<void> {
    const pm = ProjectManager.getInstance();

    // For external entry points, allow overriding project context.
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
      // Build UT test command.
      const buildCommand = getUtTestCommand(
        Number(configId),
        params.operatorNames,
      );

      const executor = ProjectManager.getInstance()
        .getExecutor();
      const res = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          configId,
          operatorNames: params.operatorNames,
          script: buildCommand,
        }),
      );

      if (res.code !== 0) {
        vscode.window.showErrorMessage(t('build.utTestFailed'));

        return;
      }

      vscode.window.showInformationMessage(t('build.utTestSuccess'));
    }
    catch (e) {
      vscode.window.showErrorMessage(t('build.getUtTestCommandFailed', { error: (e as Error).message }));
    }
  }

  /**
   * Execute show_kernel_debug_data command.
   */
  private async executeShowKernelDebugData(tempDataPath: string, dumpTensorPath: string): Promise<void> {
    try {
      const showCommand = `show_kernel_debug_data ${tempDataPath} ${dumpTensorPath}`;

      console.log('[startDumpTensor] Running show_kernel_debug_data command:', showCommand);

      const executor = ProjectManager.getInstance()
        .getExecutor();
      const showRes = await executor.execute(showCommand, [], [], { toolOutputLabel: 'debug' }, true);

      console.log('[startDumpTensor] show_kernel_debug_data result:', {
        code: showRes.code,
        output: showRes.output,
      });

      if (showRes.code !== 0) {
        console.error('[startDumpTensor] show_kernel_debug_data failed, exit code:', showRes.code, 'output:', showRes.output);
        // Non-blocking error: keep primary flow going.
      }
    }
    catch (error) {
      console.error('[startDumpTensor] Failed to run show_kernel_debug_data command:', error);
      // Non-blocking error: keep primary flow going.
    }
  }

  /**
   * Open dump tensor panel and refresh data.
   */
  private async openDumpTensorPanel(): Promise<void> {
    try {
      console.log('[startDumpTensor] Opening dump tensor data panel');
      await vscode.commands.executeCommand('huawei-op-devtools.open-dump-tensor-panel-view');
      await vscode.commands.executeCommand('huawei-op-devtools.flashDumpTensorData');
      console.log('[startDumpTensor] Dump tensor panel opened and refreshed');
    }
    catch (error) {
      console.error('[startDumpTensor] Failed to open dump tensor panel:', error);
    }
  }

  /**
   * Import DumpTensor .bin file.
   */
  async importDumpTensorBinFile(binFilePath: string): Promise<void> {
    try {
      console.log('[importDumpTensorBinFile] Importing .bin file:', binFilePath);

      // Resolve workspace paths used by dump tensor flow.
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(t('build.workspacePathNotFound'));

        return;
      }

      const currentDir = workspaceFolders[0].uri.fsPath;
      const tempDataPath = joinIdeConfigPath(currentDir, 'dump_tensor_temp_data');
      const dumpTensorPath = joinIdeConfigPath(currentDir, 'DumpTensor');

      // Remove temp data folder from previous runs.
      console.log('[importDumpTensorBinFile] Removing temp data directory:', tempDataPath);

      try {
        if (fs.existsSync(tempDataPath)) {
          fs.rmSync(tempDataPath, {
            recursive: true,
            force: true,
          });
          console.log('[importDumpTensorBinFile] Temp data directory removed');
        }
      }
      catch (error) {
        console.error('[importDumpTensorBinFile] Failed to remove temp data directory:', error);
      }

      // Ensure temp data directory exists.
      if (!fs.existsSync(tempDataPath)) {
        fs.mkdirSync(tempDataPath, { recursive: true });
        console.log('[importDumpTensorBinFile] Created temp data directory:', tempDataPath);
      }

      // Copy selected .bin file into temp directory.
      const fileName = path.basename(binFilePath);
      const destPath = path.join(tempDataPath, fileName);

      fs.copyFileSync(binFilePath, destPath);
      console.log('[importDumpTensorBinFile] Copied .bin file to temp directory:', destPath);

      // Post-process dump files and build tree data.
      await this.executeShowKernelDebugData(tempDataPath, dumpTensorPath);

      vscode.window.showInformationMessage(t('build.importDumpTensorBinSuccess'));

      // Open dump tensor panel and refresh.
      await this.openDumpTensorPanel();
    }
    catch (error) {
      console.error('[importDumpTensorBinFile] Failed to import DumpTensor .bin file:', error);
      vscode.window.showErrorMessage(t('extension.importDumpTensorBinFailed'));
    }
  }
}

export const buildService = new BuildService();
