import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';

import { CommandExecutor } from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { buildService } from '@plugin/service/build-service';
import { sanitizerService } from '@plugin/service/sanitizer-service';
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
import { updateMsdebugTarget } from '@plugin/domain/utils/debug-target';
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
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import { resolveOrPickPythonOperatorUri } from '@plugin/helpers/python-operator-editor-context';

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

async function preparePythonOperatorLaunchContext(projectType: string | null): Promise<PythonOperatorLaunchContext | null> {
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
  const relativePath = path.relative(workspacePath, filePath)
    .replace(/\\/g, '/');
  const buildConfigId = await buildService.getBuildConfigId();

  if (buildConfigId) {
    const projectIdStr = ProjectManager.getInstance().projectId;

    if (projectIdStr) {
      const deployTarget = buildPythonDeployTarget(relativePath);

      await ConfigService.writeBuildOpDeployTarget(deployTarget);
    }
  }

  return {
    operatorCwd: path.dirname(filePath),
    scriptArg: `./${path.basename(filePath)}`,
  };
}

async function patchLaunchJsonForDebugSession(
  workspaceRoot: string,
  debugConfigName: string,
  pythonContext: PythonOperatorLaunchContext | null,
  projectType: string | null,
  mode: 'cpu' | 'npu',
  selectedOperator?: { name: string;
    path: string },
): Promise<void> {
  if (!isPythonDebugLaunchConfig(debugConfigName) || !pythonContext) {
    if (!isPythonDebugLaunchConfig(debugConfigName)) {
      try {
        await updateMsdebugTarget(workspaceRoot, selectedOperator);
      }
      catch (e) {
        console.warn('updateMsdebugTarget failed (continuing):', e);
      }
    }

    return;
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
}

export const taskMethods = {
  /**
   * Build operator
   */
  async startBuild(params: StartBuildParams = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await ProjectManager.getInstance()
        .initProject();
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
  },

  /**
   * Run operator
   */
  async startRun(params: StartRunParams = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await ProjectManager.getInstance()
        .initProject();
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
  },

  /**
   * Build example
   */
  async startBuildExample(params: StartBuildExampleParams = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await ProjectManager.getInstance()
        .initProject();
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
  },

  /**
   * Simulation analysis
   */
  async startSimulate(params: StartSimulateParams = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await ProjectManager.getInstance()
        .initProject();
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
      await ProjectManager.getInstance()
        .initProject();
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
      await ProjectManager.getInstance()
        .initProject();
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
  async startDumpTensor(params: { operatorNames?: string,
    compileOption?: string } = {}): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await ProjectManager.getInstance()
        .initProject();
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
      await ProjectManager.getInstance()
        .initProject();
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
   * Import DumpTensor .bin file
   */
  async importDumpTensorBinFile(params: { binFilePath: string }): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      await ProjectManager.getInstance()
        .initProject();
      await buildService.importDumpTensorBinFile(params.binFilePath);
    }
    finally {
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * Stop task
   */
  async stopTask(): Promise<void> {
    console.log('[stopTask] Received stop task request');

    if (currentExecutor) {
      console.log('[stopTask] Terminating running task');
      await currentExecutor.kill();
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
      vscode.window.showWarningMessage(t('task.stoppedByUser'));
    }
    else {
      console.log('[stopTask] No running task');
      vscode.window.showInformationMessage(t('task.noRunningTask'));
    }
  },

  /**
   * Run NPU debug
   */
  async runDebug(): Promise<void> {
    await ensurePostActivateBootstrapReady();

    try {
      if (!(await guardSupportedProjectTypeOrNotify())) {
        return;
      }

      await ProjectManager.getInstance()
        .initProject();
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

      await buildService.startBuild({
        scriptField: 'npu_debug_script',
        operatorNames: operatorNames || undefined,
        compileOption,
      });
      await vscode.commands.executeCommand('workbench.debug.action.toggleRepl');

      const projectInfo = await homeMethods.getProjectType();
      const buildBehavior = OperatorPluginRegistry.getBuildBehaviorByProjectType(projectInfo.projectType);
      const debugConfigName = resolveDebugLaunchConfigName(
        projectInfo.projectType,
        'npu',
        buildBehavior,
        projectInfo.projectTemplateName,
      );

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (workspaceFolder) {
        const [selectedOperator] = await homeMethods.getSelectedOperatorEntries();

        await patchLaunchJsonForDebugSession(
          workspaceFolder.uri.fsPath,
          debugConfigName,
          pythonContext,
          projectType ?? null,
          'npu',
          selectedOperator,
        );

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
    await ensurePostActivateBootstrapReady();

    try {
      if (!(await guardSupportedProjectTypeOrNotify())) {
        return;
      }

      await ProjectManager.getInstance()
        .initProject();
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

      await buildService.startBuild({
        scriptField: 'cpu_debug_script',
        operatorNames: operatorNames || undefined,
        compileOption,
      });
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
        const [selectedOperator] = await homeMethods.getSelectedOperatorEntries();

        await patchLaunchJsonForDebugSession(
          workspaceFolder.uri.fsPath,
          debugConfigName,
          pythonContext,
          projectType ?? null,
          'cpu',
          selectedOperator,
        );

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
