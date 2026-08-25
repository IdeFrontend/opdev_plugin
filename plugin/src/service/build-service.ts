import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
} from '@shared/api-types';
import {
  getBuildExampleCommand,
  resolveExampleModeForBaseContext,
  getSimulateCommand,
  getOnBoardCommand,
  getBuildOpCommand,
  getRunCommand,
  getUtTestCommand,
  getStandardCustomDeployCommand,
  resolveBuildOpBaseContext,
  resolveBuildExampleBaseContext,
  resolveSimulateBaseContext,
  resolveOnBoardBaseContext,
  resolveUtTestBaseContext,
} from '@plugin/domain';
import { BaseContext } from '@plugin/domain/services/command-strategy';
import type {
  BuildOpConfig,
  BuildExampleConfig,
  SimulateConfig,
  OnBoardConfig,
  UtTestConfig,
} from '@plugin/service/config-service';
import {
  joinIdeConfigPath, joinIdeConfigRelative,
} from '@plugin/helpers/ide-config-dir';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath,
  normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { homeMethods } from '../controller/home-controller';
import { resolveAscendEnv } from '@plugin/domain/utils/ascend-util';
import {
  buildOperatorSpawnContext,
  commandFailureMessage,
  executeOperatorCommand,
} from '@plugin/service/operator-command-executor';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { ConfigService } from '@plugin/service/config-service';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import { resolveOrPickPythonOperatorUri } from '@plugin/helpers/python-operator-editor-context';
import {
  buildPythonDeployTarget,
  quoteShellTokenIfNeeded,
} from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import {
  COMMAND_FLASH_DUMP_TENSOR_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
  COMMAND_OPEN_DUMP_TENSOR_PANEL_VIEW,
} from '@plugin/constants';
import { decidePythonTargetAction } from '@plugin/helpers/sync-sanitizer-python-target';
import { probeTritonPythonDependencies } from '@plugin/domain/services/command-strategy/triton-strategy';
import {
  buildRemoteBuildExampleCommand,
  buildRemoteDumpTensorCommand,
  buildRemoteExecCommand,
  buildRemoteOnBoardCommand,
  createRemoteCommandWhenNoNpuTransformer,
  resolveRemotePullDir,
} from '@plugin/helpers/remote-command';
import { toWorkspaceRelativePosixPath } from '@plugin/domain/utils/path-utils';
import {
  getEnvironmentScriptPathFromWorkspace, getFirstWorkspaceFolderPath, readWorkspaceProjectTypeSetting,
} from '@plugin/helpers/operator-project-workspace-config';
import { updateWorkspaceCache } from '@plugin/helpers/workspace-cache';

/**
 * Checks whether the VS Code workspace root is a STANDARD_CUSTOM operator project.
 * Uses OperatorPluginRegistry.detectProject() — routing through the plugin registry.
 */
export async function isRootStandardCustom(): Promise<boolean> {
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
 * After successful compilation, mark the operators corresponding to operatorNames
 * (comma separated) as compiled in the workspace cache `compiledOpPaths`. It only
 * takes effect for standard custom operator projects.
 */
async function tryMarkOperatorsAsCompiled(
  projectPath: string,
  operatorNames: string | string[] | undefined,
): Promise<void> {
  const namesArray = Array.isArray(operatorNames)
    ? operatorNames
    : (operatorNames ?? '').split(',')
      .map((name) => name.trim())
      .filter(Boolean);

  console.log('[tryMarkOperatorsAsCompiled] After successful build, mark operators in operatorNames (comma-separated) as compiled in the workspace cache.', namesArray.join(','));

  if (namesArray.length === 0) {
    return;
  }

  try {
    const project = getProjectByPath(projectPath);

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
    // Persist the compiled status in the workspace cache so the sidebar
    // trees can read it id-free.
    await updateWorkspaceCache(project.project_path, (cache) => {
      const compiled = { ...(cache.project?.compiledOpPaths ?? {}) };
      const state = cache.folders?.[normalizeProjectPath(project.project_path)];
      const ops = [
        ...(state?.opsList ?? []),
        ...(state?.experimentalOpsList ?? []),
      ];

      for (const name of namesArray) {
        const op = ops.find((candidate) => candidate.name === name);

        if (op?.path) {
          compiled[op.path] = true;
        }
      }

      cache.project = {
        selectedOperatorPaths: cache.project?.selectedOperatorPaths ?? [],
        compiledOpPaths: compiled,
      };
    });
    console.log('[tryMarkOperatorsAsCompiled] Marked operators as compiled:', namesArray.join(','));
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
  projectPath: string,
  operatorNames: string | string[] | undefined,
): Promise<void> {
  await tryMarkOperatorsAsCompiled(projectPath, operatorNames);
  await requestSidebarContextsRefresh();
}

/**
 * Triton simulate / on-board profiling needs PyTorch + Triton importable in the resolved
 * interpreter. Probe before running so a missing dependency surfaces a clear error instead
 * of a cryptic msprof failure later. No-op for non-Triton operators.
 */
async function guardTritonProfilerDependencies(opType: string | undefined): Promise<boolean> {
  if (opType !== 'triton') {
    return true;
  }

  const probe = await probeTritonPythonDependencies();

  if (!probe.ok) {
    vscode.window.showErrorMessage(t('sanitizer.tritonDepsFailed', {
      interpreter: probe.interpreter,
      detail: probe.stderr,
    }));

    return false;
  }

  return true;
}

export class BuildService {
  private async guardSupportedProjectTypeForCurrentProject(): Promise<boolean> {
    const projectPath = getFirstWorkspaceFolderPath();
    const project = projectPath ? getProjectByPath(projectPath) : null;
    const detectedType = readWorkspaceProjectTypeSetting()
      ?? project?.project_type
      ?? (await homeMethods.getProjectType()).projectType
      ?? '';

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
   * emits `SOC_VERSION` (simulator device dir for cann sim) / `NPU_ARCH` in the spawn env via
   * `executeOperatorCommand`; this option string adds the `--soc=` CLI flag
   * required by the example build after `--simulator`.
   */
  private buildSimulateExampleCompileOption(): string {
    const resolved = resolveAscendEnv({ isSimulator: true });

    return `--simulator --soc=${resolved.socVersion}`;
  }

  /**
   * Resolve the runtime command context for one config section of the
   * workspace-root project. The operator carries no input: command generation
   * resolves it from the sidebar selection first, then via the synthesized
   * root/sub-operator records — never from workspace settings.
   */
  private resolveBuildOpCtx(projectPath: string, operatorNames?: string): BaseContext<BuildOpConfig> {
    return resolveBuildOpBaseContext(projectPath, operatorNames);
  }

  /** Resolved build_example context for the same project/operator (example-target repoint). */
  private resolveBuildExampleCtx(projectPath: string, operatorNames?: string): BaseContext<BuildExampleConfig> {
    return resolveBuildExampleBaseContext(projectPath, operatorNames);
  }

  /** Resolved simulate context for the same project/operator. */
  private resolveSimulateCtx(projectPath: string, operatorNames?: string): BaseContext<SimulateConfig> {
    return resolveSimulateBaseContext(projectPath, operatorNames);
  }

  /** Resolved on_board context for the same project/operator. */
  private resolveOnBoardCtx(projectPath: string, operatorNames?: string): BaseContext<OnBoardConfig> {
    return resolveOnBoardBaseContext(projectPath, operatorNames);
  }

  /** Resolved ut_test context for the same project/operator. */
  private resolveUtTestCtx(projectPath: string, operatorNames?: string): BaseContext<UtTestConfig> {
    return resolveUtTestBaseContext(projectPath, operatorNames);
  }

  /**
   * Write the active-file deploy target whenever the workspace is a recognized
   * project — the write is gated on `buildConfigId` (a build_op config ROW
   * exists) && the registered project id; the row's VALUES never gate the write. The id-free
   * twin of "build_op row exists" is `getProjectByPath` (non-null exactly for
   * recognized projects; rows are seeded create-if-missing for them).
   */
  private async writeBuildOpDeployTargetIfProject(relativePath: string): Promise<void> {
    const projectPath = getFirstWorkspaceFolderPath();
    const project = projectPath ? getProjectByPath(projectPath) : undefined;

    if (!project) {
      return;
    }

    await ConfigService.writeBuildOpDeployTarget(buildPythonDeployTarget(relativePath));
  }

  private async deployStandardCustomRunPackage(
    projectPath: string,
    operatorNames?: string,
  ) {
    const baseContext = this.resolveBuildOpCtx(projectPath);
    const deployCommand = getStandardCustomDeployCommand(baseContext);

    return executeOperatorCommand(
      deployCommand,
      buildOperatorSpawnContext({
        baseContext,
        projectPath,
        operatorNames,
        script: deployCommand,
      }),
      { outputLabel: 'compile' },
    );
  }

  /**
   * Compile operator
   */
  async startBuild(params: StartBuildParams): Promise<boolean> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return false;
    }

    console.log('[startBuild] ========== Start building operators ==========');
    console.log('[startBuild] Input params:', JSON.stringify(params, null, 2));

    // Axiom: one window = one project = workspaceFolders[0] (subfolder/multi-project
    // windows are outside the supported model).
    const projectPath = getFirstWorkspaceFolderPath();

    if (!projectPath) {
      const errorMsg = t('build.workspacePathNotFound');

      console.error('[startBuild]', errorMsg);
      vscode.window.showErrorMessage(errorMsg);

      return false;
    }

    console.log('[startBuild] Project root in use:', projectPath);
    console.log('[startBuild] Build params:', {
      projectPath,
      compileOption: params.compileOption,
      operatorNames: params.operatorNames,
      operatorType: params.operatorType,
    });

    // The gate twin of the `getBuildConfigId()` check — a build_op config row
    // exists (`getProjectByPath` non-null) AND its script is non-empty. An
    // unrecognized workspace or an empty compile command → no build.
    if (getProjectByPath(projectPath) == null || ConfigService.getBuildOpConfig().script === '') {
      const errorMsg = t('build.noBuildConfig');

      console.error('[startBuild]', errorMsg);
      vscode.window.showErrorMessage(errorMsg);

      return false;
    }

    try {
      const baseContext = this.resolveBuildOpCtx(projectPath, params.operatorNames);
      const buildCommand = getBuildOpCommand(
        baseContext,
        params.compileOption,
        params.operatorNames,
        params.scriptField,
      );

      console.log('[startBuild] Generated build command:', buildCommand);
      console.log('[startBuild] Start executing build command...');
      const res = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          baseContext,
          projectPath,
          operatorNames: params.operatorNames,
          scriptField: params.scriptField,
          script: buildCommand,
          toolOutputLabel: 'compile',
        }),
      );

      console.log('[startBuild] Build execution result:', {
        code: res.code,
        output: res.output,
        interruptedByUserStop: res.interruptedByUserStop,
      });

      if (res.code !== 0) {
        if (res.interruptedByUserStop) {
          return false;
        }

        console.error('[startBuild] Build failed, exit code:', res.code, 'output:', res.output);
        vscode.window.showErrorMessage(commandFailureMessage(res, 'build.compileFailed', { output: res.output }));

        return false;
      }

      console.log('[startBuild] Build succeeded');
      vscode.window.showInformationMessage(t('build.compileSuccess'));

      await notifyBuildSucceededForSidebar(projectPath, params.operatorNames);
      console.log('[startBuild] ========== Finished building operators ==========');

      return true;
    }
    catch (e) {
      console.error('[startBuild] Build process error:', e);
      vscode.window.showErrorMessage(t('build.getCompileCommandFailed', { error: (e as Error).message }));

      return false;
    }
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

    // Axiom: one window = one project = workspaceFolders[0].
    const projectPath = getFirstWorkspaceFolderPath();

    if (!projectPath) {
      vscode.window.showWarningMessage(t('build.workspacePathNotFound'));

      return;
    }

    if (behavior.requiresActiveFileCheck && !params.filePath) {
      const workspacePath = projectPath;
      const ext = behavior.activeFileExtension!;
      const pickedUri = await resolveOrPickPythonOperatorUri(ext, workspacePath);

      if (!pickedUri) {
        vscode.window.showWarningMessage(t('build.openPyFirst'));

        return;
      }

      const filePath = pickedUri.fsPath;
      const relativePath = toWorkspaceRelativePosixPath(workspacePath, filePath);

      await this.writeBuildOpDeployTargetIfProject(relativePath);
    }

    // pyasc uses build_op config (no separate example build); others use build_example
    try {
      const baseContext = behavior.requiresBuildBeforeAnalysis
        ? this.resolveBuildExampleCtx(projectPath)
        : this.resolveBuildOpCtx(projectPath);
      const runCommand = getRunCommand(baseContext);

      console.log('runCommand', runCommand);
      const res = await executeOperatorCommand(
        runCommand,
        buildOperatorSpawnContext({
          baseContext,
          projectPath,
          script: runCommand,
        }),
        {
          outputLabel: 'run',
          transformCommand: createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteExecCommand(command)),
        },
      );

      console.log('runRes', res);

      if (res.code !== 0) {
        if (res.interruptedByUserStop) {
          return;
        }

        const output = res.output ?? '';
        const isQemuSegfault = /qemu/i.test(output) && (/signal\s+11|Segmentation\s+fault/i.test(output) || /core\s+dumped/i.test(output));
        const isPyascRuntime = !behavior.requiresBuildBeforeAnalysis && /runtime_camodel|cannot find -lruntime_camodel|Runtime library must be available/i.test(output);
        const messageKey = isQemuSegfault
          ? 'build.runFailedQemuSegfault'
          : isPyascRuntime
            ? 'build.runFailedPyascRuntime'
            : 'build.runFailed';
        const message = commandFailureMessage(res, messageKey, { output });

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

    // Axiom: one window = one project = workspaceFolders[0].
    const projectPath = getFirstWorkspaceFolderPath();

    if (!projectPath) {
      vscode.window.showWarningMessage(t('build.workspacePathNotFound'));

      return;
    }

    try {
      // Resolve the run_example mode from the example the operator actually ships (the
      // plugin-wide executionMode setting is only a tiebreaker), and warn up front when it
      // ships none — build.sh would otherwise fail deep in with "does not have <mode>
      // examples".
      const exampleMode = resolveExampleModeForBaseContext(this.resolveBuildExampleCtx(projectPath, params.operatorNames), params.operatorNames);

      if (!exampleMode.exampleFound && exampleMode.opName) {
        vscode.window.showWarningMessage(t('build.exampleNoSourceForOperator', { op: exampleMode.opName }));
      }

      const baseContext = this.resolveBuildExampleCtx(projectPath, params.operatorNames);
      const buildCommand = getBuildExampleCommand(
        baseContext,
        params.compileOption,
        params.operatorNames,
        exampleMode.mode,
      );
      const res = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          baseContext,
          projectPath,
          operatorNames: params.operatorNames,
          script: buildCommand,
          toolOutputLabel: 'compile',
        }),
        {
          transformCommand: createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteBuildExampleCommand(
            command,
            projectPath,
          )),
        },
      );

      if (res.code !== 0) {
        if (res.interruptedByUserStop) {
          return;
        }

        vscode.window.showErrorMessage(commandFailureMessage(res, 'build.executeFailed', { output: '' }));

        return;
      }

      vscode.window.showInformationMessage(t('build.executeSuccess'));
    }
    catch (e) {
      vscode.window.showErrorMessage(t('build.getExecuteCommandFailed', { error: (e as Error).message }));
    }
  }

  /**
   * Resolve the python deploy/run target for an active-file project (PyAsc) before
   * simulate / on-board. Captures it from the focused `.py`; if Start was clicked inside
   * the options webview (which holds focus, so there is no active editor) it trusts the
   * target captured at panel open. Returns false (after a warning) when no usable target
   * exists, so the caller can abort.
   */
  private async ensurePythonDeployTarget(activeFileExtension: string): Promise<boolean> {
    const activeEditor = vscode.window.activeTextEditor;
    const deployTargetKey = 'compileAndDeploy.buildConfig.deployCommandOrRunCommand';
    const existingTargetFile = ConfigService.readOpDevtoolsSetting<string>(deployTargetKey);

    const action = decidePythonTargetAction({
      activeFileName: activeEditor?.document.fileName,
      activeFileExtension,
      existingTargetFile,
    });

    if (action === 'use-existing') {
      return true;
    }

    if (action === 'no-target') {
      vscode.window.showWarningMessage(t('build.openPyFirst'));

      return false;
    }

    // action === 'sync-from-active': capture the focused .py as the deploy/run target.
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage(t('build.workspacePathNotFound'));

      return false;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const filePath = activeEditor!.document.uri.fsPath;
    const relativePath = toWorkspaceRelativePosixPath(workspacePath, filePath);

    await this.writeBuildOpDeployTargetIfProject(relativePath);

    return true;
  }

  /**
   * Capture the active `.py` deploy target before the simulate/on-board options webview
   * opens (it opens in ViewColumn.Active and displaces the editor). Returns false (after a
   * warning) when an active-file project has no `.py` focused, so the caller can skip
   * opening the panel.
   */
  async captureActiveFileTargetForOptionsPanel(): Promise<boolean> {
    const projectPath = getFirstWorkspaceFolderPath();
    const project = projectPath ? getProjectByPath(projectPath) : null;
    const behavior = OperatorPluginRegistry.getOpPlugin(project?.project_type).buildBehavior;

    if (!behavior.requiresActiveFileCheck) {
      return true;
    }

    return this.ensurePythonDeployTarget(behavior.activeFileExtension || '.py');
  }

  /**
   * Start simulation analysis
   */
  async startSimulate(params: { operatorNames?: string;
    compileOption?: string } = {}): Promise<void> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return;
    }

    // Axiom: one window = one project = workspaceFolders[0].
    const projectPath = getFirstWorkspaceFolderPath();

    if (!projectPath) {
      vscode.window.showWarningMessage(t('build.workspacePathNotFound'));

      return;
    }

    const project = getProjectByPath(projectPath);
    // Option A: preserve V1 behavior — startSimulate reads project.project_type (stored value)
    // and throws on active-file-check failure.
    const opPlugin = OperatorPluginRegistry.getOpPlugin(project?.project_type);
    const behavior = opPlugin.buildBehavior;

    if (!behavior.supportsSimulate) {
      return;
    }

    if (!(await guardTritonProfilerDependencies(opPlugin.opType))) {
      return;
    }

    if (behavior.requiresActiveFileCheck && !params.operatorNames) {
      if (!(await this.ensurePythonDeployTarget(behavior.activeFileExtension!))) {
        throw new Error(t('task.openPyFirst'));
      }
    }

    if (behavior.requiresBuildBeforeAnalysis) {
      const simulateBaseContext = this.resolveSimulateCtx(projectPath, params.operatorNames);
      const buildCommand = getBuildOpCommand(simulateBaseContext, params.compileOption, params.operatorNames);
      const buildRes = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          baseContext: simulateBaseContext,
          projectPath,
          operatorNames: params.operatorNames,
          script: buildCommand,
          isSimulator: true,
        }),
        { outputLabel: 'compile' },
      );

      console.log('buildRes', buildRes);

      if (buildRes.code !== 0) {
        if (buildRes.interruptedByUserStop) {
          throw new Error('SOC configuration interrupted by user');
        }

        vscode.window.showErrorMessage(commandFailureMessage(buildRes, 'build.compileFailed', { output: buildRes.output }));
        throw new Error(commandFailureMessage(buildRes, 'build.compileFailedThrow', { output: buildRes.output }));
      }

      await notifyBuildSucceededForSidebar(projectPath, params.operatorNames);

      if (await isRootStandardCustom()) {
        const exampleCompileOption = this.buildSimulateExampleCompileOption();
        const exampleBaseContext = this.resolveBuildExampleCtx(projectPath, params.operatorNames);
        const exampleBuildCommand = getBuildExampleCommand(
          exampleBaseContext,
          params.compileOption ?? exampleCompileOption,
          params.operatorNames,
          undefined,
          true,
        );
        const exampleBuildRes = await executeOperatorCommand(
          exampleBuildCommand,
          buildOperatorSpawnContext({
            baseContext: exampleBaseContext,
            projectPath,
            operatorNames: params.operatorNames,
            script: exampleBuildCommand,
            toolOutputLabel: 'compile',
          }),
        );

        console.log('example buildRes', exampleBuildRes);

        if (exampleBuildRes.code !== 0) {
          vscode.window.showErrorMessage(commandFailureMessage(exampleBuildRes, 'build.executeFailed', { output: exampleBuildRes.output }));
          throw new Error(commandFailureMessage(exampleBuildRes, 'build.executeFailedThrow', { output: exampleBuildRes.output }));
        }

        const deployRes = await this.deployStandardCustomRunPackage(
          projectPath,
          params.operatorNames,
        );

        if (deployRes.code !== 0) {
          if (deployRes.interruptedByUserStop) {
            throw new Error('SOC configuration interrupted by user');
          }

          vscode.window.showErrorMessage(commandFailureMessage(deployRes, 'build.executeFailed', { output: deployRes.output }));
          throw new Error(commandFailureMessage(deployRes, 'build.executeFailedThrow', { output: deployRes.output ?? '' }));
        }
      }
    }

    console.log('simulate projectPath', projectPath);

    try {
      const simulateBaseContext = this.resolveSimulateCtx(projectPath, params.operatorNames);
      const simulateCommand = getSimulateCommand(
        simulateBaseContext,
        this.resolveBuildExampleCtx(projectPath, params.operatorNames),
        params.operatorNames,
      );

      console.log('simulateCommand', simulateCommand);
      const res = await executeOperatorCommand(
        simulateCommand,
        buildOperatorSpawnContext({
          baseContext: simulateBaseContext,
          projectPath,
          operatorNames: params.operatorNames,
          script: simulateCommand,
          toolOutputLabel: 'simulate',
          isSimulator: true,
        }),
      );

      if (res.code !== 0) {
        if (res.interruptedByUserStop) {
          throw new Error('SOC configuration interrupted by user');
        }

        vscode.window.showErrorMessage(commandFailureMessage(res, 'build.simulationFailed'));
        throw new Error(commandFailureMessage(res, 'build.simulationFailedThrow', { output: res.output ?? '' }));
      }

      vscode.window.showInformationMessage(t('build.simulationSuccess'));
      await vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA, {
        focusIfNew: true,
        openIfNew: true,
      });
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(t('build.getSimulationCommandFailed', { error: (e as Error).message }));
      throw e;
    }
  }

  /**
   * Start board analysis
   */
  async startOnBoard(params: { operatorNames?: string;
    compileOption?: string } = {}): Promise<void> {
    if (!(await this.guardSupportedProjectTypeForCurrentProject())) {
      return;
    }

    // Axiom: one window = one project = workspaceFolders[0].
    const projectPath = getFirstWorkspaceFolderPath();

    if (!projectPath) {
      vscode.window.showWarningMessage(t('build.workspacePathNotFound'));

      return;
    }

    const project = getProjectByPath(projectPath);
    // Option A: preserve V1 behavior — startOnBoard reads project.project_type (stored value)
    // and returns (not throws) on active-file-check failure.
    const opPlugin = OperatorPluginRegistry.getOpPlugin(project?.project_type);
    const behavior = opPlugin.buildBehavior;

    if (!behavior.supportsOnBoard) {
      return;
    }

    if (!(await guardTritonProfilerDependencies(opPlugin.opType))) {
      return;
    }

    if (behavior.requiresActiveFileCheck && !params.operatorNames) {
      if (!(await this.ensurePythonDeployTarget(behavior.activeFileExtension!))) {
        return;
      }
    }

    if (behavior.requiresBuildBeforeAnalysis) {
      const onBoardBaseContext = this.resolveOnBoardCtx(projectPath, params.operatorNames);
      const buildCommand = getBuildOpCommand(onBoardBaseContext, params.compileOption, params.operatorNames);
      const buildRes = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          baseContext: onBoardBaseContext,
          projectPath,
          operatorNames: params.operatorNames,
          script: buildCommand,
        }),
        { outputLabel: 'compile' },
      );

      console.log('buildRes', buildRes);

      if (buildRes.code !== 0) {
        vscode.window.showErrorMessage(commandFailureMessage(buildRes, 'build.compileFailed', { output: buildRes.output }));

        return;
      }

      await notifyBuildSucceededForSidebar(projectPath, params.operatorNames);

      if (await isRootStandardCustom()) {
        const exampleBaseContext = this.resolveBuildExampleCtx(projectPath, params.operatorNames);
        const exampleBuildCommand = getBuildExampleCommand(
          exampleBaseContext,
          params.compileOption,
          params.operatorNames,
          undefined,
          true,
        );
        const exampleBuildRes = await executeOperatorCommand(
          exampleBuildCommand,
          buildOperatorSpawnContext({
            baseContext: exampleBaseContext,
            projectPath,
            operatorNames: params.operatorNames,
            script: exampleBuildCommand,
            toolOutputLabel: 'compile',
          }),
          {
            transformCommand: createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteBuildExampleCommand(
              command,
              projectPath,
            )),
          },
        );

        console.log('example buildRes', exampleBuildRes);

        if (exampleBuildRes.code !== 0) {
          if (exampleBuildRes.interruptedByUserStop) {
            return;
          }

          vscode.window.showErrorMessage(commandFailureMessage(exampleBuildRes, 'build.executeFailed', { output: exampleBuildRes.output }));

          return;
        }

        const deployRes = await this.deployStandardCustomRunPackage(
          projectPath,
          params.operatorNames,
        );

        if (deployRes.code !== 0) {
          if (deployRes.interruptedByUserStop) {
            return;
          }

          vscode.window.showErrorMessage(commandFailureMessage(deployRes, 'build.executeFailed', { output: deployRes.output }));

          return;
        }
      }
    }

    console.log('onboard projectPath', projectPath);

    try {
      const onBoardBaseContext = this.resolveOnBoardCtx(projectPath, params.operatorNames);
      const onBoardCommand = getOnBoardCommand(
        onBoardBaseContext,
        this.resolveBuildExampleCtx(projectPath, params.operatorNames),
        params.operatorNames,
      );
      const remoteOnBoardCommandTransformer = createRemoteCommandWhenNoNpuTransformer(
        (command) => buildRemoteOnBoardCommand(
          command,
          this.getRemotePullDir(projectPath, 'opprof'),
        ),
        this.isOnBoardProfilerCommand,
      );

      console.log('onBoardCommand', onBoardCommand);
      const res = await executeOperatorCommand(
        onBoardCommand,
        buildOperatorSpawnContext({
          baseContext: onBoardBaseContext,
          projectPath,
          operatorNames: params.operatorNames,
          script: onBoardCommand,
          toolOutputLabel: 'run',
        }),
        { transformCommand: remoteOnBoardCommandTransformer },
      );

      if (res.code !== 0) {
        if (res.interruptedByUserStop) {
          return;
        }

        vscode.window.showErrorMessage(commandFailureMessage(res, 'build.onBoardFailed'));

        return;
      }

      vscode.window.showInformationMessage(t('build.onBoardSuccess'));
      await vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA, {
        focusIfNew: true,
        openIfNew: true,
      });
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

    // Resolve workspace paths used by dump tensor flow. Axiom: one window = one
    // project = workspaceFolders[0].
    const projectPath = getFirstWorkspaceFolderPath();

    if (!projectPath) {
      vscode.window.showErrorMessage(t('build.workspacePathNotFound'));

      return;
    }

    const currentDir = projectPath;
    const tempDataPath = joinIdeConfigPath(currentDir, 'dump_tensor_temp_data');
    const dumpTensorEnvPrefix = this.getDumpTensorEnvExportsPrefix();
    const remoteDumpTensorCommandTransformer = createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteDumpTensorCommand(
      command,
      this.getRemotePullDir(currentDir, 'dump_tensor_temp_data'),
    ));

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

    const baseContext = this.resolveBuildOpCtx(currentDir, params.operatorNames);
    const buildCommand = getBuildOpCommand(
      baseContext,
      params.compileOption,
      params.operatorNames,
    );

    console.log('[startDumpTensor] Generated build command:', buildCommand);
    console.log('[startDumpTensor] Start executing build command...');

    const res = await executeOperatorCommand(
      buildCommand,
      buildOperatorSpawnContext({
        baseContext,
        projectPath: currentDir,
        operatorNames: params.operatorNames,
        script: buildCommand,
        toolOutputLabel: 'compile',
      }),
    );

    console.log('[startDumpTensor] Build execution result:', {
      code: res.code,
      output: res.output,
    });

    if (res.code !== 0) {
      console.error('[startDumpTensor] Build failed, exit code:', res.code, 'output:', res.output);
      vscode.window.showErrorMessage(commandFailureMessage(res, 'build.compileFailed', { output: res.output }));

      return;
    }

    await notifyBuildSucceededForSidebar(currentDir, params.operatorNames);

    if (await isRootStandardCustom()) {
      const exampleBaseContext = this.resolveBuildExampleCtx(currentDir, params.operatorNames);
      const exampleBuildCommand = getBuildExampleCommand(
        exampleBaseContext,
        params.compileOption,
        params.operatorNames,
      );
      const exampleCmd = `${dumpTensorEnvPrefix}${exampleBuildCommand}`;
      const exampleBuildRes = await executeOperatorCommand(
        exampleCmd,
        buildOperatorSpawnContext({
          baseContext: exampleBaseContext,
          projectPath: currentDir,
          operatorNames: params.operatorNames,
          script: exampleBuildCommand,
          toolOutputLabel: 'compile',
        }),
        { transformCommand: remoteDumpTensorCommandTransformer },
      );

      console.log('[startDumpTensor] example buildRes', exampleBuildRes);

      if (exampleBuildRes.code !== 0) {
        if (exampleBuildRes.interruptedByUserStop) {
          return;
        }

        vscode.window.showErrorMessage(commandFailureMessage(exampleBuildRes, 'build.executeFailed', { output: exampleBuildRes.output }));

        return;
      }

      await this.finalizeDumpTensorFlow(currentDir);
    }
    else {
      try {
        const baseContext = this.resolveBuildExampleCtx(currentDir);
        const runCommand = getRunCommand(baseContext);
        const runCommandWithEnv = `${dumpTensorEnvPrefix}${runCommand}`;

        console.log('[startDumpTensor] runCommand', runCommandWithEnv);

        const res = await executeOperatorCommand(
          runCommandWithEnv,
          buildOperatorSpawnContext({
            baseContext,
            projectPath: currentDir,
            operatorNames: params.operatorNames,
            script: runCommandWithEnv,
          }),
          {
            outputLabel: 'run',
            transformCommand: remoteDumpTensorCommandTransformer,
          },
        );

        console.log('[startDumpTensor] runRes', res);

        if (res.code !== 0) {
          if (res.interruptedByUserStop) {
            return;
          }

          const output = res.output ?? '';
          const isQemuSegfault = /qemu/i.test(output) && (/signal\s+11|Segmentation\s+fault/i.test(output) || /core\s+dumped/i.test(output));
          const messageKey = isQemuSegfault ? 'build.runFailedQemuSegfault' : 'build.runFailed';
          const message = commandFailureMessage(res, messageKey, { output });

          vscode.window.showErrorMessage(message);

          return;
        }

        await this.finalizeDumpTensorFlow(currentDir);
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
    compileOption?: string } = {}): Promise<void> {
    // Axiom: one window = one project = workspaceFolders[0].
    const projectPath = getFirstWorkspaceFolderPath();

    if (!projectPath) {
      vscode.window.showWarningMessage(t('build.workspacePathNotFound'));

      return;
    }

    try {
      // Build UT test command.
      const baseContext = this.resolveUtTestCtx(projectPath, params.operatorNames);
      const buildCommand = getUtTestCommand(
        baseContext,
        params.operatorNames,
        params.compileOption,
      );

      const res = await executeOperatorCommand(
        buildCommand,
        buildOperatorSpawnContext({
          baseContext,
          projectPath,
          operatorNames: params.operatorNames,
          script: buildCommand,
          toolOutputLabel: 'test',
        }),
      );

      if (res.code !== 0) {
        if (res.interruptedByUserStop) {
          return;
        }

        vscode.window.showErrorMessage(commandFailureMessage(res, 'build.utTestFailed'));

        return;
      }

      vscode.window.showInformationMessage(t('build.utTestSuccess'));
    }
    catch (e) {
      vscode.window.showErrorMessage(t('build.getUtTestCommandFailed', { error: (e as Error).message }));
    }
  }

  /** ASCEND dump env exports prepended to example build / run during Dump tensor. */
  private getDumpTensorEnvExportsPrefix(): string {
    return `export ASCEND_GLOBAL_LOG_LEVEL=1 && export ASCEND_DUMP_PATH=../${joinIdeConfigRelative('dump_tensor_temp_data')} && `;
  }

  private isOnBoardProfilerCommand(command: string): boolean {
    return /\bmsprof\s+op\b/.test(command) && !/\bmsprof\s+op\s+simulator\b/.test(command);
  }

  private getRemotePullDir(rootPath: string | undefined, outputDir: 'opprof' | 'DumpTensor' | 'dump_tensor_temp_data'): string {
    return resolveRemotePullDir(rootPath, outputDir, 'remote artifact retrieval');
  }

  /**
   * Post-process dump output, notify success, and open the Dump tensor panel.
   */
  private async finalizeDumpTensorFlow(workspaceRoot: string): Promise<void> {
    const tempDataPath = joinIdeConfigPath(workspaceRoot, 'dump_tensor_temp_data');
    const dumpTensorPath = joinIdeConfigPath(workspaceRoot, 'DumpTensor');

    await this.executeShowKernelDebugData(tempDataPath, dumpTensorPath);
    vscode.window.showInformationMessage(t('build.dumpTensorSuccess'));
    await this.openDumpTensorPanel();
  }

  /**
   * Execute show_kernel_debug_data command.
   */
  private async executeShowKernelDebugData(tempDataPath: string, dumpTensorPath: string): Promise<void> {
    try {
      const environmentScript = getEnvironmentScriptPathFromWorkspace();
      const sourceEnvironmentCommand = environmentScript
        ? `. ${quoteShellTokenIfNeeded(environmentScript)}`
        : '';

      const showKernelDebugDataCommand = `show_kernel_debug_data ${tempDataPath} ${dumpTensorPath}`;

      const showCommand = sourceEnvironmentCommand
        ? `${sourceEnvironmentCommand} && ${showKernelDebugDataCommand}`
        : showKernelDebugDataCommand;

      console.log('[startDumpTensor] Running show_kernel_debug_data command:', showCommand);

      const commandToExecute = await createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteDumpTensorCommand(
        command,
        dumpTensorPath,
      ))(showCommand);
      const executor = ProjectManager.getInstance()
        .getExecutor();
      const showRes = await executor.execute(commandToExecute, [], [], { toolOutputLabel: 'debug' }, true);

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
      await vscode.commands.executeCommand(COMMAND_OPEN_DUMP_TENSOR_PANEL_VIEW);
      await vscode.commands.executeCommand(COMMAND_FLASH_DUMP_TENSOR_DATA);
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
      await this.openDumpTensorPanel();
    }
    catch (error) {
      console.error('[importDumpTensorBinFile] Failed to import DumpTensor .bin file:', error);
      vscode.window.showErrorMessage(t('extension.importDumpTensorBinFailed'));
    }
  }
}

export const buildService = new BuildService();
