/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import i18next, { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import i18nResource from '@shared/i18n';

import { WebviewProvider } from './class/webview-provider';
import { handleOperatorProjectDirectoryFile } from './class/webview-message-list';
import { CsvEditorProvider } from './class/csv-editor-provider';
import {
  ApiServer, type ApiGroup,
} from './core/api-server';
import { ViewServer } from './core/view/view-server';
import { routes } from './routes';
import { apis } from './api-routes';
import { homeMethods } from './controller/home-controller';
import { PermanentStorage } from './class/permanent-storage';
import { ExtensionConfig } from './core/extension-config';
import { RemoteConfig } from './helpers/remote-config';

import { OpsOperateProvider } from './class/ops-operate-provider';
import { getMsSanitizerPanelViewProvider } from './class/ms-sanitizer-panel-view';
import { getPerformancePanelViewProvider } from './class/performance-panel-view';
import { getDumpTensorPanelViewProvider } from './class/dump-tensor-panel-view';

import { MindStudioPluginInstaller } from './class/mind-studio-plugin-installer';
import { registerOperatorPlugins } from './domain/plugins';
import {
  COMMAND_OPEN,
  COMMAND_PROJECT_SH,
  COMMAND_WELCOME,
  COMMAND_CONFIG,
  COMMAND_CREATE_OPERATOR_IN_WORKSPACE,
  COMMAND_TOGGLE_OPS_OPERATE,
  COMMAND_CLEAR_WELCOME_COUNT,
  COMMAND_CLEAR_LAST_PROJECT_PATH,
  COMMAND_CREATE_DIRECTORY,
  COMMAND_GET_HOME,
  COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
  COMMAND_FLASH_DUMP_TENSOR_DATA,
  VIEW_HOME,
  VIEW_CONFIG,
  VIEW_LINK,
  VIEW_WELCOME,
  VIEW_PROJECT_SH,
  COMMAND_SIMULATOR_OPTIONS,
  VIEW_OPTIONS_SIMULATOR,
  COMMAND_ON_BOARD_OPTIONS,
  VIEW_OPTIONS_ON_BOARD,
  COMMAND_SANITIZER_OPTIONS,
  VIEW_OPTIONS_SANITIZER,
  COMMAND_OPEN_PROJECT,
  VIEW_OPEN_PROJECT,
  COMMAND_MARK_AS_OPERATOR_PROJECT,
  COMMAND_MARK_AS_MULTI_OPERATOR_PROJECT,
  COMMAND_UNMARK_AS_OPERATOR_PROJECT,
  COMMAND_UNMARK_AS_MULTI_OPERATOR_PROJECT,
  COMMAND_OPERATOR_PROJECT_BUILD,
  COMMAND_OPERATOR_PROJECT_RUN,
  COMMAND_OPERATOR_PROJECT_CPU_DEBUG,
  COMMAND_OPERATOR_PROJECT_NPU_DEBUG,
  COMMAND_OPERATOR_PROJECT_CPU_DEBUG_CONFIG,
  COMMAND_OPERATOR_PROJECT_NPU_DEBUG_CONFIG,
  COMMAND_OPERATOR_PROJECT_SANITIZER,
  COMMAND_OPERATOR_PROJECT_ON_BOARD,
  COMMAND_OPERATOR_PROJECT_SIMULATION,
  COMMAND_REPORT_VISUALIZATION_SANITIZER,
  COMMAND_REPORT_VISUALIZATION_ON_BOARD,
  COMMAND_REPORT_VISUALIZATION_SIMULATION,
  COMMAND_REPORT_VISUALIZATION_PERFORMANCE,
  COMMAND_REFRESH_FOLDER_DECORATIONS,
} from './constants';
import { FolderContextMenuService } from './service/folder-context-menu-service';
import { OperatorProjectIconTheme } from './class/operator-project-icon-theme';
import { welcomeMethods } from './controller/welcome-controller'

let extensionContext: vscode.ExtensionContext | undefined;

/**
 * Convert file URI to folder URI
 * If a folder URI is passed in, it will be returned directly.
 * If a file URI is passed in, the folder URI where the file is located is returned.
 */
function getFolderUri(uri: vscode.Uri): vscode.Uri {
  try {
    const stat = fs.statSync(uri.fsPath);
    if (stat.isDirectory()) {
      return uri;
    }
    // If it is a file, return the folder where the file is located
    return vscode.Uri.file(path.dirname(uri.fsPath));
  } catch {
    // If the file information cannot be obtained, assuming it is a file, return to the parent directory
    return vscode.Uri.file(path.dirname(uri.fsPath));
  }
}

/**
 * Check whether the .vscode/devtool_config.json file exists in the current workspace
 * @returns Returns true if the file exists, false otherwise
 */
async function checkDevtoolConfigExists(): Promise<boolean> {
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
  }
  catch (error) {
    console.error('Error while checking devtool_config.json file:', error);

    return false;
  }
}

/**
 * Close secondary sidebar
 */
const closeAuxiliaryBar = async () => {
  try {
    // Check if the secondary sidebar is visible and close it if visible
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    console.log('Auxiliary sidebar closed');
  }
  catch (error) {
    console.error('Error while closing auxiliary sidebar:', error);
  }
};

// Register resource selection change monitoring and dynamically update context variables
// Update context variables before command execution so menu display logic works correctly
const updateContextForUri = async (uri: vscode.Uri | undefined) => {
  if (!uri) {
    await vscode.commands.executeCommand('setContext', 'operatorProjectMarked', false);
    await vscode.commands.executeCommand('setContext', 'multiOperatorProjectMarked', false);
    await vscode.commands.executeCommand('setContext', 'operatorProjectType', '');
    return;
  }

  const checkResult = await FolderContextMenuService.checkIsOperatorProject(uri);
  
  await vscode.commands.executeCommand(
    'setContext',
    'operatorProjectMarked',
    checkResult.isOperatorProject && !checkResult.isMultiProject,
  );
  await vscode.commands.executeCommand(
    'setContext',
    'multiOperatorProjectMarked',
    checkResult.isMultiProject,
  );
  
  await vscode.commands.executeCommand(
    'setContext',
    'operatorProjectType',
    checkResult.projectType || '',
  );
};

/**
 * Plug-in activation entry function
 * @param context VSCode extended context
 */
export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  (
    globalThis as unknown as { extensionContext: vscode.ExtensionContext }
  ).extensionContext = context;

  // Register all operator-type plugins and project-type detectors.
  // Must be called before any code that uses OperatorPluginRegistry.
  registerOperatorPlugins();

  // api interface
  const apiServer = initApiServer();

  // Initialize the Webview of the configuration page
  const configProvider = new WebviewProvider(context, apiServer);

  // Register pluginSidebar webview provider and add to subscriptions
  const pluginSidebarDisposable = configProvider.showLeftPage(VIEW_HOME);

  context.subscriptions.push(pluginSidebarDisposable);

  // internationalization
  await initI18n();

  // Check if the devtool_config.json file exists
  const hasDevtoolConfig = await checkDevtoolConfigExists();

  console.log('Does file exist:', hasDevtoolConfig);
  // Set context to control command visibility
  await vscode.commands.executeCommand(
    'setContext',
    'hasDevtoolConfig',
    hasDevtoolConfig,
  );

  // view
  const viewServer = initViews(context, apiServer);

  ExtensionConfig.init(context);
  PermanentStorage.setInstance(context);

  // Initialize the Webview of the new operator project
  const createOpsProvider = new WebviewProvider(context, apiServer);

  // Initialize the Webview of the configuration page
  const configWelcomeProvider = new WebviewProvider(context, apiServer);

  // Initialize the Webview of the environment script configuration page
  const configProjectSHProvider = new WebviewProvider(context, apiServer);

  // Initialize and open the Webview of the operator project
  const openProjectProvider = new WebviewProvider(context, apiServer);

  // Register the new operator project command
  const openCommand = vscode.commands.registerCommand(
    COMMAND_OPEN,
    async () => {
      createOpsProvider.show(VIEW_LINK);
    },
  );

  // Register and open the operator project command
  const openProjectCommand = vscode.commands.registerCommand(
    COMMAND_OPEN_PROJECT,
    async () => {
      openProjectProvider.show(VIEW_OPEN_PROJECT);
    },
  );

  // Register the command to create a new operator project in the current directory
  const createOperatorInWorkspaceCommand = vscode.commands.registerCommand(
    COMMAND_CREATE_OPERATOR_IN_WORKSPACE,
    async (uri?: vscode.Uri) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(t('extension.openWorkspaceFirst'));
        return;
      }

      // If a uri is provided (right click on the file), use that path; otherwise use the workspace root
      const targetPath = uri ? uri.fsPath : workspaceFolders[0].uri.fsPath;

      await createOpsProvider.show(VIEW_LINK);
      // Wait for the webview to finish loading and send the path
      setTimeout(() => {
        createOpsProvider.postMessage({
          command: 'iframeSetProjectPath',
          data: targetPath,
        });
      }, 500);
    },
  );

  // Open environment variables command
  const openProjectSH = vscode.commands.registerCommand(
    COMMAND_PROJECT_SH,
    async () => {
      configProjectSHProvider.show(VIEW_PROJECT_SH);
    },
  );

  // Register open and close operator work-operation command
  const toggleOpsOperateCommand = vscode.commands.registerCommand(
    COMMAND_TOGGLE_OPS_OPERATE,
    async () => {
      try {
        // Open/close the auxiliary sidebar on the right
        await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
      }
      catch (error) {
        console.log(error);
      }
    },
  );

  // Register view
  const opsOperateProvider = new OpsOperateProvider(context, apiServer);
  const opsOperateView = vscode.window.registerWebviewViewProvider(
    OpsOperateProvider.viewType,
    opsOperateProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  context.subscriptions.push(opsOperateView);
  // Register command (register regardless of whether the file exists)
  context.subscriptions.push(toggleOpsOperateCommand);

  // Expand or close the sidebar based on whether the devtool_config.json file exists
  if (hasDevtoolConfig) {
    // Delay execution to ensure UI is ready
    setTimeout(async () => {
      try {
        console.log('File exists, executing expand: 123123123132');
        await vscode.commands.executeCommand('OpsOperateProvider.focus');
      }
      catch (error) {
        console.error('Error while focusing OpsOperateProvider view:', error);
      }
    }, 1000);
  }
  else {
    // If the file does not exist, close the sidebar
    setTimeout(async () => {
      await closeAuxiliaryBar();
    }, 500);
  }

  // Register the command to open the project configuration page
  const ConfigCommand = vscode.commands.registerCommand(
    COMMAND_CONFIG,
    async () => {
      configProvider.show(VIEW_CONFIG);
    },
  );

  // Register to open the welcome page command
  const welcomeCommand = vscode.commands.registerCommand(
    COMMAND_WELCOME,
    async () => {
      configWelcomeProvider.show(VIEW_WELCOME);
    },
  );

  // Register delete welcome page count command (for manual reset)
  const clearWelcomeCountCommand = vscode.commands.registerCommand(
    COMMAND_CLEAR_WELCOME_COUNT,
    async () => {
      await context.globalState.update('welcomeShowCount', undefined);
      console.log('welcomeShowCount deleted');
    },
  );

  // Register the operator project location command to clear the cache
  const clearLastProjectPathCommand = vscode.commands.registerCommand(
    COMMAND_CLEAR_LAST_PROJECT_PATH,
    async () => {
      RemoteConfig.clearLastProjectPath();
      vscode.window.showInformationMessage(t('extension.clearedProjectPath'));
    },
  );

  // Register the command to create an operator project, and the callback function will be executed.
  const createOptionsCommand = vscode.commands.registerCommand(
    COMMAND_CREATE_DIRECTORY,
    async (
      data: { createOperatorProjectDirectoryFileType: number },
      progress: vscode.Progress<{ message?: string;
        increment?: number }>,
    ) => {
      await handleOperatorProjectDirectoryFile(
        data,
        createOpsProvider,
        progress,
      );
    },
  );

  // Get home
  const getHome = vscode.commands.registerCommand(
    COMMAND_GET_HOME,
    async (_data: unknown) => {
      return process.env.HOME;
    },
  );

  const [workspaceFolder] = vscode.workspace.workspaceFolders ?? [];

  console.log(workspaceFolder, 'Is a folder open');

  // The welcome page will only pop up when no project/folder is open, and the number of times will be recorded in the local cache, with a maximum of two pop-ups.
  if (!workspaceFolder) {
    const welcomeShowCount =
      context.globalState.get<number>('welcomeShowCount') ?? 0;

    console.log(welcomeShowCount, 'Open count');

    if (welcomeShowCount < 2) {
      vscode.commands.executeCommand(COMMAND_WELCOME);
      vscode.commands.executeCommand('workbench.view.extension.mindstudio-opssuite-vscode-plugin');
      context.globalState.update('welcomeShowCount', welcomeShowCount + 1);
    }
  }

  // Anomaly detection view (the report list has been moved to the left side of the panel, and the corresponding report detection results are displayed on the right side)
  const {
    openMsSanitizerDisposable,
    msSanitizerPanelView,
    getMsSanitizerPanelWebview,
  } = getMsSanitizerPanelViewProvider(context, apiServer);
  context.subscriptions.push(msSanitizerPanelView, openMsSanitizerDisposable);

  // Performance tuning view (middle panel)
  const {
    performancePanelView,
    openPerformanceDisposable,
    getWebview: getPerformancePanelWebview,
  } = getPerformancePanelViewProvider(context, apiServer);
  context.subscriptions.push(performancePanelView, openPerformanceDisposable);

  // DumpTensor data view (middle panel)
  const {
    dumpTensorPanelView,
    openDumpTensorDisposable,
    getWebview: getDumpTensorPanelWebview,
  } = getDumpTensorPanelViewProvider(context, apiServer);
  context.subscriptions.push(dumpTensorPanelView, openDumpTensorDisposable);

  // Simulation analysis — select collection content (pyasc .py check before opening config)
  const simulatorOptionsProvider = new WebviewProvider(context, apiServer);
  const simulatorOptionsCommand = vscode.commands.registerCommand(
    COMMAND_SIMULATOR_OPTIONS,
    async () => {
      const pyascCheck = await homeMethods.validatePyascForAnalysis();
      if (!pyascCheck.valid) {
        vscode.window.showWarningMessage(pyascCheck.message ?? t('extension.openPyFirst'));
        return;
      }
      simulatorOptionsProvider.show(VIEW_OPTIONS_SIMULATOR);
    },
  );

  // Initialize the Webview of the 'Onboard Analysis-Select Collected Content' page (do pyasc.py verification before opening the configuration page)
  const onBoardOptionsProvider = new WebviewProvider(context, apiServer);
  const onBoardOptionsCommand = vscode.commands.registerCommand(
    COMMAND_ON_BOARD_OPTIONS,
    async () => {
      const pyascCheck = await homeMethods.validatePyascForAnalysis();
      if (!pyascCheck.valid) {
        vscode.window.showWarningMessage(pyascCheck.message ?? t('extension.openPyFirst'));
        return;
      }
      onBoardOptionsProvider.show(VIEW_OPTIONS_ON_BOARD);
    },
  );

  // Initialize the Webview of the 'Anomaly Detection-Select Detection Content' page
  const sanitizerOptionsProvider = new WebviewProvider(context, apiServer);
  const sanitizerOptionsCommand = vscode.commands.registerCommand(
    COMMAND_SANITIZER_OPTIONS,
    async () => {
      sanitizerOptionsProvider.show(VIEW_OPTIONS_SANITIZER);
    },
  );

  // Subscription to destruction event
  context.subscriptions.push(apiServer);
  context.subscriptions.push(viewServer);
  context.subscriptions.push(createOptionsCommand);
  context.subscriptions.push(openCommand);
  context.subscriptions.push(openProjectCommand);
  context.subscriptions.push(openProjectSH);
  context.subscriptions.push(ConfigCommand);
  context.subscriptions.push(welcomeCommand);
  context.subscriptions.push(clearWelcomeCountCommand);
  context.subscriptions.push(clearLastProjectPathCommand);
  // Note: createOptionsCommand has been added above, do not add it again
  context.subscriptions.push(getHome);
  context.subscriptions.push(createOperatorInWorkspaceCommand);
  context.subscriptions.push(simulatorOptionsCommand);
  context.subscriptions.push(onBoardOptionsCommand);
  context.subscriptions.push(sanitizerOptionsCommand);

  // Initialize folder decoration provider
  const iconTheme = OperatorProjectIconTheme.getInstance(context);

  // Register a command to refresh folder decorations
  const refreshDecorationsCommand = vscode.commands.registerCommand(
    COMMAND_REFRESH_FOLDER_DECORATIONS,
    () => {
      iconTheme.fireDecorationUpdate();
      vscode.window.showInformationMessage(t('extension.folderDecorationsRefreshed'));
    },
  );
  context.subscriptions.push(refreshDecorationsCommand);

  // Note: Do not automatically detect and mark the operator project collection when the plug-in is activated.
  // Automatic detection only occurs when the user explicitly opens the project (link-controller.ts)

  // Register folder right-click menu command
  const markAsOperatorProjectCommand = vscode.commands.registerCommand(
    COMMAND_MARK_AS_OPERATOR_PROJECT,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolder'));
        return;
      }
      await FolderContextMenuService.markAsOperatorProject(uri);

      // Trigger decoration update after the operation is completed (refresh the involved URI first, then refresh in full to ensure Explorer is redrawn)
      iconTheme.fireDecorationUpdate(uri);
      iconTheme.fireDecorationUpdate();

      await updateContextForUri(uri);
    },
  );

  const markAsMultiOperatorProjectCommand = vscode.commands.registerCommand(
    COMMAND_MARK_AS_MULTI_OPERATOR_PROJECT,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolder'));
        return;
      }
      await FolderContextMenuService.markAsMultiOperatorProject(uri);

      iconTheme.fireDecorationUpdate(uri);
      iconTheme.fireDecorationUpdate();

      await updateContextForUri(uri);
    },
  );

  const unmarkAsOperatorProjectCommand = vscode.commands.registerCommand(
    COMMAND_UNMARK_AS_OPERATOR_PROJECT,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolder'));
        return;
      }
      await FolderContextMenuService.unmarkAsOperatorProject(uri);

      iconTheme.fireDecorationUpdate(uri);
      iconTheme.fireDecorationUpdate();

      await updateContextForUri(uri);
    },
  );

  const unmarkAsMultiOperatorProjectCommand = vscode.commands.registerCommand(
    COMMAND_UNMARK_AS_MULTI_OPERATOR_PROJECT,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolder'));
        return;
      }
      await FolderContextMenuService.unmarkAsMultiOperatorProject(uri);

      iconTheme.fireDecorationUpdate(uri);
      iconTheme.fireDecorationUpdate();

      await updateContextForUri(uri);
    },
  );

  const operatorProjectBuildCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_BUILD,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      await FolderContextMenuService.buildOperatorProject(uri);
    },
  );

  const operatorProjectRunCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_RUN,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      await FolderContextMenuService.runOperatorProject(uri);
    },
  );

  const operatorProjectCpuDebugCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_CPU_DEBUG,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.cpuDebugOperatorProject(folderUri);
    },
  );

  const operatorProjectNpuDebugCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_NPU_DEBUG,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.npuDebugOperatorProject(folderUri);
    },
  );

  const operatorProjectCpuDebugConfigCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_CPU_DEBUG_CONFIG,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.cpuDebugConfigOperatorProject(folderUri);
    },
  );

  const operatorProjectNpuDebugConfigCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_NPU_DEBUG_CONFIG,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.npuDebugConfigOperatorProject(folderUri);
    },
  );

  const operatorProjectSanitizerCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_SANITIZER,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.sanitizerOperatorProject(folderUri);
    },
  );

  const operatorProjectOnBoardCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_ON_BOARD,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.onBoardOperatorProject(folderUri);
    },
  );

  const operatorProjectSimulationCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_SIMULATION,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.simulationOperatorProject(folderUri);
    },
  );

  // Reporting Visualization: Anomaly Detection
  const reportVisualizationSanitizerCommand = vscode.commands.registerCommand(
    COMMAND_REPORT_VISUALIZATION_SANITIZER,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFile'));
        return;
      }
      await FolderContextMenuService.addReportToFileMapList(uri, 'sanitizer');
    },
  );

  // Report visualization: On-board analysis
  const reportVisualizationOnBoardCommand = vscode.commands.registerCommand(
    COMMAND_REPORT_VISUALIZATION_ON_BOARD,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      await FolderContextMenuService.addReportToFileMapList(uri, 'on_board');
    },
  );

  // Report visualization: simulation analysis
  const reportVisualizationSimulationCommand = vscode.commands.registerCommand(
    COMMAND_REPORT_VISUALIZATION_SIMULATION,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      await FolderContextMenuService.addReportToFileMapList(uri, 'simulate');
    },
  );

  // Report visualization: performance tuning visual view (reusing on-board analysis logic)
  const reportVisualizationPerformanceCommand = vscode.commands.registerCommand(
    COMMAND_REPORT_VISUALIZATION_PERFORMANCE,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(t('extension.rightClickFolderOrFile'));
        return;
      }
      await FolderContextMenuService.addReportToFileMapList(uri, 'on_board');
    },
  );

  context.subscriptions.push(
    markAsOperatorProjectCommand,
    markAsMultiOperatorProjectCommand,
    unmarkAsOperatorProjectCommand,
    unmarkAsMultiOperatorProjectCommand,
    operatorProjectBuildCommand,
    operatorProjectRunCommand,
    operatorProjectCpuDebugCommand,
    operatorProjectNpuDebugCommand,
    operatorProjectCpuDebugConfigCommand,
    operatorProjectNpuDebugConfigCommand,
    operatorProjectSanitizerCommand,
    operatorProjectOnBoardCommand,
    operatorProjectSimulationCommand,
    reportVisualizationSanitizerCommand,
    reportVisualizationOnBoardCommand,
    reportVisualizationSimulationCommand,
    reportVisualizationPerformanceCommand,
  );

  // Initialize context variables
  await vscode.commands.executeCommand('setContext', 'operatorProjectMarked', false);
  await vscode.commands.executeCommand('setContext', 'multiOperatorProjectMarked', false);
  await vscode.commands.executeCommand('setContext', 'operatorProjectType', '');

  // Note: Due to VSCode API limitations, context variables cannot be updated before the menu is displayed.
  // The menu's when condition is evaluated when the menu is displayed, at which point the context variables may not be up to date.
  // Solution: Check the status when the command is executed, and return silently if it is not of the corresponding type.
  // In this way, even if the menu is displayed, no wrong operation will be performed.

  // Monitor resource manager selection changes and dynamically update context variables
  // Note: VSCode does not have a direct API to listen for resource manager selection changes
  // We do this by updating the context variables before the command is executed
  // But a better way is to use onDidChangeTreeData or other ways

  // Register a CSV editor provider
  const csvEditorProvider = new CsvEditorProvider();
  const csvEditorRegistration = vscode.window.registerCustomEditorProvider(
    CsvEditorProvider.viewType,
    csvEditorProvider,
    {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    },
  );

  context.subscriptions.push(csvEditorRegistration);

  // Register a command to open a CSV file
  const openCsvCommand = vscode.commands.registerCommand(
    'csv-viewer.openCsv',
    async () => {
      // Way 1: Let the user select the file
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: t('common.open'),
        filters: {
          [t('common.csvFile')]: ['csv'],
          [t('common.allFiles')]: ['*'],
        },
      });

      if (fileUri && fileUri[0]) {
        // Open the file using a custom editor
        await vscode.commands.executeCommand(
          'vscode.openWith',
          fileUri[0],
          CsvEditorProvider.viewType,
        );
      }
    },
  );
  context.subscriptions.push(openCsvCommand);

  const flashMsSanitizerRunData = vscode.commands.registerCommand(
    COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
    async () => {
      // The report list has been moved to the left side of the anomaly detection panel, and a refresh command is issued to the panel.
      const webview = getMsSanitizerPanelWebview();
      webview?.postMessage({ command: 'iframeFlashMsSanitizerRunData' });
    },
  );
  context.subscriptions.push(flashMsSanitizerRunData);

  const flashPerformanceRunData = vscode.commands.registerCommand(
    COMMAND_FLASH_PERFORMANCE_RUN_DATA,
    async () => {
      // Get the webview of the performance tuning panel and proactively issue a refresh command
      const webview = getPerformancePanelWebview();
      webview?.postMessage({ command: 'iframeRefreshData' });
    },
  );
  context.subscriptions.push(flashPerformanceRunData);

  const flashDumpTensorData = vscode.commands.registerCommand(
    COMMAND_FLASH_DUMP_TENSOR_DATA,
    async () => {
      const webview = getDumpTensorPanelWebview();
      if (webview) {
        webview.postMessage({ command: 'dumpTensorRefreshData' });
      } else {
        console.log('[flashDumpTensorData] Webview not available, skipping refresh');
      }
    },
  );
  context.subscriptions.push(flashDumpTensorData);

  const importDumpTensorBinFileCommand = vscode.commands.registerCommand(
    'huawei-op-devtools.importDumpTensorBinFile',
    async (uri) => {
      try {
        if (uri && uri.fsPath) {
          const { buildService } = await import('./service/build-service.js');
          await buildService.importDumpTensorBinFile(uri.fsPath);
        }
      } catch (error) {
        console.error('Failed to import DumpTensor .bin file:', error);
        vscode.window.showErrorMessage(t('extension.importDumpTensorBinFailed'));
      }
    },
  );
  context.subscriptions.push(importDumpTensorBinFileCommand);

  // Workspace folder change listener
  const watchWorkSpaceFolderChange =
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      console.log('Workspace changed', vscode.workspace.workspaceFolders)
      vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_DUMP_TENSOR_DATA);
      
      // Detect operator projects in the workspace
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const { WorkspaceDetectorService } = await import('./service/workspace-detector-service.js');
        
        for (const folder of workspaceFolders) {
          await WorkspaceDetectorService.detectAndRegisterWorkspace(folder.uri.fsPath).catch((error) => {
            console.error('Failed to detect workspace operator project:', error);
          });
        }
      }
    });

  context.subscriptions.push(watchWorkSpaceFolderChange);

  // Detect current workspace when plugin is activated
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    // Delay execution to ensure the plugin is fully initialized
    setTimeout(async () => {
      welcomeMethods.openProject({ projectPath: vscode.workspace.workspaceFolders![0].uri.fsPath }, true)
    }, 2000);
  }

  console.log('Activate', vscode.workspace.workspaceFolders);
  console.log('🧠 MindStudio plugin loader activated.');
  const installer = new MindStudioPluginInstaller(context, {
    pluginId: 'ascend.mindstudio-debug-vscode-plugin',
    vsixRelativePath:
      './out/plugin/mindstudio-debug-vscode-plugin/MindStudio-Debug-VSCode-Plugin-1.0.8.vsix',
    pluginVersion: '1.0.8',
  });

  await installer.installIfNeeded();
  console.log('Executed', context);
}

/**
 * internationalization
 */
async function initI18n() {
  await i18next.init({
    resources: i18nResource,
    lng: vscode.env.language.toLowerCase(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

/**
 * interface
 */
function initApiServer() {
  return new ApiServer(apis as ApiGroup);
}

/**
 * view
 * @param context extended context
 * @param apiServer api service
 */
function initViews(
  context: vscode.ExtensionContext,
  apiServer: ApiServer,
): ViewServer {
  const viewServer = new ViewServer(routes, context);

  viewServer.onViewActivated((path, webview) => {
    apiServer.addWebview(path, webview);
  });
  viewServer.onViewDisposed((path) => {
    apiServer.removeWebview(path);
  });

  return viewServer;
}

export function deactivate() {
  if (extensionContext) {
    // Clear welcome page popup count when uninstalling/disabling extensions
    extensionContext.globalState.update('welcomeShowCount', undefined);
  }
}
