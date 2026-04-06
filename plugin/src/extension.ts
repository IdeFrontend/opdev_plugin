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
import { HomeTreeProvider } from './class/home-tree-provider';
import { OperateTreeProvider } from './class/operate-tree-provider';
import {
  ApiServer, type ApiGroup,
} from './core/api-server';
import { ViewServer } from './core/view/view-server';
import { routes } from './routes';
import { apis } from './api-routes';
import { homeMethods } from './controller/home-controller';
import { taskMethods } from './controller/task-controller';
import { configMethods } from './controller/config-controller';
import { PermanentStorage } from './class/permanent-storage';
import { ExtensionConfig } from './core/extension-config';
import { RemoteConfig } from './helpers/remote-config';
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
  VIEW_CONFIG,
  VIEW_LINK,
  VIEW_WELCOME,
  VIEW_PROJECT_SH,
  COMMAND_SIMULATOR_OPTIONS,
  COMMAND_ON_BOARD_OPTIONS,
  COMMAND_SANITIZER_OPTIONS,
  VIEW_OPTIONS_SANITIZER,
  VIEW_OPTIONS_SIMULATOR,
  VIEW_OPTIONS_ON_BOARD,
  COMMAND_OPEN_PROJECT,
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
  COMMAND_SIDEBAR_PROJECT_CONFIG,
  COMMAND_SIDEBAR_BUILD,
  COMMAND_SIDEBAR_RUN,
  COMMAND_SIDEBAR_CPU_DEBUG,
  COMMAND_SIDEBAR_NPU_DEBUG,
  COMMAND_SIDEBAR_SANITIZER,
  COMMAND_SIDEBAR_ON_BOARD,
  COMMAND_SIDEBAR_SIMULATION,
  COMMAND_SIDEBAR_UT_TEST,
  COMMAND_SIDEBAR_DUMP_TENSOR,
  COMMAND_SIDEBAR_DEBUG_SETTINGS,
  COMMAND_SIDEBAR_SANITIZER_SETTINGS,
  COMMAND_SIDEBAR_ON_BOARD_SETTINGS,
  COMMAND_SIDEBAR_SIMULATION_SETTINGS,
  COMMAND_SIDEBAR_SELECT_OPERATORS,
  COMMAND_SIDEBAR_CLEAR_SELECTED_OPERATORS,
  COMMAND_SIDEBAR_SEARCH_OPERATORS,
  COMMAND_SIDEBAR_CLEAR_OPERATOR_PROJECTS_SEARCH,
  COMMAND_SIDEBAR_TOGGLE_OPERATOR,
  COMMAND_SIDEBAR_SELECT_ALL_OPERATORS,
  COMMAND_SIDEBAR_SELECT_ALL_COMPILED_OPERATORS,
  COMMAND_SIDEBAR_SELECT_ALL_PREPARED_OPERATORS,
  COMMAND_SIDEBAR_DESELECT_ALL_PREPARED_OPERATORS,
  COMMAND_SIDEBAR_STOP_FLOW_TASK,
  COMMAND_SIDEBAR_OPEN_WELCOME,
  COMMAND_SIDEBAR_OPEN_HELP,
} from './constants';
import { FolderContextMenuService } from './service/folder-context-menu-service';
import { buildService } from './service/build-service';
import { configService } from './service/config-service';
import { projectService } from './service/project-service';
import { OperatorProjectIconTheme } from './class/operator-project-icon-theme';
import { welcomeMethods } from './controller/welcome-controller';

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
  }
  catch {
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

// Register resource selection change monitoring and dynamically update context variables.
// Update context variables before command execution so menu display logic works correctly.
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

  // Internationalization (i18n)
  await initI18n();

  // Whether devtool_config.json exists (drives command visibility)
  let hasDevtoolConfig = await checkDevtoolConfigExists();

  const homeTreeProvider = new HomeTreeProvider();
  const operateTreeProvider = new OperateTreeProvider(context.extensionUri, 'flow', context);
  OperateTreeProvider.registerOperateFlowTreeProvider(operateTreeProvider);
  const operatorProjectsTreeProvider = new OperateTreeProvider(context.extensionUri, 'operatorProjects', context);

  const syncSettingIfUnset = async (key: string, value: unknown) => {
    if (value === undefined) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration('op-devtools');
    const inspection = cfg.inspect<unknown>(key);
    const explicitlySet = inspection
      && (
        inspection.workspaceFolderValue !== undefined
        || inspection.workspaceValue !== undefined
        || inspection.globalValue !== undefined
      );
    if (explicitlySet) {
      return;
    }
    await cfg.update(key, value, vscode.ConfigurationTarget.Workspace);
  };

  const syncOperatorProjectWorkspaceSettings = async () => {
    const normalizeScriptTokens = (
      raw: unknown,
      options?: { socVersion?: string; opName?: string; includeOperatorNamesToken?: boolean },
    ): unknown => {
      if (typeof raw !== 'string') {
        return raw;
      }
      let script = raw;
      const socVersion = options?.socVersion?.trim();
      const opName = options?.opName?.trim();
      if (socVersion) {
        const escapedSocVersion = socVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        script = script.replace(new RegExp(`--soc=${escapedSocVersion}\\b`, 'g'), '--soc={soc_version}');
      }
      if (options?.includeOperatorNamesToken) {
        if (opName) {
          const escapedOpName = opName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          script = script.replace(new RegExp(`--ops=${escapedOpName}\\b`, 'g'), '--ops={operatorNames}');
        }
        script = script.replace(/--ops=\b/g, '--ops={operatorNames}');
      }
      return script;
    };

    const toKeyValueMap = (raw: unknown): Record<string, string> => {
      if (!Array.isArray(raw)) {
        return {};
      }
      return raw.reduce((acc, item) => {
        if (!item || typeof item !== 'object') {
          return acc;
        }
        const row = item as Record<string, unknown>;
        const name = row.name;
        if (typeof name !== 'string' || name.trim().length === 0) {
          return acc;
        }
        const value = row.value;
        acc[name] = value === undefined || value === null ? '' : String(value);
        return acc;
      }, {} as Record<string, string>);
    };

    try {
      const buildConfigs = await buildService.getBuildConfigsList();
      const multiResult = await homeMethods.checkMultipleOperators();
      const buildOp = buildConfigs.find((c) => c.config_type === 'build_op');
      const buildExample = buildConfigs.find((c) => c.config_type === 'build_example');
      const simulate = buildConfigs.find((c) => c.config_type === 'simulate');
      const onBoard = buildConfigs.find((c) => c.config_type === 'on_board');
      const utTest = buildConfigs.find((c) => (c as { config_type?: string }).config_type === 'ut_test');
      const sanitizer = (await configService.getSanitizerConfigsList())[0];
      const projectSH = await projectService.getProjectSH();
      const projectSocVersion = await projectService.getProjectSocVersion();

      const buildOpOpts = (buildOp?.user_options || {}) as Record<string, unknown>;
      const buildExampleOpts = (buildExample?.user_options || {}) as Record<string, unknown>;
      const simulateOpts = (simulate?.user_options || {}) as Record<string, unknown>;
      const onBoardOpts = (onBoard?.user_options || {}) as Record<string, unknown>;
      const utTestOpts = (utTest?.user_options || {}) as Record<string, unknown>;
      const sanitizerOpts = (sanitizer?.user_options || {}) as Record<string, unknown>;

      await syncSettingIfUnset('compileAndDeploy.buildConfig.operatorNameToCompile', buildOpOpts.op);
      await syncSettingIfUnset('compileAndDeploy.buildConfig.deployCommandOrRunCommand', buildOpOpts.target_file);
      await syncSettingIfUnset(
        'compileAndDeploy.buildConfig.compileCommand',
        normalizeScriptTokens(buildOpOpts.script, { socVersion: projectSocVersion as string }),
      );
      await syncSettingIfUnset(
        'compileAndDeploy.buildConfig.cpuDebugCompileCommand',
        normalizeScriptTokens(buildOpOpts.cpu_debug_script, { socVersion: projectSocVersion as string }),
      );
      await syncSettingIfUnset(
        'compileAndDeploy.buildConfig.npuDebugCompileCommand',
        normalizeScriptTokens(buildOpOpts.npu_debug_script, { socVersion: projectSocVersion as string }),
      );
      await syncSettingIfUnset(
        'compileAndDeploy.buildConfig.sanitizerCompileCommand',
        normalizeScriptTokens(sanitizerOpts.script, { socVersion: projectSocVersion as string }),
      );
      await syncSettingIfUnset(
        'compileAndDeploy.buildConfig.onBoardCompileCommand',
        normalizeScriptTokens(onBoardOpts.script, { socVersion: projectSocVersion as string }),
      );
      await syncSettingIfUnset(
        'compileAndDeploy.buildConfig.simulationCompileCommand',
        normalizeScriptTokens(simulateOpts.script, { socVersion: projectSocVersion as string }),
      );
      await syncSettingIfUnset(
        'compileAndDeploy.buildConfig.utTestCompileCommand',
        normalizeScriptTokens(utTestOpts.script, {
          socVersion: projectSocVersion as string,
          opName: typeof buildOpOpts.op === 'string' ? buildOpOpts.op : undefined,
          includeOperatorNamesToken: true,
        }),
      );

      const shouldExposeExampleBuildConfig = Boolean(multiResult.isStandardCustom && multiResult.hasMultiple);
      if (shouldExposeExampleBuildConfig) {
        await syncSettingIfUnset('compileAndDeploy.exampleBuildConfig.executionMode', buildExampleOpts.execution_mode);
        await syncSettingIfUnset('compileAndDeploy.exampleBuildConfig.runCommand', buildExampleOpts.script);
      }

      await syncSettingIfUnset('sanitizer.reportLogLevel', sanitizerOpts.logLevel);
      await syncSettingIfUnset('sanitizer.maxSingleLogFileSize', sanitizerOpts.maxDebuglogSize);
      const sanitizerTool = (sanitizerOpts.tool || {}) as Record<string, unknown>;
      const sanitizerMemcheckOption = (sanitizerOpts.memcheckOption || {}) as Record<string, unknown>;
      await syncSettingIfUnset('sanitizer.memory', sanitizerTool.memcheck);
      await syncSettingIfUnset('sanitizer.race', sanitizerTool.racecheck);
      await syncSettingIfUnset('sanitizer.uninitialized', sanitizerTool.initcheck);
      await syncSettingIfUnset('sanitizer.memoryLeak', sanitizerMemcheckOption['leak-check']);
      await syncSettingIfUnset('sanitizer.allocUnused', sanitizerMemcheckOption['check-unused-memory']);
      const useBlock = sanitizerOpts.useBlock;
      if (typeof useBlock === 'boolean') {
        await syncSettingIfUnset('sanitizer.detectionScope', useBlock ? 'singleBlock' : 'global');
      }
      await syncSettingIfUnset('sanitizer.blockId', sanitizerOpts.blockId ?? null);

      await syncSettingIfUnset('performanceTuning.simulation.simulatorType', simulateOpts.simulatorType);
      await syncSettingIfUnset(
        'performanceTuning.simulation.memoryThroughputWaveform',
        simulateOpts.PMSampling,
      );
      await syncSettingIfUnset(
        'performanceTuning.simulation.resourceConflictRatio',
        simulateOpts.ResourceConflictRatio,
      );
      await syncSettingIfUnset(
        'performanceTuning.simulation.parameters',
        toKeyValueMap(simulateOpts.advance_param),
      );
      await syncSettingIfUnset('performanceTuning.onBoard.interCoreLoad', onBoardOpts.Occupancy);
      await syncSettingIfUnset('performanceTuning.onBoard.roofline', onBoardOpts.Roofline);
      await syncSettingIfUnset('performanceTuning.onBoard.operatorCodeHotspot', onBoardOpts.Source);
      await syncSettingIfUnset('performanceTuning.onBoard.cacheHeatmap', onBoardOpts.MemoryDetail);
      await syncSettingIfUnset(
        'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
        onBoardOpts.ArithmeticUtilization,
      );
      await syncSettingIfUnset('performanceTuning.onBoard.l2CacheHitRate', onBoardOpts.L2Cache);
      await syncSettingIfUnset(
        'performanceTuning.onBoard.memoryReadWriteBandwidth',
        onBoardOpts.Memory,
      );
      await syncSettingIfUnset('performanceTuning.onBoard.l0ReadWriteBandwidth', onBoardOpts.MemoryL0);
      await syncSettingIfUnset('performanceTuning.onBoard.ubReadWriteBandwidth', onBoardOpts.MemoryUB);
      await syncSettingIfUnset(
        'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
        onBoardOpts.PipeUtilization,
      );
      await syncSettingIfUnset(
        'performanceTuning.onBoard.resourceConflictRatio',
        onBoardOpts.ResourceConflictRatio,
      );
      await syncSettingIfUnset('performanceTuning.onBoard.enableKernelCodeSegmentProfiling', onBoardOpts.KernelScale);
      const metricKeys = [
        'ArithmeticUtilization',
        'L2Cache',
        'Memory',
        'MemoryL0',
        'MemoryUB',
        'PipeUtilization',
        'ResourceConflictRatio',
      ] as const;
      const allMetricEnabled = metricKeys.every((key) => onBoardOpts[key] === true);
      await syncSettingIfUnset('performanceTuning.onBoard.operatorMetrics', allMetricEnabled);
      await syncSettingIfUnset(
        'performanceTuning.onBoard.parameters',
        toKeyValueMap(onBoardOpts.advance_param),
      );
      await syncSettingIfUnset('environment.environmentScript', projectSH);
      await syncSettingIfUnset('environment.socVersion', projectSocVersion);
    }
    catch (error) {
      console.warn('[syncOperatorProjectWorkspaceSettings] failed:', error);
    }
  };

  const refreshSidebarContexts = async () => {
    hasDevtoolConfig = await checkDevtoolConfigExists();
    if (hasDevtoolConfig) {
      await syncOperatorProjectWorkspaceSettings();
    }
    await vscode.commands.executeCommand('setContext', 'hasDevtoolConfig', hasDevtoolConfig);
    await vscode.commands.executeCommand('setContext', 'opDevtools.showHomeTree', !hasDevtoolConfig);
    await vscode.commands.executeCommand('setContext', 'opDevtools.showOperateTree', hasDevtoolConfig);
    const { showOperatorSearch, showOperatorProjects } = await operateTreeProvider.refreshState(hasDevtoolConfig);
    // Keep both tree views in sync.
    await operatorProjectsTreeProvider.refreshState(hasDevtoolConfig);
    await vscode.commands.executeCommand('setContext', 'opDevtools.showOperatorSearch', showOperatorSearch);
    await vscode.commands.executeCommand('setContext', 'opDevtools.showOperatorProjects', showOperatorProjects);
    await vscode.commands.executeCommand(
      'setContext',
      'opDevtools.operatorProjectsSearchActive',
      operatorProjectsTreeProvider.getSearchKeyword().trim().length > 0,
    );
    await vscode.commands.executeCommand(
      'setContext',
      'opDevtools.allOperatorsSelected',
      operatorProjectsTreeProvider.getAllOperatorsSelected(),
    );
    await vscode.commands.executeCommand(
      'setContext',
      'opDevtools.preparedAllSelected',
      operatorProjectsTreeProvider.getPreparedAllSelected(),
    );
    homeTreeProvider.refresh();
  };

  registerSidebarContextsRefresh(refreshSidebarContexts);

  await refreshSidebarContexts();

  const watchColorThemeChange = vscode.window.onDidChangeActiveColorTheme(async () => {
    await refreshSidebarContexts();
  });
  context.subscriptions.push(watchColorThemeChange);

  const watchOpDevtoolsEnvAndOperatorConfig = vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (
      e.affectsConfiguration('op-devtools.environment')
      || e.affectsConfiguration('op-devtools.operatorProject')
    ) {
      await projectService.syncAscendEnvScriptFromWorkspaceSettings();
      operateTreeProvider.notifyConfigurationChanged();
      operatorProjectsTreeProvider.notifyConfigurationChanged();
    }
  });
  context.subscriptions.push(watchOpDevtoolsEnvAndOperatorConfig);

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

  // Register the new operator project command
  const openCommand = vscode.commands.registerCommand(
    COMMAND_OPEN,
    async () => {
      createOpsProvider.show(VIEW_LINK);
    },
  );

  // Register and open the operator project command (native Open Folder dialog)
  const openProjectCommand = vscode.commands.registerCommand(
    COMMAND_OPEN_PROJECT,
    async () => {
      await vscode.commands.executeCommand('workbench.action.files.openFolder');
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
        // Keep this command as the sidebar visibility toggle for the view container
        await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
      }
      catch (error) {
        console.log(error);
      }
    },
  );

  const homeTreeView = vscode.window.createTreeView('opdevtoolsHomeTree', {
    treeDataProvider: homeTreeProvider,
    showCollapseAll: false,
  });
  const operateTreeView = vscode.window.createTreeView('opdevtoolsOperateTree', {
    treeDataProvider: operateTreeProvider,
    showCollapseAll: false,
  });
  const operatorProjectsTreeView = vscode.window.createTreeView('opdevtoolsOperatorProjectsTree', {
    treeDataProvider: operatorProjectsTreeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(homeTreeView, operateTreeView, operatorProjectsTreeView, toggleOpsOperateCommand);

  const sidebarProjectConfigCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PROJECT_CONFIG,
    async () => vscode.commands.executeCommand(
      'workbench.action.openWorkspaceSettings',
      '@ext:huawei.huawei-op-devtools-vscode-plugin op-devtools',
    ),
  );

  const getOperatorNamesFromSelection = async (): Promise<string | undefined> => {
    return await homeMethods.getSelectedOperators();
  };

  // Expand or close the sidebar based on whether the devtool_config.json file exists
  if (hasDevtoolConfig) {
    // Delay execution to ensure UI is ready
    setTimeout(async () => {
      try {
        console.log('[Extension] devtool_config.json found, focusing OpsOperateProvider');
        await vscode.commands.executeCommand('OpsOperateProvider.focus');
      }
      await operateTreeProvider.runFlowAction('run', async () => {
        await dispatchStartRun();
      });
    },
  );
  const sidebarCpuDebugCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_CPU_DEBUG,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      await operateTreeProvider.runFlowAction('cpuDebug', async () => {
        await taskMethods.runCpuDebug();
      });
    },
  );
  const sidebarNpuDebugCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_NPU_DEBUG,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      await operateTreeProvider.runFlowAction('npuDebug', async () => {
        await taskMethods.runDebug();
      });
    },
  );
  const sidebarSanitizerCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      const operatorNames = await getOperatorNamesFromSelection();
      const showQuickOptions = vscode.workspace.getConfiguration('op-devtools')
        .get<boolean>('sanitizer.showQuickOptions', true) ?? true;
      if (showQuickOptions) {
        await vscode.commands.executeCommand(COMMAND_SANITIZER_OPTIONS);
        return;
      }
      await operateTreeProvider.runFlowAction('sanitizer', async () => {
        await dispatchRunSanitizer({ operatorNames });
      });
    },
  );
  const sidebarOnBoardCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_ON_BOARD,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      const operatorNames = await getOperatorNamesFromSelection();
      const showQuickOptions = vscode.workspace.getConfiguration('op-devtools')
        .get<boolean>('performanceTuning.onBoard.showQuickOptions', true) ?? true;
      if (showQuickOptions) {
        await vscode.commands.executeCommand(COMMAND_ON_BOARD_OPTIONS);
        return;
      }
      await operateTreeProvider.runFlowAction('onboard', async () => {
        const pyascCheck = await homeMethods.validatePyascForAnalysis();
        if (!pyascCheck.valid) {
          vscode.window.showWarningMessage(pyascCheck.message ?? t('extension.openPyFirst'));
          return;
        }
        await dispatchStartOnBoard({ operatorNames });
      });
    },
  );
  const sidebarSimulationCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SIMULATION,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      const operatorNames = await getOperatorNamesFromSelection();
      const showQuickOptions = vscode.workspace.getConfiguration('op-devtools')
        .get<boolean>('performanceTuning.simulation.showQuickOptions', true) ?? true;
      if (showQuickOptions) {
        await vscode.commands.executeCommand(COMMAND_SIMULATOR_OPTIONS);
        return;
      }
      await operateTreeProvider.runFlowAction('simulation', async () => {
        const pyascCheck = await homeMethods.validatePyascForAnalysis();
        if (!pyascCheck.valid) {
          vscode.window.showWarningMessage(pyascCheck.message ?? t('extension.openPyFirst'));
          return;
        }
        await dispatchStartSimulate({ operatorNames });
      });
    },
  );
  const sidebarUtTestCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_UT_TEST,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      const operatorNames = await getOperatorNamesFromSelection();
      await operateTreeProvider.runFlowAction('utTest', async () => {
        await dispatchStartUtTest({ operatorNames });
      });
    },
  );
  const sidebarDumpTensorCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      const operatorNames = await getOperatorNamesFromSelection();
      const compileOption = await getCompileOptionFromSelection();
      await operateTreeProvider.runFlowAction('dumpTensor', async () => {
        await dispatchStartDumpTensor({ operatorNames, compileOption });
      });
    },
  );
  const sidebarDebugSettingsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DEBUG_SETTINGS,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      await operateTreeProvider.runFlowAction(
        'debug',
        async () => {
          await taskMethods.debugConfig();
        },
        { skipEnvironmentScriptCheck: true, skipFlowExecutionUi: true },
      );
    },
  );
  const sidebarSanitizerSettingsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_SETTINGS,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      await operateTreeProvider.runFlowAction(
        'sanitizer',
        async () => {
          await vscode.commands.executeCommand(
            'workbench.action.openWorkspaceSettings',
            '@ext:huawei.huawei-op-devtools-vscode-plugin op-devtools.sanitizer',
          );
        },
        { skipEnvironmentScriptCheck: true, skipFlowExecutionUi: true },
      );
    },
  );
  const sidebarOnBoardSettingsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_ON_BOARD_SETTINGS,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      await operateTreeProvider.runFlowAction(
        'onboard',
        async () => {
          await vscode.commands.executeCommand(
            'workbench.action.openWorkspaceSettings',
            '@ext:huawei.huawei-op-devtools-vscode-plugin op-devtools.performanceTuning.onBoard',
          );
        },
        { skipEnvironmentScriptCheck: true, skipFlowExecutionUi: true },
      );
    },
  );
  const sidebarSimulationSettingsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SIMULATION_SETTINGS,
    async () => {
      const selectedIds = await homeMethods.getSelectedOperatorIds();
      if (selectedIds && selectedIds.length > 1) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }
      await operateTreeProvider.runFlowAction(
        'simulation',
        async () => {
          await vscode.commands.executeCommand(
            'workbench.action.openWorkspaceSettings',
            '@ext:huawei.huawei-op-devtools-vscode-plugin op-devtools.performanceTuning.simulation',
          );
        },
        { skipEnvironmentScriptCheck: true, skipFlowExecutionUi: true },
      );
    },
  );
  const sidebarOpenWelcomeCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_OPEN_WELCOME,
    async () => vscode.commands.executeCommand(COMMAND_WELCOME),
  );
  const sidebarOpenHelpCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_OPEN_HELP,
    async () => vscode.env.openExternal(vscode.Uri.parse('https://gitcode.com/org/cann/discussions/54')),
  );
  const sidebarSelectOperatorsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SELECT_OPERATORS,
    async () => {
      const result = await homeMethods.checkMultipleOperators();
      if (!result.isStandardCustom || !result.operators || result.operators.length === 0) {
        vscode.window.showInformationMessage(t('web.operate.singleOperatorOnly'));
        return;
      }

      const selectedIds = await homeMethods.getSelectedOperatorIds() || [];
      const picks = result.operators.map((op) => ({
        label: op.name,
        description: op.isExperimental ? 'ex' : 'normal',
        picked: selectedIds.includes(op.id),
        operator: op,
      }));
      const chosen = await vscode.window.showQuickPick(picks, {
        canPickMany: true,
        placeHolder: t('web.operate.pleaseSelectOperatorProject'),
      });
      if (!chosen) {
        return;
      }

      const hasEx = chosen.some((item) => item.operator.isExperimental);
      const hasNonEx = chosen.some((item) => !item.operator.isExperimental);
      if (hasEx && hasNonEx) {
        vscode.window.showWarningMessage(t('web.operate.singleOperatorOnly'));
        return;
      }

      await homeMethods.setSelectedOperators({
        operatorIds: chosen.map((item) => item.operator.id),
      });
      await refreshSidebarContexts();
    },
  );
  const sidebarClearSelectedOperatorsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_CLEAR_SELECTED_OPERATORS,
    async () => {
      await homeMethods.setSelectedOperators({ operatorIds: [] });
      await refreshSidebarContexts();
    },
  );

  const sidebarSearchOperatorsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SEARCH_OPERATORS,
    async () => {
      const current = operatorProjectsTreeProvider.getSearchKeyword();
      const keyword = await vscode.window.showInputBox({
        prompt: t('web.operate.searchOperatorProject'),
        value: current,
        ignoreFocusOut: true,
        placeHolder: t('web.operate.searchOperatorProject'),
      });
      if (keyword === undefined) {
        return;
      }

      operatorProjectsTreeProvider.setSearchKeyword(keyword);
      await refreshSidebarContexts();
    },
  );

  const sidebarClearOperatorProjectsSearchCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_CLEAR_OPERATOR_PROJECTS_SEARCH,
    async () => {
      operatorProjectsTreeProvider.setSearchKeyword('');
      await refreshSidebarContexts();
    },
  );

  const sidebarToggleOperatorCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_TOGGLE_OPERATOR,
    async (operatorId: number) => {
      await operatorProjectsTreeProvider.toggleOperator(operatorId);
      await refreshSidebarContexts();
    },
  );

  const sidebarSelectAllOperatorsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SELECT_ALL_OPERATORS,
    async () => {
      await operatorProjectsTreeProvider.selectAllOperators();
      await refreshSidebarContexts();
    },
  );

  const sidebarSelectAllCompiledOperatorsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SELECT_ALL_COMPILED_OPERATORS,
    async () => {
      await operatorProjectsTreeProvider.toggleCompiledAll();
      await refreshSidebarContexts();
    },
  );

  const sidebarSelectAllPreparedOperatorsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SELECT_ALL_PREPARED_OPERATORS,
    async () => {
      await operatorProjectsTreeProvider.togglePreparedAll();
      await refreshSidebarContexts();
    },
  );
  const sidebarDeselectAllPreparedOperatorsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DESELECT_ALL_PREPARED_OPERATORS,
    async () => {
      await operatorProjectsTreeProvider.togglePreparedAll();
      await refreshSidebarContexts();
    },
  );
  const sidebarStopFlowTaskCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_STOP_FLOW_TASK,
    async () => {
      await dispatchStopTask();
      operateTreeProvider.clearFlowExecutionState();
    },
  );

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

  // Simulation / on-board quick options panels (collection picker)
  const simulatorOptionsProvider = new WebviewProvider(context, apiServer);
  const onBoardOptionsProvider = new WebviewProvider(context, apiServer);
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
  context.subscriptions.push(sidebarProjectConfigCommand);
  context.subscriptions.push(sidebarBuildCommand);
  context.subscriptions.push(sidebarRunCommand);
  context.subscriptions.push(sidebarCpuDebugCommand);
  context.subscriptions.push(sidebarNpuDebugCommand);
  context.subscriptions.push(sidebarSanitizerCommand);
  context.subscriptions.push(sidebarOnBoardCommand);
  context.subscriptions.push(sidebarSimulationCommand);
  context.subscriptions.push(sidebarUtTestCommand);
  context.subscriptions.push(sidebarDumpTensorCommand);
  context.subscriptions.push(sidebarDebugSettingsCommand);
  context.subscriptions.push(sidebarSanitizerSettingsCommand);
  context.subscriptions.push(sidebarOnBoardSettingsCommand);
  context.subscriptions.push(sidebarSimulationSettingsCommand);
  context.subscriptions.push(sidebarSelectOperatorsCommand);
  context.subscriptions.push(sidebarClearSelectedOperatorsCommand);
  context.subscriptions.push(sidebarSearchOperatorsCommand);
  context.subscriptions.push(sidebarClearOperatorProjectsSearchCommand);
  context.subscriptions.push(sidebarToggleOperatorCommand);
  context.subscriptions.push(sidebarSelectAllOperatorsCommand);
  context.subscriptions.push(sidebarSelectAllCompiledOperatorsCommand);
  context.subscriptions.push(sidebarSelectAllPreparedOperatorsCommand);
  context.subscriptions.push(sidebarDeselectAllPreparedOperatorsCommand);
  context.subscriptions.push(sidebarStopFlowTaskCommand);
  context.subscriptions.push(sidebarOpenWelcomeCommand);
  context.subscriptions.push(sidebarOpenHelpCommand);

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
      console.log('Workspace changed', vscode.workspace.workspaceFolders);
      vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_DUMP_TENSOR_DATA);

      // Detect operator projects in the workspace
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 0) {
        const { WorkspaceDetectorService } = await import('./service/workspace-detector-service.js');

        for (const folder of workspaceFolders) {
          await WorkspaceDetectorService.detectAndRegisterWorkspace(folder.uri.fsPath)
            .catch((error) => {
              console.error('Failed to detect workspace operator project:', error);
            });
        }
      }
    });

  context.subscriptions.push(watchWorkSpaceFolderChange);

  let isSyncingOnBoardOperatorMetrics = false;
  const onBoardOperatorMetricsSync = vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (isSyncingOnBoardOperatorMetrics) {
      return;
    }
    if (!event.affectsConfiguration('op-devtools.performanceTuning.onBoard.operatorMetrics')) {
      return;
    }

    const cfg = vscode.workspace.getConfiguration('op-devtools');
    const debugEnabled = cfg.get<boolean>('debugMode') === true;

    const parentKey = 'performanceTuning.onBoard.operatorMetrics';
    const parentInspect = cfg.inspect<boolean>(parentKey);
    const desired = cfg.get<boolean>(parentKey);

    if (typeof desired !== 'boolean') {
      if (debugEnabled) {
        console.log('[onBoardOperatorMetricsSync] skip: desired is not boolean', desired);
      }
      return;
    }

    const metricKeys = [
      'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
      'performanceTuning.onBoard.l2CacheHitRate',
      'performanceTuning.onBoard.memoryReadWriteBandwidth',
      'performanceTuning.onBoard.l0ReadWriteBandwidth',
      'performanceTuning.onBoard.ubReadWriteBandwidth',
      'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
      'performanceTuning.onBoard.resourceConflictRatio',
    ];

    const applyForWorkspace = async () => {
      await Promise.all(
        metricKeys.map((k) => cfg.update(k, desired, vscode.ConfigurationTarget.Workspace)),
      );
    };

    const applyForGlobal = async () => {
      await Promise.all(
        metricKeys.map((k) => cfg.update(k, desired, vscode.ConfigurationTarget.Global)),
      );
    };

    const applyForAllFolders = async () => {
      const folders = vscode.workspace.workspaceFolders || [];
      await Promise.all(
        folders.map(async (folder) => {
          const folderCfg = vscode.workspace.getConfiguration('op-devtools', folder.uri);
          await Promise.all(
            metricKeys.map((k) => folderCfg.update(k, desired, vscode.ConfigurationTarget.WorkspaceFolder)),
          );
        }),
      );
    };

    isSyncingOnBoardOperatorMetrics = true;
    try {
      if (debugEnabled) {
        console.log('[onBoardOperatorMetricsSync] desired:', desired, 'inspect:', parentInspect);
      }

      const wroteAnyExplicitScope = Boolean(
        typeof parentInspect?.workspaceFolderValue === 'boolean'
        || typeof parentInspect?.workspaceValue === 'boolean'
        || typeof parentInspect?.globalValue === 'boolean',
      );

      // If user explicitly set parent at certain scopes, update children in those scopes too.
      if (typeof parentInspect?.workspaceFolderValue === 'boolean') {
        await applyForAllFolders();
      }
      if (typeof parentInspect?.workspaceValue === 'boolean') {
        await applyForWorkspace();
      }
      if (typeof parentInspect?.globalValue === 'boolean') {
        await applyForGlobal();
      }

      // Always ensure workspace has the value too, so Settings UI reflects immediately even
      // when parent scope is ambiguous.
      if (!wroteAnyExplicitScope || typeof parentInspect?.workspaceValue !== 'boolean') {
        await applyForWorkspace();
      }
    } catch (error) {
      console.warn('[onBoardOperatorMetricsSync] failed:', error);
    } finally {
      isSyncingOnBoardOperatorMetrics = false;
    }
  });
  context.subscriptions.push(onBoardOperatorMetricsSync);

  const devtoolConfigWatcher = vscode.workspace.createFileSystemWatcher('**/.vscode/devtool_config.json');
  const watchDevtoolConfigCreate = devtoolConfigWatcher.onDidCreate(async () => refreshSidebarContexts());
  const watchDevtoolConfigChange = devtoolConfigWatcher.onDidChange(async () => refreshSidebarContexts());
  const watchDevtoolConfigDelete = devtoolConfigWatcher.onDidDelete(async () => refreshSidebarContexts());
  context.subscriptions.push(devtoolConfigWatcher, watchDevtoolConfigCreate, watchDevtoolConfigChange, watchDevtoolConfigDelete);

  // Detect current workspace when plugin is activated
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    // Delay execution to ensure the plugin is fully initialized
    setTimeout(async () => {
      welcomeMethods.openProject({ projectPath: vscode.workspace.workspaceFolders![0].uri.fsPath }, true);
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
