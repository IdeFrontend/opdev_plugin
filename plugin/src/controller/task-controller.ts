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
  StartDumpTensorParams,
  StartUtTestParams,
} from '@shared/api-types';
import {
  getConfig, postConfig,
} from '@plugin/domain';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { getCompileOptionForSelectedOperators } from '@plugin/helpers/compile-options';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';

// Global task manager: used to track and terminate executing tasks
let currentExecutor: CommandExecutor | null = null;
// Current task name mapping (key -> i18n key)
const taskNameKeyMap: Record<string, string> = {
  'build': 'task.taskName.build',
  'runExample': 'task.taskName.runExample',
  'sanitizer': 'task.taskName.sanitizer',
  'onboard': 'task.taskName.onboard',
  'simulation': 'task.taskName.simulation',
  'buildAndCpuDebug': 'task.taskName.buildAndCpuDebug',
  'buildAndDebug': 'task.taskName.buildAndDebug',
  'dumpTensor': 'task.taskName.dumpTensor',
  'utTest': 'task.taskName.utTest',
};


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

/** Currently running task type (maps to taskNameKeyMap keys). */
let currentTaskType: string | null = null;

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
      currentTaskType = 'build';
      await buildService.startBuild(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      currentTaskType = null;
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
      currentTaskType = 'runExample';
      await buildService.startRun(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      currentTaskType = null;
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
      currentTaskType = 'build';
      await buildService.startBuildExample(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      currentTaskType = null;
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
      currentTaskType = 'simulation';
      await buildService.startSimulate(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      currentTaskType = null;
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
      currentTaskType = 'onboard';
      await buildService.startOnBoard(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      currentTaskType = null;
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
      currentTaskType = 'sanitizer';
      await sanitizerService.runSanitizer(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      currentTaskType = null;
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
      currentTaskType = 'dumpTensor';
      await buildService.startDumpTensor(params);
    }
    finally {
      // Clear executor reference
      currentExecutor = null;
      currentTaskType = null;
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
      currentTaskType = 'utTest';
      await buildService.startUtTest(params);
    }
    finally {
      currentExecutor = null;
      currentTaskType = null;
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
   * Build operator (webview compatible)
   */
  async buildOp(): Promise<void> {
    return this.startBuild();
  },

  /**
   * Build example (webview compatible)
   */
  async buildExample(): Promise<void> {
    return this.startBuildExample();
  },

  /**
   * Run the example (webview compatible)
   */
  async runExample(): Promise<void> {
    return this.startRun();
  },

  /**
   * Simulation analysis (webview compatible)
   */
  async simulate(): Promise<void> {
    return this.startSimulate();
  },

  /**
   * On-board analysis (webview compatible)
   */
  async onBoard(): Promise<void> {
    return this.startOnBoard();
  },

  /**
   * Check task execution status
   * @returns whether there is a task running
   */
  async checkTaskStatus(): Promise<boolean> {
    return currentExecutor !== null;
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
      currentTaskType = null;
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
   * Get the current task name
   * @returns current task name, or null if there is no task
   */
  async getCurrentTaskName(): Promise<string | null> {
    if (currentTaskType && taskNameKeyMap[currentTaskType]) {
      return t(taskNameKeyMap[currentTaskType]);
    }

    return null;
  },

  /**
   * Show confirmation dialog
   * @param params dialog parameters
   * @returns the result of user selection, 'stop and execute' or undefined (cancel)
   */
  async showConfirmDialog(params: {
    title: string;
    content: string;
    confirmText: string;
    cancelText: string;
  }): Promise<string | undefined> {
    // VSCode's showWarningMessage does not support a separate title and displays the title and content together.
    const message = `${params.title}\n${params.content}`;
    // Use modal: true to keep the modal but only provide a "stop and execute" button
    // VSCode will automatically add a close button (X), the user can cancel by closing the dialog box or pressing ESC
    // In this way, there is only one way to cancel (the close button), and there will not be two cancel buttons.
    const result = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      params.confirmText,
    );

    // Return the results selected by the user:
    // - If the user clicks the "Stop and Execute" button, return confirmText
    // - If the user clicks the close button (X) or presses ESC, returns undefined (equivalent to cancel)
    return result;
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
      // Set current task type
      currentTaskType = 'buildAndDebug';

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
          currentTaskType = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showWarningMessage(t('task.workspacePathNotFound'));
          // clear status
          currentExecutor = null;
          currentTaskType = null;
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
            const projectId = Number(projectIdStr);
            // Get build_op configuration
            const configs = await getConfig(projectId, 'build_op');
            const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

            if (buildOpConfig) {
              // Update configured target_file
              const updatedConfig = {
                config_id: buildConfigId,
                config_type: 'build_op',
                user_options: {
                  ...buildOpConfig.user_options,
                  target_file: `python3 ${relativePath}`,
                },
              };

              // Save configuration
              await postConfig('build_op', [updatedConfig]);
            }
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
      currentTaskType = null;
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
      // Set current task type
      currentTaskType = 'buildAndCpuDebug';

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
          currentTaskType = null;
          ProjectManager.getInstance()
            .clearExecutor();

          return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showWarningMessage(t('task.workspacePathNotFound'));
          // clear status
          currentExecutor = null;
          currentTaskType = null;
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
            const projectId = Number(projectIdStr);
            // Get build_op configuration
            const configs = await getConfig(projectId, 'build_op');
            const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

            if (buildOpConfig) {
              // Update configured target_file
              const updatedConfig = {
                config_id: buildConfigId,
                config_type: 'build_op',
                user_options: {
                  ...buildOpConfig.user_options,
                  target_file: `python3 ${relativePath}`,
                },
              };

              // Save configuration
              await postConfig('build_op', [updatedConfig]);
            }
          }
        }
      }

      // Compile before CPU debugging, use the --simulator parameter
      await buildService.startBuild({ scriptField: 'cpu_debug_script' });
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
      currentTaskType = null;
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
