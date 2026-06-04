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
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';

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
      // Save the current executor reference for possible termination operations
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      // For the pyasc type, check if a .py file is currently open and update the configuration
      const projectTypeInfo = await homeMethods.getProjectType();
      const isPythonOperator = projectTypeInfo.projectType === OperatorProjectType.PYASC
        || projectTypeInfo.projectType === OperatorProjectType.TRITON;

      if (isPythonOperator) {
        // Check if a .py file is currently open
        const activeEditor = vscode.window.activeTextEditor;
        const isPyFile = activeEditor?.document.fileName.endsWith('.py');

        if (!isPyFile) {
          vscode.window.showWarningMessage(t('task.openPyFirst'));
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showWarningMessage(t('task.workspacePathNotFound'));
          // clear status
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const filePath = activeEditor!.document.uri.fsPath;

        // Calculate relative paths
        const relativePath = path.relative(workspacePath, filePath)
          .replace(/\\/g, '/');

        // Get build_op configuration and update target_file
        const buildConfigId = await buildService.getBuildConfigId();

        if (buildConfigId) {
          // Get project ID
          const projectIdStr = ProjectManager.getInstance().projectId;

          if (projectIdStr) {
            const deployTarget = `python3 ${relativePath}`;
            await ConfigService.writeBuildOpDeployTarget(deployTarget);
          }
        }
      }

      const operatorNames = await homeMethods.getSelectedOperators();
      const compileOption = await getCompileOptionForSelectedOperators();

      // Compile before debugging, use the --debug parameter
      await buildService.startBuild({
        scriptField: 'npu_debug_script',
        operatorNames: operatorNames || undefined,
        compileOption,
      });
      await vscode.commands.executeCommand('workbench.debug.action.toggleRepl');

      // Get the project type and template name to determine whether to use msdebug-python
      const projectInfo = await homeMethods.getProjectType();
      const usePythonDebug = projectInfo.projectType === 'ascend' && projectInfo.projectTemplateName === 'torch_library_template';

      // Start debug configuration
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (workspaceFolder) {
        const debugConfigName = usePythonDebug ? 'msdebug-python' : 'msdebug';

        if (!usePythonDebug) {
          // Auto-adapt the msdebug target to the actual built binary (#17), so
          // the user no longer has to hand-edit launch.json. Best-effort: never
          // throws, never clobbers a valid user-set target.
          try {
            await updateMsdebugTarget(workspaceFolder.uri.fsPath, operatorNames ?? undefined);
          }
          catch (e) {
            console.warn('updateMsdebugTarget failed (continuing):', e);
          }
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
      // Clear executor reference and task type
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
      // Save the current executor reference for possible termination operations
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      // For the pyasc type, check if a .py file is currently open and update the configuration
      const projectTypeInfo = await homeMethods.getProjectType();
      const isPythonOperator = projectTypeInfo.projectType === OperatorProjectType.PYASC
        || projectTypeInfo.projectType === OperatorProjectType.TRITON;

      if (isPythonOperator) {
        // Check if a .py file is currently open
        const activeEditor = vscode.window.activeTextEditor;
        const isPyFile = activeEditor?.document.fileName.endsWith('.py');

        if (!isPyFile) {
          vscode.window.showWarningMessage(t('task.openPyFirst'));
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showWarningMessage(t('task.workspacePathNotFound'));
          // clear status
          currentExecutor = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const filePath = activeEditor!.document.uri.fsPath;

        // Calculate relative paths
        const relativePath = path.relative(workspacePath, filePath)
          .replace(/\\/g, '/');

        // Get build_op configuration and update target_file
        const buildConfigId = await buildService.getBuildConfigId();

        if (buildConfigId) {
          // Get project ID
          const projectIdStr = ProjectManager.getInstance().projectId;

          if (projectIdStr) {
            const deployTarget = `python3 ${relativePath}`;
            await ConfigService.writeBuildOpDeployTarget(deployTarget);
          }
        }
      }

      const operatorNames = await homeMethods.getSelectedOperators();
      const compileOption = await getCompileOptionForSelectedOperators();

      // Compile before CPU debugging, use the --simulator parameter
      await buildService.startBuild({
        scriptField: 'cpu_debug_script',
        operatorNames: operatorNames || undefined,
        compileOption,
      });
      await vscode.commands.executeCommand('workbench.debug.action.toggleRepl');

      // Get the project type and template name to determine whether to use msdebug-python
      const projectInfo = await homeMethods.getProjectType();
      const usePythonDebug = projectInfo.projectType === 'ascend' && projectInfo.projectTemplateName === 'torch_library_template';

      // Start debug configuration
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (workspaceFolder) {
        const debugConfigName = usePythonDebug ? 'msdebug-python' : 'msdebug-cpu';

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
      // Clear executor reference and task type
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
