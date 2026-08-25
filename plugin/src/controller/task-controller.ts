import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';

import { CommandExecutor } from '@plugin/class/command-options';
import { StTestResultsPanel } from '@plugin/class/st-test-results-panel';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { buildService } from '@plugin/service/build-service';
import { sanitizerService } from '@plugin/service/sanitizer-service';
import {
  StTestService,
  type StartStTestParams,
} from '@plugin/service/st-test-service';
import { isStTestCancelledError } from '@plugin/domain/services/st-test-errors';
import { homeMethods } from './home-controller';
import {
  StartBuildParams,
  StartBuildExampleParams,
  StartRunParams,
  StartSimulateParams,
  StartOnBoardParams,
  StartSanitizerParams,
  StartUtTestParams,
} from '@shared/api-types';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { getCompileOptionForSelectedOperators } from '@plugin/helpers/compile-options';
import {
  msdebugConfiguredTargetExists,
  updateMsdebugTarget,
  type MsdebugTargetPatchResult,
} from '@plugin/domain/utils/debug-target';
import { backfillMsdebugLibInEnvFile } from '@plugin/domain/utils/msdebug-env';
import {
  isPythonDebugLaunchConfig,
  resolveDebugLaunchConfigName,
} from '@plugin/domain/utils/debug-config-resolver';
import { updateMsdebugPythonTarget } from '@plugin/domain/utils/debug-python-target';
import { ensureMsdebugBreakpointFileAssociations } from '@plugin/domain/utils/msdebug-ide-settings';
import { resolveTritonLaunchKernelPath } from '@plugin/domain/utils/triton-kernel-path';
import { probeTritonPythonDependencies } from '@plugin/domain/services/command-strategy/triton-strategy';
import {
  buildPythonDeployTarget,
  resolvePythonExecutablePath,
} from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import { isMindStudioDebugExtensionActive } from '@plugin/helpers/post-activate-bootstrap';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import { resolveOrPickPythonOperatorUri } from '@plugin/helpers/python-operator-editor-context';
import { enqueueCompileRun } from '@plugin/helpers/operator-flow-coordinator';
import {
  startNpuHardwareProbe, startRemoteNpuHardwareProbe,
} from '@plugin/domain/utils/npu-hardware-probe';
import { toWorkspaceRelativePosixPath } from '@plugin/domain/utils/path-utils';
import {
  buildRemoteExecCommand,
  ensureRemoteToolAvailable,
  buildRemoteBuildExampleCommand,
  createRemoteCommandWhenNoNpuTransformer,
  getRemoteToolConfig,
} from '@plugin/helpers/remote-command';
import {
  executeOperatorCommand, buildOperatorSpawnContext,
} from '@plugin/service/operator-command-executor';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { showStTestCompletionNotification } from '@plugin/helpers/st-test-completion-notification';
import {
  getBuildExampleCommand,
  resolveBuildExampleBaseContext,
  resolveExampleModeForBaseContext,
} from '@plugin/domain';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { isRootStandardCustom } from '@plugin/service/build-service';

// Global task manager: used to track and terminate executing tasks
let currentExecutor: CommandExecutor | null = null;

async function ensurePostActivateBootstrapReady(): Promise<void> {
  await whenPostActivateBootstrapReady();
}

async function guardSupportedProjectTypeOrNotify(): Promise<boolean> {
  const projectTypeInfo = await homeMethods.getProjectType();
  const projectType = projectTypeInfo.projectType || '';

  if (!OperatorPluginRegistry.isProjectTypeSupported(projectType)) {
    vscode.window.showErrorMessage(t('extension.unsupportedProjectTypeDisabled', { projectType: projectType || 'unknown' }));

    return false;
  }

  return true;
}

type PythonOperatorLaunchContext = {
  operatorCwd: string;
  scriptArg: string;
};

async function runTritonDebugPreflight(projectType: string | null): Promise<boolean> {
  if (projectType !== OperatorProjectType.TRITON) {
    return true;
  }

  const result = await probeTritonPythonDependencies();

  if (result.ok) {
    return true;
  }

  const detail = result.stderr ? `\n${result.stderr}` : '';

  vscode.window.showErrorMessage(t('task.tritonDebugDependenciesMissing', { interpreter: result.interpreter }) + detail);

  return false;
}

/**
 * @internal — exported for regression tests (python-launch-deploy-target-guard.spec.ts).
 * Semantics: the deploy target is written iff the workspace is a
 * recognized project AND `pm.projectPath` is set; the write is gated on
 * `getBuildConfigId()` (a build_op config ROW exists) && the registered project id. The
 * settings VALUES never gate the write: the row survives even when the user clears all
 * build_op settings. The id-free twin of "build_op row exists" is the synthesized project
 * record (`getProjectByPath`), non-null exactly for recognized projects.
 */
export async function preparePythonOperatorLaunchContext(projectType: string | null): Promise<PythonOperatorLaunchContext | null> {
  const isPythonOperator = projectType === OperatorProjectType.PYASC
    || projectType === OperatorProjectType.TRITON;

  if (!isPythonOperator) {
    return null;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(t('task.workspacePathNotFound'));

    return null;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const pickedUri = await resolveOrPickPythonOperatorUri('.py', workspacePath);

  if (!pickedUri) {
    vscode.window.showWarningMessage(t('task.openPyFirst'));

    return null;
  }

  const filePath = pickedUri.fsPath;
  const relativePath = toWorkspaceRelativePosixPath(workspacePath, filePath);
  const projectPath = ProjectManager.getInstance().projectPath;

  if (projectPath && getProjectByPath(projectPath)) {
    const deployTarget = buildPythonDeployTarget(relativePath);

    await ConfigService.writeBuildOpDeployTarget(deployTarget);
  }

  return {
    operatorCwd: path.dirname(filePath),
    scriptArg: `./${path.basename(filePath)}`,
  };
}

async function notifyMsdebugTargetPatchResult(result: MsdebugTargetPatchResult): Promise<void> {
  if (result.status === 'noop' && result.reason === 'no_operator') {
    vscode.window.showWarningMessage(t('debug.autoAdaptNoOperator'));
  }
  else if (result.status === 'noop' && result.reason === 'no_binary') {
    vscode.window.showWarningMessage(t('debug.autoAdaptNoBinary'));
  }
}

async function patchLaunchJsonForDebugSession(
  workspaceRoot: string,
  debugConfigName: string,
  pythonContext: PythonOperatorLaunchContext | null,
  projectType: string | null,
  mode: 'cpu' | 'npu',
): Promise<boolean> {
  await backfillMsdebugLibInEnvFile(workspaceRoot);

  if (!isPythonDebugLaunchConfig(debugConfigName)) {
    // C/C++ debug (msdebug / msdebug-cpu): auto-adapt the launch target to the built binary.
    try {
      const operator = await homeMethods.resolveDebugOperatorEntry();
      const targetFile = operator
        ? homeMethods.resolveBuildExampleTargetFile(operator.name)
        : undefined;
      const result = await updateMsdebugTarget(workspaceRoot, operator, targetFile);

      await notifyMsdebugTargetPatchResult(result);
    }
    catch (e) {
      console.warn('updateMsdebugTarget failed (continuing):', e);
    }

    // Never launch a debug session whose target binary is missing on disk: a debug build
    // that failed or was preempted (GC-24) would otherwise attach msdebug to a phantom
    // executable. Only block on a concrete, resolvable-but-absent target.
    if (msdebugConfiguredTargetExists(workspaceRoot, debugConfigName) === false) {
      vscode.window.showErrorMessage(t('debug.targetBinaryMissing'));

      return false;
    }

    return true;
  }

  if (!pythonContext) {
    return true;
  }

  let launchKernelPath: string | undefined;

  if (projectType === OperatorProjectType.TRITON) {
    if (mode === 'npu') {
      const operatorStem = pythonContext?.scriptArg
        ? path.basename(pythonContext.scriptArg, '.py')
        : undefined;

      launchKernelPath = resolveTritonLaunchKernelPath(workspaceRoot, operatorStem);

      if (!launchKernelPath) {
        vscode.window.showWarningMessage(t('task.tritonKernelPathNotFound'));
      }
    }

    try {
      await ensureMsdebugBreakpointFileAssociations(workspaceRoot);
    }
    catch (e) {
      console.warn('ensureMsdebugBreakpointFileAssociations failed (continuing):', e);
    }
  }

  try {
    await updateMsdebugPythonTarget(workspaceRoot, [debugConfigName], {
      interpreter: resolvePythonExecutablePath(),
      scriptArg: pythonContext.scriptArg,
      cwd: pythonContext.operatorCwd,
      launchKernelPath,
    });
  }
  catch (e) {
    console.warn('updateMsdebugPythonTarget failed (continuing):', e);
  }

  return true;
}

type RemoteDebugLaunchConfigPatch = {
  host: string;
  port: number;
};

function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      }
      else if (char === '\\') {
        escaped = true;
      }
      else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }

      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) {
        start = -1;
        continue;
      }

      depth -= 1;

      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

export function parseRemoteDebugAdapterReadyPort(output: string): number | undefined {
  const objects = extractJsonObjects(output);

  for (let index = objects.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(objects[index]) as { event?: unknown;
        port?: unknown };

      if (parsed.event !== 'ready') {
        continue;
      }

      const port = Number(parsed.port);

      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        return port;
      }
    }
    catch {
      // Ignore non-JSON log fragments.
    }
  }

  return undefined;
}

async function updateRemoteDebugConfig(
  workspaceRoot: string,
  patch: RemoteDebugLaunchConfigPatch,
): Promise<boolean> {
  const launchJsonPath = joinIdeConfigPath(workspaceRoot, 'launch.json');

  try {
    const launchJsonContent = await fs.readFile(launchJsonPath, 'utf8');
    const launchJson = JSON.parse(launchJsonContent);
    let updated = false;

    for (const config of launchJson.configurations) {
      if (config.name === 'remote-debug' && config.remoteConfig) {
        config.remoteConfig.host = patch.host;
        config.remoteConfig.port = patch.port;
        config.remoteConfig.remoteWorkspaceFolder = workspaceRoot;
        updated = true;
        break;
      }
    }

    if (!updated) {
      return false;
    }

    await fs.writeFile(launchJsonPath, JSON.stringify(launchJson, null, 2), 'utf8');

    return true;
  }
  catch (error) {
    console.warn('Failed to update remote debug config in launch.json:', error);

    return false;
  }
}

export const taskMethods = {
  /**
   * Build operator
   */
  async startBuild(params: StartBuildParams = {}): Promise<void> {
    return enqueueCompileRun('build', async () => {
      await ensurePostActivateBootstrapReady();

      try {
        // Save the current executor reference for possible termination operations
        currentExecutor = ProjectManager.getInstance()
          .getExecutor();
        await buildService.startBuild(params);
      }
      finally {
        // Clear executor reference
        currentExecutor = null;
        ProjectManager.getInstance()
          .clearExecutor();
      }
    });
  },

  /**
   * Run operator
   */
  async startRun(params: StartRunParams = {}): Promise<void> {
    return enqueueCompileRun('run', async () => {
      await ensurePostActivateBootstrapReady();

      try {
        // Save current executor reference
        currentExecutor = ProjectManager.getInstance()
          .getExecutor();
        await buildService.startRun(params);
      }
      finally {
        // Clear executor reference
        currentExecutor = null;
        ProjectManager.getInstance()
          .clearExecutor();
      }
    });
  },

  /**
   * Build example
   */
  async startBuildExample(params: StartBuildExampleParams = {}): Promise<void> {

    return enqueueCompileRun('buildExample', async () => {
      await ensurePostActivateBootstrapReady();

      try {
        // Save current executor reference
        currentExecutor = ProjectManager.getInstance()
          .getExecutor();
        await buildService.startBuildExample(params);
      }
      finally {
        // Clear executor reference
        currentExecutor = null;
        ProjectManager.getInstance()
          .clearExecutor();
      }
    });
  },

  /**
   * Simulation analysis
   */
  async startSimulate(params: StartSimulateParams = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      // Save current executor reference
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await buildService.startSimulate(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * On-board analysis
   */
  async startOnBoard(params: StartOnBoardParams = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      // Save current executor reference
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await buildService.startOnBoard(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * Anomaly detection
   */
  async runSanitizer(params: StartSanitizerParams = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      // Save the current executor reference for possible termination operations
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await sanitizerService.runSanitizer(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * Execute DumpTensor
   */
  async startDumpTensor(params: {
    operatorNames?: string;
    compileOption?: string
  } = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      // Save current executor reference
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await buildService.startDumpTensor(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * Run UT tests
   */
  async startUtTest(params: StartUtTestParams = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      // Keep executor reference for possible cancellation
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await buildService.startUtTest(params);
    }
    finally {
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * Run standard-custom ST tests through TTK.
   */
  async startStTest(
    context: vscode.ExtensionContext,
    params: StartStTestParams,
  ): Promise<void> {
    await ensurePostActivateBootstrapReady();
    let stExecutor: CommandExecutor | undefined;

    try {
      const executor = ProjectManager.getInstance()
        .getExecutor();

      stExecutor = executor;
      currentExecutor = executor;

      const result = await new StTestService(context)
        .startStTest(params, { isCancellationRequested: () => currentExecutor !== executor });

      void showStTestCompletionNotification({
        workspaceRoot: params.workspaceRoot,
        outputPaths: result.outputPaths,
        runDirectory: result.runDirectory,
      });

      StTestResultsPanel.recordCompletedRun(
        result.report,
        result.artifacts,
        result.runDirectory,
        params.workspaceRoot,
      );

      try {
        await StTestResultsPanel.createOrShow(
          context,
          result.report,
          result.artifacts,
          result.runDirectory,
        );
      }
      catch (panelError) {
        console.error('[ST test] Could not present the completed result report:', panelError);
      }
    }
    catch (error) {
      if (isStTestCancelledError(error)) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(t('stTest.failed', { error: message }));
      throw error;
    }
    finally {
      if (stExecutor && currentExecutor === stExecutor) {
        currentExecutor = null;
        ProjectManager.getInstance()
          .clearExecutor();
      }
    }
  },

  /**
   * Import DumpTensor .bin file
   */
  async importDumpTensorBinFile(params: { binFilePath: string }): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await buildService.importDumpTensorBinFile(params.binFilePath);
    }
    finally {
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * Stop task
   * @returns true when a running shell process was terminated
   */
  async stopTask(options?: { notify?: boolean }): Promise<boolean> {
    console.log('[stopTask] Received stop task request');

    if (currentExecutor) {
      console.log('[stopTask] Terminating running task');
      await currentExecutor.kill();
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();

      if (options?.notify !== false) {
        vscode.window.showWarningMessage(t('task.stoppedByUser'));
      }

      return true;
    }

    if (options?.notify !== false) {
      console.log('[stopTask] No running task');
      vscode.window.showInformationMessage(t('task.noRunningTask'));
    }

    return false;
  },

  /**
   * Run NPU debug
   */
  async runDebug(): Promise<void> {
    if (!isMindStudioDebugExtensionActive()) {
      vscode.window.showErrorMessage(t('mindStudio.debugPluginInstalling'));

      return;
    }

    const localNpuAvailable = await startNpuHardwareProbe();

    if (!localNpuAvailable) {
      const remoteNpuAvailable = await startRemoteNpuHardwareProbe();

      if (!remoteNpuAvailable) {
        vscode.window.showErrorMessage(t('extension.remoteToolRequired'));

        return;
      }
    }

    return enqueueCompileRun('build', async () => {
      await ensurePostActivateBootstrapReady();

      try {
        if (!(await guardSupportedProjectTypeOrNotify())) {
          return;
        }

        currentExecutor = ProjectManager.getInstance()
          .getExecutor();

        const projectTypeInfo = await homeMethods.getProjectType();
        const projectType = projectTypeInfo.projectType;

        if (!(await runTritonDebugPreflight(projectType))) {
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const pythonContext = await preparePythonOperatorLaunchContext(projectType);

        if (pythonContext === null
          && (projectType === OperatorProjectType.PYASC
            || projectType === OperatorProjectType.TRITON)) {
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const operatorNames = await homeMethods.getSelectedOperators();
        const compileOption = await getCompileOptionForSelectedOperators();

        const built = await buildService.startBuild({
          scriptField: 'npu_debug_script',
          operatorNames: operatorNames || undefined,
          compileOption,
        });

        if (!built) {
          // Debug build failed or was preempted — do not launch msdebug against a missing binary.
          return;
        }

        // For standard custom operator projects, run buildExample before debug
        if (await isRootStandardCustom()) {
          const projectPath = ProjectManager.getInstance().projectPath;
          const project = projectPath ? getProjectByPath(projectPath) : null;

          if (projectPath && ConfigService.hasBuildExampleConfig()) {
            const exampleOp = projectPath ? (resolveOpRecord(projectPath, '')?.op_name ?? '') : '';
            const exampleBaseContext = resolveBuildExampleBaseContext(
              project?.project_path ?? '',
              operatorNames,
            );
            const exampleMode = resolveExampleModeForBaseContext(exampleBaseContext, operatorNames);

            if (!exampleMode.exampleFound && exampleMode.opName) {
              vscode.window.showWarningMessage(t('build.exampleNoSourceForOperator', { op: exampleMode.opName }));
            }

            const exampleBuildCommand = getBuildExampleCommand(
              exampleBaseContext,
              compileOption,
              operatorNames || undefined,
              exampleMode.mode,
              true,
            );

            const exampleBuildRes = await executeOperatorCommand(
              exampleBuildCommand,
              buildOperatorSpawnContext({
                baseContext: exampleBaseContext,
                projectPath: project?.project_path ?? '',
                operatorNames: operatorNames || undefined,
                script: exampleBuildCommand,
                toolOutputLabel: 'compile',
              }),
              {
                transformCommand: createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteBuildExampleCommand(
                  command,
                  project?.project_path,
                )),
              },
            );

            if (exampleBuildRes.code !== 0) {
              if (exampleBuildRes.interruptedByUserStop) {
                return;
              }

              vscode.window.showErrorMessage(t('build.executeFailed', { output: exampleBuildRes.output }));

              return;
            }
          }
        }

        await vscode.commands.executeCommand('workbench.debug.action.toggleRepl');

        const projectInfo = await homeMethods.getProjectType();
        const buildBehavior = OperatorPluginRegistry.getBuildBehaviorByProjectType(projectInfo.projectType);
        const localNpuAvailableFinal = await startNpuHardwareProbe();
        const isRemote = !localNpuAvailableFinal;

        let remoteAdapterPort: number | undefined;
        let remoteAdapterHost: string | undefined;

        if (isRemote) {
          if (!await ensureRemoteToolAvailable()) {
            return;
          }

          const remoteToolConfig = await getRemoteToolConfig();

          remoteAdapterHost = remoteToolConfig?.host?.trim();

          if (!remoteAdapterHost) {
            console.error('Remote tool config did not provide HOST for remote debug');
            vscode.window.showErrorMessage(t('task.remoteDebugAdapterStartFailed'));

            return;
          }

          try {
            const remoteAdapterCommand = buildRemoteExecCommand('cd /opt/msdebug-remote-adapter && node ./bin/msdebug-remote-adapter start');
            const executor = currentExecutor ?? ProjectManager.getInstance()
              .getExecutor();
            const adapterResult = await executor.executeDetached(
              remoteAdapterCommand,
              '"event":"ready"',
              [],
              {
                toolOutputLabel: 'tool',
                timeout: 30000,
              },
              true,
            );

            remoteAdapterPort = parseRemoteDebugAdapterReadyPort(adapterResult.output);

            if (remoteAdapterPort === undefined) {
              console.error('Remote debug adapter did not report a valid ready port:', adapterResult.output);
              vscode.window.showErrorMessage(t('task.remoteDebugAdapterStartFailed'));

              return;
            }

            console.log('Remote debug adapter started on port:', remoteAdapterPort);
          }
          catch (error) {
            console.error('Failed to start remote msdebug adapter:', error);
            vscode.window.showErrorMessage(t('task.remoteDebugAdapterStartFailed'));

            return;
          }
        }

        const debugConfigName = resolveDebugLaunchConfigName(
          projectInfo.projectType,
          'npu',
          buildBehavior,
          projectInfo.projectTemplateName,
          isRemote,
        );

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (workspaceFolder) {
          if (isRemote) {
            if (!remoteAdapterHost || remoteAdapterPort === undefined) {
              vscode.window.showErrorMessage(t('task.remoteDebugAdapterStartFailed'));

              return;
            }

            const remoteDebugConfigUpdated = await updateRemoteDebugConfig(workspaceFolder.uri.fsPath, {
              host: remoteAdapterHost,
              port: remoteAdapterPort,
            });

            if (!remoteDebugConfigUpdated) {
              vscode.window.showErrorMessage(t('task.remoteDebugAdapterStartFailed'));

              return;
            }
          }

          const canDebug = await patchLaunchJsonForDebugSession(
            workspaceFolder.uri.fsPath,
            debugConfigName,
            pythonContext,
            projectType ?? null,
            'npu',
          );

          if (!canDebug) {
            // Target binary is missing — the error was already surfaced; skip startDebugging.
            return;
          }

          await vscode.debug.startDebugging(workspaceFolder, debugConfigName);
        }
        else {
          await vscode.commands.executeCommand('workbench.action.debug.start');
        }
      }
      catch (error) {
        console.error('Error while opening NPU debug:', error);
        throw error;
      }
      finally {
        currentExecutor = null;
        ProjectManager.getInstance()
          .clearExecutor();
      }
    });
  },

  /**
   * NPU debugging configuration
   */
  async debugConfig(): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await vscode.commands.executeCommand('workbench.action.debug.configure');
      vscode.window.showInformationMessage(t('task.launchJsonOpened'));
    }
    catch (error) {
      console.error('Error while opening launch.json:', error);
      vscode.window.showErrorMessage(t('task.cannotOpenLaunchJson', { error: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  },

  /**
   * Run CPU debug
   */
  async runCpuDebug(): Promise<void> {
    if (!isMindStudioDebugExtensionActive()) {
      vscode.window.showErrorMessage(t('mindStudio.debugPluginInstalling'));

      return;
    }

    return enqueueCompileRun('build', async () => {
      await ensurePostActivateBootstrapReady();

      try {
        if (!(await guardSupportedProjectTypeOrNotify())) {
          return;
        }

        currentExecutor = ProjectManager.getInstance()
          .getExecutor();

        const projectTypeInfo = await homeMethods.getProjectType();
        const projectType = projectTypeInfo.projectType;

        if (projectType === OperatorProjectType.TRITON) {
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        if (!(await runTritonDebugPreflight(projectType))) {
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const pythonContext = await preparePythonOperatorLaunchContext(projectType);

        if (pythonContext === null
          && (projectType === OperatorProjectType.PYASC
            || projectType === OperatorProjectType.TRITON)) {
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const operatorNames = await homeMethods.getSelectedOperators();
        const compileOption = await getCompileOptionForSelectedOperators();

        const built = await buildService.startBuild({
          scriptField: 'cpu_debug_script',
          operatorNames: operatorNames || undefined,
          compileOption,
        });

        if (!built) {
          // Debug build failed or was preempted — do not launch msdebug against a missing binary.
          return;
        }

        // For standard custom operator projects, run buildExample before debug
        if (await isRootStandardCustom()) {
          const projectPath = ProjectManager.getInstance().projectPath;
          const project = projectPath ? getProjectByPath(projectPath) : null;

          if (projectPath && ConfigService.hasBuildExampleConfig()) {
            const exampleOp = projectPath ? (resolveOpRecord(projectPath, '')?.op_name ?? '') : '';
            const exampleBaseContext = resolveBuildExampleBaseContext(
              project?.project_path ?? '',
              operatorNames,
            );
            const exampleMode = resolveExampleModeForBaseContext(exampleBaseContext, operatorNames);

            if (!exampleMode.exampleFound && exampleMode.opName) {
              vscode.window.showWarningMessage(t('build.exampleNoSourceForOperator', { op: exampleMode.opName }));
            }

            const exampleBuildCommand = getBuildExampleCommand(
              exampleBaseContext,
              compileOption,
              operatorNames || undefined,
              exampleMode.mode,
              true,
            );

            const exampleBuildRes = await executeOperatorCommand(
              exampleBuildCommand,
              buildOperatorSpawnContext({
                baseContext: exampleBaseContext,
                projectPath: project?.project_path ?? '',
                operatorNames: operatorNames || undefined,
                script: exampleBuildCommand,
                toolOutputLabel: 'compile',
              }),
              {
                transformCommand: createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteBuildExampleCommand(
                  command,
                  project?.project_path,
                )),
              },
            );

            if (exampleBuildRes.code !== 0) {
              if (exampleBuildRes.interruptedByUserStop) {
                return;
              }

              vscode.window.showErrorMessage(t('build.executeFailed', { output: exampleBuildRes.output }));

              return;
            }
          }
        }

        await vscode.commands.executeCommand('workbench.debug.action.toggleRepl');

        const projectInfo = await homeMethods.getProjectType();
        const buildBehavior = OperatorPluginRegistry.getBuildBehaviorByProjectType(projectInfo.projectType);
        const debugConfigName = resolveDebugLaunchConfigName(
          projectInfo.projectType,
          'cpu',
          buildBehavior,
          projectInfo.projectTemplateName,
        );

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (workspaceFolder) {
          const canDebug = await patchLaunchJsonForDebugSession(
            workspaceFolder.uri.fsPath,
            debugConfigName,
            pythonContext,
            projectType ?? null,
            'cpu',
          );

          if (!canDebug) {
            // Target binary is missing — the error was already surfaced; skip startDebugging.
            return;
          }

          await vscode.debug.startDebugging(workspaceFolder, debugConfigName);
        }
        else {
          await vscode.commands.executeCommand('workbench.action.debug.start');
        }
      }
      catch (error) {
        console.error('Error while opening CPU debug:', error);
        throw error;
      }
      finally {
        currentExecutor = null;
        ProjectManager.getInstance()
          .clearExecutor();
      }
    });
  },

  /**
   * CPU debug configuration
   */
  async cpuDebugConfig(): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await vscode.commands.executeCommand('workbench.action.debug.configure');
      vscode.window.showInformationMessage(t('task.launchJsonOpened'));
    }
    catch (error) {
      console.error('Error while opening launch.json:', error);
      vscode.window.showErrorMessage(t('task.cannotOpenLaunchJson', { error: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  },
};
