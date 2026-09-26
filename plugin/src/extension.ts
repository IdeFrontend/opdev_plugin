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
import { NpuRepEditorProvider } from './class/npu-rep-editor-provider';
import { HomeTreeProvider } from './class/home-tree-provider';
import { StTestResultsPanel } from './class/st-test-results-panel';
import { StTestRunHistoryTreeProvider } from './class/st-test-run-history-tree-provider';
import type { StTestWorkspaceRunHistoryRecord } from '@plugin/domain/services/st-test-run-history';
import {
  OperateTreeProvider, type OperateNode,
} from './class/operate-tree-provider';
import {
  ApiServer, type ApiGroup,
} from './core/api-server';
import { ViewOpener } from './core/view/view-opener';
import { apis } from './api-routes';
import { homeMethods } from './controller/home-controller';
import { taskMethods } from './controller/task-controller';
import {
  registerStTestControllerContext,
  registerStTestOptionsPanelCloser,
  stTestMethods,
} from './controller/st-test-controller';
import { performanceDataMethods } from './controller/performance-controller';
import { PermanentStorage } from './class/permanent-storage';
import { ProjectManager } from './core/project/project-manager';
import { sanitizerDiagnosticsService } from './service/sanitizer-diagnostics.service';
import {
  performanceHintsDiagnosticsService, resolvePerformanceHintsFilePath,
} from './service/performance-hints-diagnostics.service';
import { registerMsdebugTargetAutoAdapt } from '@plugin/domain/utils/debug-target';
import { sanitizerService } from './service/sanitizer-service';
import { buildService } from './service/build-service';
import { msAgentBridgeService } from './service/ms-agent-bridge.service';
import {
  appendLog,
  getOperatorToolOutputChannel,
} from './helpers/output-channel';
import { promptReloadWindow } from './helpers/reload-window-prompt';
import {
  resolveDumpTensorFileCommandArgs,
  resolveDumpTensorReportCommandKey,
  resolvePerformanceReportCommandKey,
} from './helpers/report-command-key';
import { insightService } from './service/insight-service';

import { createMainConfigWatcher } from './helpers/main-config-watch';
import { startPostActivateBootstrap } from './helpers/post-activate-bootstrap';
import { registerOperatorPlugins } from './domain/plugins';
import { startNpuHardwareProbe } from './domain/utils/npu-hardware-probe';
import { OperatorPluginRegistry } from './domain/plugins/operator-plugin.registry';
import { getProjectByPath } from './domain/models/project-model';
import { OperatorProjectDetector } from './domain/services/operator-project-detector';
import {
  COMMAND_OPEN,
  COMMAND_WELCOME,
  COMMAND_CREATE_OPERATOR_IN_WORKSPACE,
  COMMAND_TOGGLE_OPS_OPERATE,
  COMMAND_CLEAR_WELCOME_COUNT,
  COMMAND_CLEAR_LAST_PROJECT_PATH,
  COMMAND_RESET_PROJECT_CONFIGURATION,
  COMMAND_CREATE_DIRECTORY,
  COMMAND_GET_HOME,
  COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
  COMMAND_FLASH_DUMP_TENSOR_DATA,
  COMMAND_IMPORT_DUMP_TENSOR_BIN_FILE,
  VIEW_NEW_PROJECT,
  VIEW_WELCOME,
  COMMAND_SIMULATOR_OPTIONS,
  COMMAND_ON_BOARD_OPTIONS,
  COMMAND_SANITIZER_OPTIONS,
  COMMAND_DATA_COLLECTION_CONFIG,
  VIEW_OPTIONS_SANITIZER,
  VIEW_OPTIONS_SIMULATOR,
  VIEW_OPTIONS_ON_BOARD,
  VIEW_OPTIONS_ST_TEST,
  VIEW_DATA_COLLECTION_CONFIG,
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
  COMMAND_SIDEBAR_RESET_PROJECT_CONFIGURATION,
  COMMAND_SIDEBAR_BUILD,
  COMMAND_SIDEBAR_RUN,
  COMMAND_SIDEBAR_CPU_DEBUG,
  COMMAND_SIDEBAR_NPU_DEBUG,
  COMMAND_SIDEBAR_SANITIZER,
  COMMAND_SIDEBAR_ON_BOARD,
  COMMAND_SIDEBAR_SIMULATION,
  COMMAND_SIDEBAR_ST_TEST,
  COMMAND_SIDEBAR_UT_TEST,
  COMMAND_SIDEBAR_DUMP_TENSOR,
  COMMAND_SIDEBAR_DUMP_TENSOR_FILE_OPEN,
  COMMAND_SIDEBAR_DUMP_TENSOR_FILE_COMPARE_WITH,
  COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_COPY_PATH,
  COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_DOWNLOAD,
  COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_MARK,
  COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_UNMARK,
  COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_SORT_TIME,
  COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_FILTER_MARKED,
  COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_SHOW_ALL,
  COMMAND_SIDEBAR_DUMP_TENSOR_COMPARE,
  COMMAND_SIDEBAR_DUMP_TENSOR_COMPARE_START,
  COMMAND_SIDEBAR_DUMP_TENSOR_COMPARE_CANCEL,
  COMMAND_SIDEBAR_DEBUG_SETTINGS,
  COMMAND_SIDEBAR_SANITIZER_SETTINGS,
  COMMAND_SIDEBAR_ON_BOARD_SETTINGS,
  COMMAND_SIDEBAR_SIMULATION_SETTINGS,
  COMMAND_SIDEBAR_SELECT_OPERATORS,
  COMMAND_SIDEBAR_CLEAR_SELECTED_OPERATORS,
  COMMAND_SIDEBAR_SEARCH_OPERATORS,
  COMMAND_SIDEBAR_CLEAR_OPERATOR_PROJECTS_SEARCH,
  COMMAND_SIDEBAR_SELECT_ALL_OPERATORS,
  COMMAND_SIDEBAR_SELECT_ALL_COMPILED_OPERATORS,
  COMMAND_SIDEBAR_SELECT_ALL_PREPARED_OPERATORS,
  COMMAND_SIDEBAR_DESELECT_ALL_PREPARED_OPERATORS,
  COMMAND_SIDEBAR_STOP_FLOW_TASK,
  COMMAND_SIDEBAR_STOP_ALL_OPERATOR_ACTIONS,
  COMMAND_SIDEBAR_OPEN_WELCOME,
  COMMAND_SIDEBAR_OPEN_HELP,
  COMMAND_SIDEBAR_ACTIONS_QUICK_PICK,
  COMMAND_SIDEBAR_SANITIZER_REPORT_SELECT,
  COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH,
  COMMAND_SIDEBAR_SANITIZER_REPORT_TOGGLE_MARK,
  COMMAND_SIDEBAR_SANITIZER_REPORT_MARK,
  COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK,
  COMMAND_SIDEBAR_SANITIZER_REPORT_SORT_TIME,
  COMMAND_SIDEBAR_SANITIZER_REPORT_FILTER_MARKED,
  COMMAND_SIDEBAR_SANITIZER_REPORT_SHOW_ALL,
  COMMAND_SIDEBAR_SANITIZER_REPORT_ADD,
  COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP,
  COMMAND_SIDEBAR_SANITIZER_MESSAGE_AI_FIX,
  COMMAND_SIDEBAR_SANITIZER_STACK_JUMP,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_CLASS,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_SEVERITY,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_TYPE,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_FILE,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_CLASS_ACTIVE,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_SEVERITY_ACTIVE,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_TYPE_ACTIVE,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_FILE_ACTIVE,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_HIDE_DUPLICATES,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_SHOW_DUPLICATES,
  COMMAND_SIDEBAR_SANITIZER_RESULTS_OPEN_GROUP_FILE,
  COMMAND_SIDEBAR_PERFORMANCE_REPORT_SELECT,
  COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH,
  COMMAND_SIDEBAR_PERFORMANCE_REPORT_DOWNLOAD,
  COMMAND_SIDEBAR_PERFORMANCE_REPORT_MARK,
  COMMAND_SIDEBAR_PERFORMANCE_REPORT_UNMARK,
  COMMAND_SIDEBAR_PERFORMANCE_REPORT_SORT_TIME,
  COMMAND_SIDEBAR_PERFORMANCE_REPORT_FILTER_MARKED,
  COMMAND_SIDEBAR_PERFORMANCE_REPORT_SHOW_ALL,
  COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
  COMMAND_OPEN_CSV,
  COMMAND_OPEN_PROFILING_REPORT,
  COMMAND_SHOW_PERFORMANCE_HINTS,
} from './constants';
import {
  focusOpsOperateViewContainer,
  resolveFocusOpsOperateCommand,
} from '@plugin/helpers/focus-ops-operate';
import { shouldShowStTestHistoryView } from '@plugin/helpers/st-test-action';
import {
  EXTENSION_ID,
  CONTEXT_PREFIX,
  SETTINGS_PREFIX,
  TREE_VIEW_HOME,
  TREE_VIEW_OPERATE,
  TREE_VIEW_OPERATOR_PROJECTS,
  TREE_VIEW_SANITIZER_RESULTS,
  TREE_VIEW_PERFORMANCE_RESULTS,
  DUMP_TENSOR_SIDEBAR_VIEW_ID,
  TREE_VIEW_ST_TEST_HISTORY,
  settingsKey,
  contextKey,
} from '@shared/flavor';
import { isStandardCustomProjectType } from '@shared/project-type-view-id';
import { logGlobalEnvSnapshot } from './domain/utils/global-env-snapshot';
import { FolderContextMenuService } from './service/folder-context-menu-service';
import {
  configService,
  ConfigService,
} from './service/config-service';
import { resetCurrentProjectConfiguration } from './service/config-reset-service';
import { setPendingDataCollectionType } from './controller/config-controller';
import { SettingsLoader } from './service/settings-loader';
import { readWorkspaceProjectTypeSetting } from './helpers/operator-project-workspace-config';
import { projectService } from './service/project-service';
import { OperatorProjectIconTheme } from './class/operator-project-icon-theme';
import { registerSidebarContextsRefresh } from './helpers/sidebar-context-refresh';
import { importLegacyWorkspaceState } from './helpers/legacy-state-importer';
import {
  getDevtoolConfigPath,
  getIdeConfigDirName,
  isIdeSettingsFileEmpty,
} from './helpers/ide-config-dir';
import { getCompileOptionForSelectedOperators } from './helpers/compile-options';
import {
  dispatchStartBuild,
  dispatchStartRun,
  dispatchStartBuildExample,
  dispatchRunSanitizer,
  dispatchStartOnBoard,
  dispatchStartSimulate,
  dispatchStartUtTest,
  dispatchStartDumpTensor,
  dispatchEnqueueNativeOperatorAction,
  dispatchGetOperatorActionQueueStatus,
  dispatchStopOperatorAction,
  dispatchStopAllFlowActions,
  dispatchStopCompileRunFlow,
  dispatchStopTask,
  isFlowStopAllVisible,
  registerFlowPreemptListener,
  subscribeCompileRunGateUiState,
} from './helpers/task-method-dispatch';
import type { QueueableActionType } from './helpers/operator-action-queue';
import type { OperatorProjectViewIdValue } from '@shared/project-type-view-id';

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

function resolvePerformanceReportKeyFromTreeItem(node: OperateNode): string | undefined {
  if (node.nodeId !== 'performanceReportItem') {
    return undefined;
  }

  const rawId = node.id ?? '';

  if (!rawId.startsWith('performance-report:')) {
    return undefined;
  }

  return decodeURIComponent(rawId.replace(/^performance-report:/, ''));
}

async function applyPerformanceReportSelection(
  operateTreeProvider: OperateTreeProvider,
  reportKey: string,
): Promise<void> {
  operateTreeProvider.selectPerformanceReport(reportKey);
  const selected = operateTreeProvider.getSelectedPerformanceReport();

  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceReportSelected`, Boolean(selected));
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceSelectedReportMarked`, Boolean(selected?.marked));
}

/** Explorer context passes a `file:` URI; `view/title` often passes unrelated values (e.g. `TreeView`). */
function isExplorerResourceFileUri(candidate: unknown): candidate is vscode.Uri {
  return (
    candidate instanceof vscode.Uri
    && candidate.scheme === 'file'
    && candidate.fsPath.trim().length > 0
  );
}

// Register resource selection change monitoring and dynamically update context variables.
// Update context variables before command execution so menu display logic works correctly.
const updateContextForUri = async (uri: vscode.Uri | undefined) => {
  if (!uri) {
    await vscode.commands.executeCommand('setContext', contextKey('operatorProjectMarked'), false);
    await vscode.commands.executeCommand('setContext', contextKey('multiOperatorProjectMarked'), false);
    await vscode.commands.executeCommand('setContext', contextKey('operatorProjectType'), '');

    return;
  }

  const checkResult = await FolderContextMenuService.checkIsOperatorProject(uri);

  await vscode.commands.executeCommand(
    'setContext',
    contextKey('operatorProjectMarked'),
    checkResult.isOperatorProject && !checkResult.isMultiProject,
  );
  await vscode.commands.executeCommand(
    'setContext',
    contextKey('multiOperatorProjectMarked'),
    checkResult.isMultiProject,
  );

  await vscode.commands.executeCommand(
    'setContext',
    contextKey('operatorProjectType'),
    checkResult.projectType || '',
  );
};

/**
 * Plug-in activation entry function
 * @param context VSCode extended context
 */
export async function activate(context: vscode.ExtensionContext) {
  const debugTag = `[${SETTINGS_PREFIX}][activate]`;
  const logDebug = (...args: unknown[]) => {
    const [
      message,
      payload,
    ] = args;

    appendLog(debugTag, String(message ?? ''), payload);
  };

  const activateStart = Date.now();
  const workspaceFolderPaths = (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);

  logDebug('activate:start', { workspaceFolders: workspaceFolderPaths });

  extensionContext = context;
  registerStTestControllerContext(context);
  (
    globalThis as unknown as { extensionContext: vscode.ExtensionContext }
  ).extensionContext = context;

  // Register all operator-type plugins and project-type detectors.
  // Must be called before any code that uses OperatorPluginRegistry.
  registerOperatorPlugins();
  sanitizerDiagnosticsService.activate(context);
  performanceHintsDiagnosticsService.activate(context);
  registerMsdebugTargetAutoAdapt(
    context,
    () => homeMethods.resolveDebugOperatorEntry(),
    (_workspaceRoot, operator) => Promise.resolve(homeMethods.resolveBuildExampleTargetFile(operator.name) ?? null),
  );

  // Merge CANN env into this process once, then set `SOC_VERSION` / `NPU_ARCH` for spawned tools when unset.
  try {
    logGlobalEnvSnapshot();
  }
  catch {
    // ignore
  }

  // api interface
  const apiServer = initApiServer();

  // Internationalization (i18n)
  await initI18n();

  await insightService.initializeInsightPathConfig(context);

  insightService.initializeInsight(context)
    .catch((error) => console.error('[activate] Failed to initialize insight:', error));

  // Whether devtool_config.json exists (drives command visibility)
  let hasDevtoolConfig = await configService.checkDevtoolConfig();

  const homeTreeProvider = new HomeTreeProvider();
  const operateTreeProvider = new OperateTreeProvider(context.extensionUri, 'flow', context);
  let stTestHistoryWorkspaces: Array<{
    root: string;
    name: string;
  }> = [];
  // The history tree resolves the record from its own key and delegates the open
  // to this handler, so a row click runs a directly registered command.
  const openStTestHistoryRecord = async (entry: StTestWorkspaceRunHistoryRecord): Promise<void> => {
    const outputChannel = getOperatorToolOutputChannel('st test');
    const writeHistoryLog = (message: string): void => {
      const timestamp = new Date()
        .toISOString();

      outputChannel.appendLine(`${timestamp} ${message}`);
    };

    writeHistoryLog(`[ST history] Record resolved: workspaceRoot=${entry.workspaceRoot}, runId=${entry.record.runId}, runDirectory=${entry.record.runDirectory}`);

    try {
      await StTestResultsPanel.createOrShowHistorical(context, entry, writeHistoryLog);
    }
    catch (error) {
      writeHistoryLog(`[ST history] Open failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
      console.error('[ST test] Could not open a historical result report:', error);
      await vscode.window.showWarningMessage(t('stTest.results.historyUnavailable'));
    }
  };
  const stTestRunHistoryTreeProvider = new StTestRunHistoryTreeProvider({
    getWorkspaces: () => stTestHistoryWorkspaces,
    openRecord: openStTestHistoryRecord,
  });

  StTestResultsPanel.setHistoryTreeProvider(stTestRunHistoryTreeProvider);

  OperateTreeProvider.registerOperateFlowTreeProvider(operateTreeProvider);
  const operatorProjectsTreeProvider = new OperateTreeProvider(context.extensionUri, 'operatorProjects', context);
  let isRefreshingSidebarContexts = false;
  let hasPendingSidebarRefresh = false;

  const refreshSidebarContexts = async () => {
    const refreshStart = Date.now();

    if (isRefreshingSidebarContexts) {
      hasPendingSidebarRefresh = true;
      logDebug('refreshSidebarContexts:coalesced', { hasPendingSidebarRefresh });

      return;
    }

    isRefreshingSidebarContexts = true;
    logDebug('refreshSidebarContexts:start', { hasDevtoolConfig });

    try {
      await ConfigService.writeOpDevtoolsDottedSettings({});
      do {
        hasPendingSidebarRefresh = false;
        hasDevtoolConfig = await configService.checkDevtoolConfig();
        let projectType = '';
        let projectTypeSupported = true;

        if (hasDevtoolConfig) {
          const projectTypeResult = await homeMethods.getProjectType();

          projectType = projectTypeResult.projectType || '';
          projectTypeSupported = OperatorPluginRegistry.isProjectTypeSupported(projectType);
        }

        const effectiveHasDevtoolConfig = hasDevtoolConfig && projectTypeSupported;

        logDebug('refreshSidebarContexts:devtoolConfigChecked', {
          hasDevtoolConfig,
          effectiveHasDevtoolConfig,
          projectType,
          projectTypeSupported,
        });

        await vscode.commands.executeCommand('setContext', contextKey('hasDevtoolConfig'), effectiveHasDevtoolConfig);
        await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.showHomeTree`, !effectiveHasDevtoolConfig);
        await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.showOperateTree`, effectiveHasDevtoolConfig);
        const detectedHistoryWorkspaces = await Promise.all((vscode.workspace.workspaceFolders ?? [])
          .map(async (folder) => {
            const root = folder.uri.fsPath;
            // Cascade: workspace `projectType` setting → DB record → detection.
            let workspaceProjectType = readWorkspaceProjectTypeSetting(folder.uri)
              ?? getProjectByPath(root)?.project_type;

            if (!workspaceProjectType) {
              try {
                workspaceProjectType = (await OperatorProjectDetector.detectOperatorProject(root)).projectType;
              }
              catch {
                workspaceProjectType = undefined;
              }
            }

            return isStandardCustomProjectType(workspaceProjectType)
              && fs.existsSync(getDevtoolConfigPath(root))
              ? {
                root,
                name: folder.name,
              }
              : undefined;
          }));

        stTestHistoryWorkspaces = detectedHistoryWorkspaces
          .filter((workspace): workspace is { root: string;
            name: string } => workspace !== undefined);

        const {
          showOperatorSearch, showOperatorProjects,
        } = await operateTreeProvider.refreshState(effectiveHasDevtoolConfig);

        // Keep both tree views in sync.
        await operatorProjectsTreeProvider.refreshState(effectiveHasDevtoolConfig);
        const showStTestHistory = shouldShowStTestHistoryView({
          hasOperateTree: effectiveHasDevtoolConfig,
          isStandardCustomContext: operateTreeProvider.isStandardCustomContext(),
          historyWorkspaceCount: stTestHistoryWorkspaces.length,
        });

        await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.showStTestHistory`, showStTestHistory);

        if (showStTestHistory) {
          stTestRunHistoryTreeProvider.refresh();
        }
        else {
          stTestRunHistoryTreeProvider.clear();
        }

        await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.showOperatorSearch`, showOperatorSearch);
        await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.showOperatorProjects`, showOperatorProjects);
        await vscode.commands.executeCommand(
          'setContext',
          `${CONTEXT_PREFIX}.operatorProjectsSearchActive`,
          operatorProjectsTreeProvider.getSearchKeyword()
            .trim().length > 0,
        );
        await vscode.commands.executeCommand(
          'setContext',
          `${CONTEXT_PREFIX}.allOperatorsSelected`,
          operatorProjectsTreeProvider.getAllOperatorsSelected(),
        );
        await vscode.commands.executeCommand(
          'setContext',
          `${CONTEXT_PREFIX}.preparedAllSelected`,
          operatorProjectsTreeProvider.getPreparedAllSelected(),
        );
        homeTreeProvider.refresh();
        logDebug('refreshSidebarContexts:passComplete', {
          hasPendingSidebarRefresh,
          hasDevtoolConfig,
          effectiveHasDevtoolConfig,
        });
      } while (hasPendingSidebarRefresh);
    }
    finally {
      isRefreshingSidebarContexts = false;
      logDebug('refreshSidebarContexts:end', {
        elapsedMs: Date.now() - refreshStart,
        hasPendingSidebarRefresh,
        hasDevtoolConfig,
      });
    }
  };

  const queueActionToNodeId: Record<QueueableActionType, 'sanitizer' | 'onboard' | 'simulation' | 'utTest' | 'stTest' | 'dumpTensor' | 'cpuDebug' | 'npuDebug'> = {
    sanitizer: 'sanitizer',
    onboard: 'onboard',
    simulation: 'simulation',
    utTest: 'utTest',
    stTest: 'stTest',
    dumpTensor: 'dumpTensor',
    cpuDebug: 'cpuDebug',
    npuDebug: 'npuDebug',
  };

  const nodeIdToQueueAction: Partial<Record<string, QueueableActionType>> = {
    sanitizer: 'sanitizer',
    onboard: 'onboard',
    simulation: 'simulation',
    utTest: 'utTest',
    stTest: 'stTest',
    dumpTensor: 'dumpTensor',
    cpuDebug: 'cpuDebug',
    npuDebug: 'npuDebug',
  };

  const syncNativeQueueState = async () => {
    try {
      const { items } = await dispatchGetOperatorActionQueueStatus();

      await vscode.commands.executeCommand(
        'setContext',
        `${CONTEXT_PREFIX}.operatorActionQueueStopAllVisible`,
        await isFlowStopAllVisible(),
      );
      const states: Partial<Record<'sanitizer' | 'onboard' | 'simulation' | 'utTest' | 'stTest' | 'dumpTensor', 'queued' | 'running' | 'cancel_failed'>> = {};

      items.forEach((item) => {
        const nodeId = queueActionToNodeId[item.actionType];

        if (!nodeId) {
          return;
        }

        states[nodeId] = item.internalState;
      });
      operateTreeProvider.setQueuedFlowStates(states);
    }
    catch (error) {
      console.warn('[syncNativeQueueState] failed:', error);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.operatorActionQueueStopAllVisible`, false);
    }
  };

  registerSidebarContextsRefresh(refreshSidebarContexts);

  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.npuHardwareAvailable`, true);

  const checkNpuEnvironment = async (): Promise<boolean> => {
    const available = await startNpuHardwareProbe();

    if (!available) {
      vscode.window.showInformationMessage(
        t('extension.npuEnvRequired'),
        { modal: true },
      );

      return false;
    }

    return true;
  };

  // One-time workspace-state import: seeds settings.json + cache.json from the
  // persisted stores before the first sidebar refresh. Marker = plugin version;
  // steps with `stored < since <= current` run once per workspace.
  const pluginVersion = (context.extension as { packageJSON?: { version?: string } } | undefined)
    ?.packageJSON?.version ?? '0.0.0';

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    await importLegacyWorkspaceState(pluginVersion, { targetProjectPath: folder.uri.fsPath });
  }

  await refreshSidebarContexts();
  await syncNativeQueueState();

  const queueStatusTimer = setInterval(() => {
    void syncNativeQueueState();
  }, 1000);

  context.subscriptions.push({ dispose: () => clearInterval(queueStatusTimer) });

  context.subscriptions.push({
    dispose: subscribeCompileRunGateUiState((state) => {
      operateTreeProvider.setCompileRunGateUiState(state);
      void syncNativeQueueState();
    }),
  });

  context.subscriptions.push({
    dispose: registerFlowPreemptListener(() => {
      operateTreeProvider.clearFlowExecutionState();
      void syncNativeQueueState();
    }),
  });

  const watchColorThemeChange = vscode.window.onDidChangeActiveColorTheme(async () => {
    logDebug('event:onDidChangeActiveColorTheme');
    await refreshSidebarContexts();
  });

  context.subscriptions.push(watchColorThemeChange);

  const watchMainConfig = createMainConfigWatcher({
    projectService,
    operateTreeProvider,
    operatorProjectsTreeProvider,
    logDebug,
    promptReloadWindow,
  });

  context.subscriptions.push(watchMainConfig);

  PermanentStorage.setInstance(context);

  // Initialize the Webview of the new operator project
  const createOpsProvider = new WebviewProvider(context, apiServer);

  // Initialize the Webview of the configuration page
  const configWelcomeProvider = new WebviewProvider(context, apiServer);

  // Register the new operator project command
  const openCommand = vscode.commands.registerCommand(
    COMMAND_OPEN,
    async () => {
      createOpsProvider.show(VIEW_NEW_PROJECT);
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

      await createOpsProvider.show(VIEW_NEW_PROJECT);
      // Wait for the webview to finish loading and send the path
      setTimeout(() => {
        createOpsProvider.postMessage({
          command: 'iframeSetProjectPath',
          data: targetPath,
        });
      }, 500);
    },
  );

  // Register the open/close command for the plugin's OWN view container (contributed to the
  // primary activity bar). `workbench.action.toggleSidebarVisibility` would toggle the whole
  // primary side bar and indiscriminately close Explorer/Debug/etc. (GC-33). The icon only
  // FOCUSES (reveals) the plugin's own panel — it never toggles it closed. We run the first
  // registered focus candidate (the per-container command) and skip when none exist instead
  // of throwing "command not found".
  const toggleOpsOperateCommand = vscode.commands.registerCommand(
    COMMAND_TOGGLE_OPS_OPERATE,
    async () => {
      try {
        const availableCommands = await vscode.commands.getCommands(true);
        const focusCommand = resolveFocusOpsOperateCommand(availableCommands);

        if (!focusCommand) {
          console.warn('toggleOpsOperate: no registered command to focus the plugin view container');

          return;
        }

        await vscode.commands.executeCommand(focusCommand);
      }
      catch (error) {
        console.log(error);
      }
    },
  );

  const homeTreeView = vscode.window.createTreeView(TREE_VIEW_HOME, {
    treeDataProvider: homeTreeProvider,
    showCollapseAll: false,
  });
  const operateTreeView = vscode.window.createTreeView(TREE_VIEW_OPERATE, {
    treeDataProvider: operateTreeProvider,
    showCollapseAll: false,
  });
  const sanitizerResultsPanelProvider: vscode.TreeDataProvider<OperateNode> = {
    onDidChangeTreeData: operateTreeProvider.onDidChangeTreeData,
    getTreeItem: (element) => operateTreeProvider.getTreeItem(element),
    getParent: (element) => operateTreeProvider.getSanitizerTreeParent(element),
    resolveTreeItem: (item, element, token) => operateTreeProvider.resolveTreeItem(item, element as OperateNode, token),
    getChildren: (element) => {
      if (!element) {
        return operateTreeProvider.getSanitizerResultsPanelNodes();
      }

      if (element.nodeId === 'sanitizerReportItem' || element.nodeId === 'sanitizerClass') {
        return operateTreeProvider.getChildren(element);
      }

      return [];
    },
  };
  const sanitizerResultsTreeView = vscode.window.createTreeView(TREE_VIEW_SANITIZER_RESULTS, {
    treeDataProvider: sanitizerResultsPanelProvider,
    showCollapseAll: false,
  });

  operateTreeProvider.setSanitizerResultsTreeView(sanitizerResultsTreeView);
  const performanceResultsPanelProvider: vscode.TreeDataProvider<OperateNode> = {
    onDidChangeTreeData: operateTreeProvider.onDidChangePerformanceTreeData,
    getTreeItem: (element) => operateTreeProvider.getTreeItem(element),
    getParent: (element) => operateTreeProvider.getPerformanceTreeParent(element),
    resolveTreeItem: (item, element, token) => operateTreeProvider.resolveTreeItem(item, element as OperateNode, token),
    getChildren: (element) => {
      if (!element) {
        return operateTreeProvider.getPerformanceResultsPanelNodes();
      }

      if (element.nodeId === 'performanceReportItem' || element.nodeId === 'performanceFolder') {
        return operateTreeProvider.getChildren(element);
      }

      return [];
    },
  };
  const performanceResultsTreeView = vscode.window.createTreeView(TREE_VIEW_PERFORMANCE_RESULTS, {
    treeDataProvider: performanceResultsPanelProvider,
    showCollapseAll: false,
  });
  const stTestHistoryTreeView = vscode.window.createTreeView(TREE_VIEW_ST_TEST_HISTORY, {
    treeDataProvider: stTestRunHistoryTreeProvider,
    showCollapseAll: false,
  });

  stTestRunHistoryTreeProvider.setTreeView(stTestHistoryTreeView);

  operateTreeProvider.setPerformanceResultsTreeView(performanceResultsTreeView);
  context.subscriptions.push(performanceResultsTreeView.onDidChangeSelection(async (event) => {
    const node = event.selection[0];

    if (!node) {
      return;
    }

    const reportKey = resolvePerformanceReportKeyFromTreeItem(node);

    if (!reportKey || operateTreeProvider.getSelectedPerformanceReport()?.key === reportKey) {
      return;
    }

    await applyPerformanceReportSelection(operateTreeProvider, reportKey);
  }));
  const dumpTensorResultsPanelProvider: vscode.TreeDataProvider<OperateNode> = {
    onDidChangeTreeData: operateTreeProvider.onDidChangeDumpTensorTreeData,
    getTreeItem: (element) => operateTreeProvider.getTreeItem(element),
    getParent: (element) => operateTreeProvider.getDumpTensorTreeParent(element),
    getChildren: (element) => {
      if (!element) {
        return operateTreeProvider.getDumpTensorResultsPanelNodes();
      }

      if (element.nodeId === 'dumpTensorReportItem' || element.nodeId === 'dumpTensorFolder') {
        return operateTreeProvider.getChildren(element);
      }

      return [];
    },
  };
  const dumpTensorResultsTreeView = vscode.window.createTreeView(DUMP_TENSOR_SIDEBAR_VIEW_ID, {
    treeDataProvider: dumpTensorResultsPanelProvider,
    showCollapseAll: false,
  });

  operateTreeProvider.setDumpTensorResultsTreeView(dumpTensorResultsTreeView);
  const operatorProjectsTreeView = vscode.window.createTreeView(TREE_VIEW_OPERATOR_PROJECTS, {
    treeDataProvider: operatorProjectsTreeProvider,
    showCollapseAll: false,
  });

  // One toggle command per operator project, registered by the provider.
  operatorProjectsTreeProvider.registerOperatorToggleCommands(refreshSidebarContexts);

  context.subscriptions.push(
    homeTreeView,
    operateTreeView,
    sanitizerResultsTreeView,
    performanceResultsTreeView,
    dumpTensorResultsTreeView,
    stTestHistoryTreeView,
    stTestRunHistoryTreeProvider,
    { dispose: () => StTestResultsPanel.setHistoryTreeProvider(undefined) },
    operatorProjectsTreeView,
    toggleOpsOperateCommand,
  );
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerDuplicatesHidden`, operateTreeProvider.isSanitizerHideDuplicatesEnabled());
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerMarkedOnly`, operateTreeProvider.isSanitizerMarkedOnlyEnabled());
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceMarkedOnly`, operateTreeProvider.isPerformanceMarkedOnlyEnabled());
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceReportSelected`, false);
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceSelectedReportMarked`, false);
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorMarkedOnly`, operateTreeProvider.isDumpTensorMarkedOnlyEnabled());
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorComparing`, operateTreeProvider.isDumpTensorCompareModeEnabled());
  await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, operateTreeProvider.getSanitizerResultsGroupBy());
  await vscode.commands.executeCommand(
    'setContext',
    `${CONTEXT_PREFIX}.sanitizerAiFixAvailable`,
    await msAgentBridgeService.isMsAgentIntegrationAvailable(),
  );
  // Load sanitizer report tree data only after Actions/Operators views are initialized.

  const sidebarProjectConfigCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PROJECT_CONFIG,
    async () => vscode.commands.executeCommand(
      'workbench.action.openWorkspaceSettings',
      `@ext:${context.extension.id}`,
    ),
  );

  const sidebarResetProjectConfigurationCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_RESET_PROJECT_CONFIGURATION,
    async () => {
      await resetCurrentProjectConfiguration();
    },
  );

  const getOperatorNamesFromSelection = async (): Promise<string | undefined> => {
    return await homeMethods.getSelectedOperators();
  };

  const sidebarBuildCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_BUILD,
    async () =>
      operateTreeProvider.runFlowAction('build', async () => {
        const operatorNames = await getOperatorNamesFromSelection();
        const compileOption = await getCompileOptionForSelectedOperators();

        await dispatchStartBuild({
          operatorNames,
          compileOption,
        });
      }),
  );

  const sidebarRunCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_RUN,
    async () => {
      await operateTreeProvider.runFlowAction('run', async () => {
        if (operateTreeProvider.hasMultipleOperators() || operateTreeProvider.isStandardCustomContext()) {
          const operatorNames = await getOperatorNamesFromSelection();
          const compileOption = await getCompileOptionForSelectedOperators();
          const operatorType = operateTreeProvider.isStandardCustomContext() ? 'standard-custom' : undefined;

          await dispatchStartBuildExample({
            operatorNames,
            operatorType,
            compileOption,
          }, 'run');

          return;
        }

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
        await dispatchEnqueueNativeOperatorAction('cpuDebug', {}, () => taskMethods.runCpuDebug());
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
        await dispatchEnqueueNativeOperatorAction('npuDebug', {}, () => taskMethods.runDebug());
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
      const showQuickOptions = SettingsLoader.read<boolean>('sanitizer.showQuickOptions', true);

      if (showQuickOptions) {
        await vscode.commands.executeCommand(COMMAND_SANITIZER_OPTIONS);

        return;
      }

      await operateTreeProvider.runFlowAction('sanitizer', async () => {
        await dispatchEnqueueNativeOperatorAction('sanitizer', { operatorNames }, dispatchRunSanitizer);
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
      const compileOption = await getCompileOptionForSelectedOperators();

      // A5 + npu-compute: open the unified data-collection dialog instead of the
      // legacy quick-options panel / direct msprof flow.
      if (ConfigService.shouldUseNewOnBoardTool()) {
        setPendingDataCollectionType('onboard');
        await vscode.commands.executeCommand(COMMAND_DATA_COLLECTION_CONFIG);

        return;
      }

      const showQuickOptions = SettingsLoader.read<boolean>('performanceTuning.onBoard.showQuickOptions', true);

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

        await dispatchEnqueueNativeOperatorAction(
          'onboard',
          {
            operatorNames,
            compileOption,
          },
          dispatchStartOnBoard,
          async () => {
            await operateTreeProvider.refreshPerformanceReports({ focusIfNew: true });
          },
        );
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
      const compileOption = await getCompileOptionForSelectedOperators();

      // A5 + npu-emulate (formerly npusim): open the unified data-collection
      // dialog instead of the legacy quick-options panel / direct msprof flow.
      if (ConfigService.shouldUseNewSimulationTool()) {
        setPendingDataCollectionType('simulate');
        await vscode.commands.executeCommand(COMMAND_DATA_COLLECTION_CONFIG);

        return;
      }

      const showQuickOptions = SettingsLoader.read<boolean>('performanceTuning.simulation.showQuickOptions', true);

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

        await dispatchEnqueueNativeOperatorAction(
          'simulation',
          {
            operatorNames,
            compileOption,
          },
          dispatchStartSimulate,
          async () => {
            await operateTreeProvider.refreshPerformanceReports({ focusIfNew: true });
          },
        );
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
      const compileOption = await getCompileOptionForSelectedOperators();

      await operateTreeProvider.runFlowAction('utTest', async () => {
        await dispatchEnqueueNativeOperatorAction(
          'utTest',
          {
            operatorNames,
            compileOption,
          },
          dispatchStartUtTest,
        );
      });
    },
  );
  const stTestOptionsProvider = new WebviewProvider(context, apiServer);

  registerStTestOptionsPanelCloser(() => stTestOptionsProvider.dispose());
  context.subscriptions.push({ dispose: () => registerStTestOptionsPanelCloser(undefined) });
  const sidebarStTestCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_ST_TEST,
    async () => {
      if (!operateTreeProvider.isStandardCustomContext()) {
        vscode.window.showInformationMessage(t('stTest.standardCustomOnly'));

        return;
      }

      const selectedOperators = await homeMethods.getSelectedOperatorEntries();

      if (selectedOperators.length !== 1) {
        vscode.window.showInformationMessage(t('stTest.oneOperatorRequired'));

        return;
      }

      try {
        await stTestMethods.ensureOptionsAvailable();
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        vscode.window.showInformationMessage(message);

        return;
      }

      await stTestOptionsProvider.show(VIEW_OPTIONS_ST_TEST);
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
      const compileOption = await getCompileOptionForSelectedOperators();

      await operateTreeProvider.runFlowAction('dumpTensor', async () => {
        await dispatchEnqueueNativeOperatorAction(
          'dumpTensor',
          {
            operatorNames,
            compileOption,
          },
          dispatchStartDumpTensor,
        );
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
        {
          skipEnvironmentScriptCheck: true,
          skipFlowExecutionUi: true,
        },
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
            `@ext:${EXTENSION_ID} ${settingsKey('sanitizer')}`,
          );
        },
        {
          skipEnvironmentScriptCheck: true,
          skipFlowExecutionUi: true,
        },
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
            `@ext:${EXTENSION_ID} ${settingsKey('performanceTuning.onBoard')}`,
          );
        },
        {
          skipEnvironmentScriptCheck: true,
          skipFlowExecutionUi: true,
        },
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
            `@ext:${EXTENSION_ID} ${settingsKey('performanceTuning.simulation')}`,
          );
        },
        {
          skipEnvironmentScriptCheck: true,
          skipFlowExecutionUi: true,
        },
      );
    },
  );
  const sidebarOpenWelcomeCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_OPEN_WELCOME,
    async () => vscode.commands.executeCommand(COMMAND_WELCOME),
  );
  const sidebarOpenHelpCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_OPEN_HELP,
    async () => vscode.env.openExternal(vscode.Uri.parse('https://gitcode.com/opdevtools/plugin_release')),
  );
  const sidebarSanitizerReportSelectCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_SELECT,
    async (reportPath: string) => {
      await operateTreeProvider.selectSanitizerReport(reportPath);
    },
  );
  const sidebarSanitizerReportCopyPathCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const raw = typeof arg === 'string'
        ? arg
        : String(arg?.command?.arguments?.[0] ?? arg?.id ?? '');
      const reportPath = raw.startsWith('sanitizer-report:')
        ? decodeURIComponent(raw.replace(/^sanitizer-report:/, ''))
        : raw;

      if (!reportPath) {
        return;
      }

      await operateTreeProvider.copySanitizerReportPath(reportPath);
    },
  );
  const sidebarSanitizerReportToggleMarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_TOGGLE_MARK,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const raw = typeof arg === 'string'
        ? arg
        : String(arg?.command?.arguments?.[0] ?? arg?.id ?? '');
      const reportPath = raw.startsWith('sanitizer-report:')
        ? decodeURIComponent(raw.replace(/^sanitizer-report:/, ''))
        : raw;

      if (!reportPath) {
        return;
      }

      const report = operateTreeProvider.getSanitizerReportByPath(reportPath);

      if (!report) {
        return;
      }

      const reportId = report.id;

      await operateTreeProvider.toggleSanitizerReportMark(reportId);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerMarkedOnly`, operateTreeProvider.isSanitizerMarkedOnlyEnabled());
    },
  );
  const sidebarSanitizerReportMarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_MARK,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const raw = typeof arg === 'string'
        ? arg
        : String(arg?.command?.arguments?.[0] ?? arg?.id ?? '');
      const reportPath = raw.startsWith('sanitizer-report:')
        ? decodeURIComponent(raw.replace(/^sanitizer-report:/, ''))
        : raw;

      if (!reportPath) {
        return;
      }

      const report = operateTreeProvider.getSanitizerReportByPath(reportPath);

      if (!report) {
        return;
      }

      await operateTreeProvider.toggleSanitizerReportMark(report.id);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerMarkedOnly`, operateTreeProvider.isSanitizerMarkedOnlyEnabled());
    },
  );
  const sidebarSanitizerReportUnmarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const raw = typeof arg === 'string'
        ? arg
        : String(arg?.command?.arguments?.[0] ?? arg?.id ?? '');
      const reportPath = raw.startsWith('sanitizer-report:')
        ? decodeURIComponent(raw.replace(/^sanitizer-report:/, ''))
        : raw;

      if (!reportPath) {
        return;
      }

      const report = operateTreeProvider.getSanitizerReportByPath(reportPath);

      if (!report) {
        return;
      }

      await operateTreeProvider.toggleSanitizerReportMark(report.id);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerMarkedOnly`, operateTreeProvider.isSanitizerMarkedOnlyEnabled());
    },
  );
  const sidebarSanitizerReportSortTimeCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_SORT_TIME,
    async () => {
      operateTreeProvider.toggleSanitizerSortOrder();
    },
  );
  const sidebarSanitizerReportFilterMarkedCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_FILTER_MARKED,
    async () => {
      operateTreeProvider.setSanitizerMarkedOnly(true);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerMarkedOnly`, true);
    },
  );
  const sidebarSanitizerReportShowAllCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_SHOW_ALL,
    async () => {
      operateTreeProvider.setSanitizerMarkedOnly(false);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerMarkedOnly`, false);
    },
  );
  const sidebarSanitizerReportAddCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_ADD,
    async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: t('web.openProject.openNow'),
        filters: {
          [t('web.sanitizerPanel.sanitizerResult')]: [
            'log',
            '*',
          ],
        },
      });
      const filePath = picked?.[0]?.fsPath;

      if (!filePath) {
        return;
      }

      await vscode.window.withProgress(
        { location: { viewId: TREE_VIEW_SANITIZER_RESULTS } },
        async () => {
          await operateTreeProvider.addSanitizerReportFromPath(filePath);
        },
      );
    },
  );
  const sidebarSanitizerMessageJumpCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP,
    async (messageId: string) => {
      await operateTreeProvider.jumpToSanitizerMessage(messageId);
    },
  );
  const sidebarSanitizerMessageAiFixCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_MESSAGE_AI_FIX,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      if (!(await msAgentBridgeService.isMsAgentIntegrationAvailable())) {
        return;
      }

      const aiFixIndex = operateTreeProvider.getSanitizerMessageAiFixIndex(arg);

      if (aiFixIndex === undefined) {
        return;
      }

      await msAgentBridgeService.fixMsAgentProblem(aiFixIndex);
    },
  );
  const sidebarSanitizerStackJumpCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_STACK_JUMP,
    async (params: {
      fileLink: string;
      row: number;
      col: number;
      errorTitle?: string;
      errorMessage?: string
    }) => {
      await performanceDataMethods.jumpToFile(params);
    },
  );
  const sidebarSanitizerResultsGroupByClassCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_CLASS,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('class');
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, 'class');
    },
  );
  const sidebarSanitizerResultsGroupByClassActiveCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_CLASS_ACTIVE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('class');
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, 'class');
    },
  );
  const sidebarSanitizerResultsGroupBySeverityCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_SEVERITY,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('severity');
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, 'severity');
    },
  );
  const sidebarSanitizerResultsGroupBySeverityActiveCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_SEVERITY_ACTIVE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('severity');
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, 'severity');
    },
  );
  const sidebarSanitizerResultsGroupByTypeCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_TYPE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('type');
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, 'type');
    },
  );
  const sidebarSanitizerResultsGroupByTypeActiveCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_TYPE_ACTIVE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('type');
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, 'type');
    },
  );
  const sidebarSanitizerResultsGroupByFileCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_FILE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('file');
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, 'file');
    },
  );
  const sidebarSanitizerResultsGroupByFileActiveCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_FILE_ACTIVE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('file');
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`, 'file');
    },
  );
  const sidebarSanitizerResultsHideDuplicatesCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_HIDE_DUPLICATES,
    async () => {
      operateTreeProvider.setSanitizerHideDuplicates(true);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerDuplicatesHidden`, true);
    },
  );
  const sidebarSanitizerResultsShowDuplicatesCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_SHOW_DUPLICATES,
    async () => {
      operateTreeProvider.setSanitizerHideDuplicates(false);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerDuplicatesHidden`, false);
    },
  );
  const sidebarSanitizerResultsOpenGroupFileCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_OPEN_GROUP_FILE,
    async (arg: string | { id?: string }) => {
      const raw = typeof arg === 'string' ? arg : String(arg?.id ?? '');
      const marker = 'sanitizer-report-group:';

      if (!raw.startsWith(marker)) {
        return;
      }

      const [
        , _encodedReportPath,
        mode,
        encodedGroupKey,
      ] = raw.split(':');

      if (mode !== 'file' || !encodedGroupKey) {
        return;
      }

      const filePath = decodeURIComponent(encodedGroupKey);

      await operateTreeProvider.openSanitizerResultGroupFile(filePath);
    },
  );
  const sidebarActionsQuickPickCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_ACTIONS_QUICK_PICK,
    async () => {
      const resolveOperateChildren = async (node?: unknown) => {
        const children = await Promise.resolve(operateTreeProvider.getChildren(node as never));

        return Array.isArray(children) ? children : [];
      };

      const getNodeLabel = (node: vscode.TreeItem): string => {
        if (typeof node.label === 'string') {
          return node.label;
        }

        return node.label?.label ?? '';
      };

      const rootNodes = await resolveOperateChildren();

      if (rootNodes.length === 0) {
        vscode.window.showInformationMessage(t('web.operate.noActionsAvailable'));

        return;
      }

      type FlatActionPick = vscode.QuickPickItem & {
        commandId?: string;
      };

      const picks: FlatActionPick[] = [];
      const seenCommands = new Set<string>();
      let previousTopLevelNodeId: string | undefined;

      const shouldInsertUnnamedTopLevelSeparator = (
        previousNodeId: string | undefined,
        currentNodeId: string | undefined,
      ): boolean => {
        return (
          (previousNodeId === 'debug' && currentNodeId === 'sanitizer')
          || (previousNodeId === 'power' && currentNodeId === 'utTest')
        );
      };

      const collectVisibleActions = async (node?: vscode.TreeItem) => {
        const nodes = await resolveOperateChildren(node);

        for (const item of nodes) {
          const itemLabel = getNodeLabel(item);
          const hasChildren = item.collapsibleState !== vscode.TreeItemCollapsibleState.None;
          const nodeId = (item as unknown as { nodeId?: string }).nodeId;

          if (!node && shouldInsertUnnamedTopLevelSeparator(previousTopLevelNodeId, nodeId)) {
            picks.push({
              kind: vscode.QuickPickItemKind.Separator,
              label: '',
            });
          }

          if (hasChildren) {
            picks.push({
              kind: vscode.QuickPickItemKind.Separator,
              label: itemLabel,
            });
          }

          const commandId = item.command?.command;

          if (commandId && !seenCommands.has(commandId)) {
            seenCommands.add(commandId);
            picks.push({
              label: itemLabel,
              detail: typeof item.description === 'string' ? item.description : undefined,
              iconPath: typeof item.iconPath === 'string' ? undefined : item.iconPath,
              commandId,
            });
          }

          if (hasChildren) {
            await collectVisibleActions(item);
          }

          if (!node) {
            previousTopLevelNodeId = nodeId;
          }
        }
      };

      await collectVisibleActions();

      if (picks.filter((item) => item.kind !== vscode.QuickPickItemKind.Separator).length === 0) {
        vscode.window.showInformationMessage(t('web.operate.noActionsAvailable'));

        return;
      }

      const selected = await vscode.window.showQuickPick(picks, {
        title: t('web.operate.actionsTitle'),
        placeHolder: t('web.operate.actionsTitle'),
        ignoreFocusOut: true,
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (!selected?.commandId) {
        return;
      }

      await vscode.commands.executeCommand(selected.commandId);
      await refreshSidebarContexts();
      await syncNativeQueueState();
    },
  );
  const sidebarPerformanceReportSelectCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_SELECT,
    async (reportKey: string) => {
      await applyPerformanceReportSelection(operateTreeProvider, reportKey);
    },
  );
  const sidebarPerformanceReportCopyPathCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const reportKeyRaw = resolvePerformanceReportCommandKey(arg);
      const reportKey = reportKeyRaw || operateTreeProvider.getSelectedPerformanceReport()?.key || '';

      if (!reportKey) {
        return;
      }

      await operateTreeProvider.copyPerformanceReportPath(reportKey);
    },
  );
  const sidebarPerformanceReportDownloadCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_DOWNLOAD,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const reportKeyRaw = resolvePerformanceReportCommandKey(arg);
      const reportKey = reportKeyRaw || operateTreeProvider.getSelectedPerformanceReport()?.key || '';

      if (!reportKey) {
        return;
      }

      await operateTreeProvider.downloadPerformanceReport(reportKey);
    },
  );
  const sidebarPerformanceReportMarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_MARK,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const reportKeyRaw = resolvePerformanceReportCommandKey(arg);
      const reportKey = reportKeyRaw || operateTreeProvider.getSelectedPerformanceReport()?.key || '';

      if (!reportKey) {
        return;
      }

      const report = operateTreeProvider.getPerformanceReportByKey(reportKey);

      if (report?.marked) {
        return;
      }

      await operateTreeProvider.togglePerformanceReportMark(reportKey);
      const selected = operateTreeProvider.getSelectedPerformanceReport();

      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceMarkedOnly`, operateTreeProvider.isPerformanceMarkedOnlyEnabled());
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceSelectedReportMarked`, Boolean(selected?.marked));
    },
  );
  const sidebarPerformanceReportUnmarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_UNMARK,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const reportKeyRaw = resolvePerformanceReportCommandKey(arg);
      const reportKey = reportKeyRaw || operateTreeProvider.getSelectedPerformanceReport()?.key || '';

      if (!reportKey) {
        return;
      }

      const report = operateTreeProvider.getPerformanceReportByKey(reportKey);

      if (!report?.marked) {
        return;
      }

      await operateTreeProvider.togglePerformanceReportMark(reportKey);
      const selected = operateTreeProvider.getSelectedPerformanceReport();

      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceMarkedOnly`, operateTreeProvider.isPerformanceMarkedOnlyEnabled());
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceSelectedReportMarked`, Boolean(selected?.marked));
    },
  );
  const sidebarPerformanceReportSortTimeCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_SORT_TIME,
    async () => {
      operateTreeProvider.togglePerformanceSortOrder();
    },
  );
  const sidebarPerformanceReportFilterMarkedCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_FILTER_MARKED,
    async () => {
      operateTreeProvider.setPerformanceMarkedOnly(true);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceMarkedOnly`, true);
    },
  );
  const sidebarPerformanceReportShowAllCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_SHOW_ALL,
    async () => {
      operateTreeProvider.setPerformanceMarkedOnly(false);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceMarkedOnly`, false);
    },
  );
  const sidebarPerformanceFileOpenCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
    async (filePath: string, fileType: string) => {
      if (!filePath || !fileType) {
        return;
      }

      await operateTreeProvider.openPerformanceFile(filePath, fileType);
    },
  );
  const sidebarDumpTensorReportCopyPathCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_COPY_PATH,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const reportKey = resolveDumpTensorReportCommandKey(arg);

      if (!reportKey) {
        return;
      }

      await operateTreeProvider.copyDumpTensorReportPath(reportKey);
    },
  );
  const sidebarDumpTensorReportDownloadCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_DOWNLOAD,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const reportKey = resolveDumpTensorReportCommandKey(arg);

      if (!reportKey) {
        return;
      }

      await operateTreeProvider.downloadDumpTensorReport(reportKey);
    },
  );
  const sidebarDumpTensorReportMarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_MARK,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const reportKey = resolveDumpTensorReportCommandKey(arg);

      if (!reportKey) {
        return;
      }

      const report = operateTreeProvider.getDumpTensorReportByKey(reportKey);

      if (report?.marked) {
        return;
      }

      await operateTreeProvider.toggleDumpTensorReportMark(reportKey);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorMarkedOnly`, operateTreeProvider.isDumpTensorMarkedOnlyEnabled());
    },
  );
  const sidebarDumpTensorReportUnmarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_UNMARK,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] }
    }) => {
      const reportKey = resolveDumpTensorReportCommandKey(arg);

      if (!reportKey) {
        return;
      }

      const report = operateTreeProvider.getDumpTensorReportByKey(reportKey);

      if (!report?.marked) {
        return;
      }

      await operateTreeProvider.toggleDumpTensorReportMark(reportKey);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorMarkedOnly`, operateTreeProvider.isDumpTensorMarkedOnlyEnabled());
    },
  );
  const sidebarDumpTensorReportSortTimeCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_SORT_TIME,
    async () => {
      operateTreeProvider.toggleDumpTensorSortOrder();
    },
  );
  const sidebarDumpTensorReportFilterMarkedCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_FILTER_MARKED,
    async () => {
      operateTreeProvider.setDumpTensorMarkedOnly(true);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorMarkedOnly`, true);
    },
  );
  const sidebarDumpTensorReportShowAllCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_REPORT_SHOW_ALL,
    async () => {
      operateTreeProvider.setDumpTensorMarkedOnly(false);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorMarkedOnly`, false);
    },
  );
  const sidebarDumpTensorFileOpenCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_FILE_OPEN,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] };
    }) => {
      const resolved = resolveDumpTensorFileCommandArgs(arg);

      if (!resolved || !resolved.filePath) {
        return;
      }

      await operateTreeProvider.openDumpTensorFile(resolved.filePath, resolved.fileType);
    },
  );
  const sidebarDumpTensorFileCompareWithCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_FILE_COMPARE_WITH,
    async (arg: string | {
      id?: string;
      command?: { arguments?: unknown[] };
    }) => {
      const resolved = resolveDumpTensorFileCommandArgs(arg);

      if (!resolved || resolved.fileType !== 'bin' || !resolved.filePath) {
        return;
      }

      operateTreeProvider.beginDumpTensorCompareWithFile(resolved.filePath);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorComparing`, true);
    },
  );
  const sidebarDumpTensorCompareCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_COMPARE,
    async () => {
      operateTreeProvider.setDumpTensorCompareMode(true);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorComparing`, true);
    },
  );
  const sidebarDumpTensorCompareStartCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_COMPARE_START,
    async () => {
      await operateTreeProvider.startDumpTensorCompare();
      await vscode.commands.executeCommand(
        'setContext',
        `${CONTEXT_PREFIX}.dumpTensorComparing`,
        operateTreeProvider.isDumpTensorCompareModeEnabled(),
      );
    },
  );
  const sidebarDumpTensorCompareCancelCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_DUMP_TENSOR_COMPARE_CANCEL,
    async () => {
      operateTreeProvider.setDumpTensorCompareMode(false);
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.dumpTensorComparing`, false);
    },
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

      await homeMethods.setSelectedOperators({ operatorIds: chosen.map((item) => item.operator.id) });
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
    async (node?: { nodeId?: string }) => {
      const actionType = node?.nodeId ? nodeIdToQueueAction[node.nodeId] : undefined;

      if (actionType) {
        await dispatchStopOperatorAction({ actionType });
        await syncNativeQueueState();

        return;
      }

      if (node?.nodeId === 'build' || node?.nodeId === 'run') {
        await dispatchStopCompileRunFlow({ nodeId: node.nodeId });
        operateTreeProvider.clearFlowExecutionState();
        await syncNativeQueueState();

        return;
      }

      await dispatchStopTask();
      operateTreeProvider.clearFlowExecutionState();
      await syncNativeQueueState();
    },
  );

  const sidebarStopAllOperatorActionsCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_STOP_ALL_OPERATOR_ACTIONS,
    async () => {
      await dispatchStopAllFlowActions();
      operateTreeProvider.clearFlowExecutionState();
      await syncNativeQueueState();
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

  // The last-project-path storage is unused — the clear command has nothing to
  // clear, just the toast.
  const clearLastProjectPathCommand = vscode.commands.registerCommand(
    COMMAND_CLEAR_LAST_PROJECT_PATH,
    async () => {
      vscode.window.showInformationMessage(t('extension.clearedProjectPath'));
    },
  );

  const resetProjectConfigurationCommand = vscode.commands.registerCommand(
    COMMAND_RESET_PROJECT_CONFIGURATION,
    async () => {
      await resetCurrentProjectConfiguration();
    },
  );

  // Register the command to create an operator project, and the callback function will be executed.
  const createOptionsCommand = vscode.commands.registerCommand(
    COMMAND_CREATE_DIRECTORY,
    async (
      data: {
        createOperatorProjectDirectoryFileType: OperatorProjectViewIdValue;
        subOperatorContext?: {
          parentProjectPath: string;
          opName: string;
          outputPath: string;
          skipFileGeneration?: boolean;
        };
      },
      progress: vscode.Progress<{
        message?: string;
        increment?: number
      }>,
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

  const welcomeShowCount =
    context.globalState.get<number>('welcomeShowCount') ?? 0;

  console.log(welcomeShowCount, 'Welcome show count');

  if (welcomeShowCount < 1) {
    await vscode.commands.executeCommand(COMMAND_WELCOME);
    await focusOpsOperateViewContainer();
    await context.globalState.update('welcomeShowCount', welcomeShowCount + 1);
  }

  // Simulation / on-board quick options panels (collection picker)
  const simulatorOptionsProvider = new WebviewProvider(context, apiServer);
  const onBoardOptionsProvider = new WebviewProvider(context, apiServer);
  const simulatorOptionsCommand = vscode.commands.registerCommand(
    COMMAND_SIMULATOR_OPTIONS,
    async () => {
      // Capture the active .py target now, while the editor still has focus. The panel
      // opens in ViewColumn.Active and displaces it, so startSimulate (Start in the webview)
      // could otherwise no longer read the active file and would abort with "open a .py".
      if (!(await buildService.captureActiveFileTargetForOptionsPanel())) {
        return;
      }

      simulatorOptionsProvider.show(VIEW_OPTIONS_SIMULATOR);
    },
  );

  const onBoardOptionsCommand = vscode.commands.registerCommand(
    COMMAND_ON_BOARD_OPTIONS,
    async () => {
      // Capture the active .py target before opening the panel (ViewColumn.Active displaces
      // it), so startOnBoard can read the target after the webview takes focus.
      if (!(await buildService.captureActiveFileTargetForOptionsPanel())) {
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
      // Capture the active .py target now, while the editor still has focus. The panel
      // opens in ViewColumn.Active and displaces it, so runSanitizer (Start in the webview)
      // could otherwise no longer read the active file and would abort with "open a .py".
      if (!(await sanitizerService.captureActiveFileTargetForOptionsPanel())) {
        return;
      }

      sanitizerOptionsProvider.show(VIEW_OPTIONS_SANITIZER);
    },
  );

  // A5 new-tool (npu-compute / npu-emulate) unified "数据采集配置" dialog. The entry
  // command stashes the collection type (on-board / simulation) via
  // setPendingDataCollectionType before invoking this, so the panel preselects it.
  // Constructed after the sanitizer provider so the pre-existing WebviewProvider
  // construction indices (relied on by extension-activation.spec) stay stable.
  const dataCollectionConfigProvider = new WebviewProvider(context, apiServer);
  const dataCollectionConfigCommand = vscode.commands.registerCommand(
    COMMAND_DATA_COLLECTION_CONFIG,
    async () => {
      // Capture the active .py target before the panel takes focus (ViewColumn.Active
      // displaces it), so startNewToolCollection can read the target afterwards.
      if (!(await buildService.captureActiveFileTargetForOptionsPanel())) {
        return;
      }

      dataCollectionConfigProvider.show(VIEW_DATA_COLLECTION_CONFIG);
    },
  );

  // Subscription to destruction event
  context.subscriptions.push(apiServer);
  context.subscriptions.push(createOptionsCommand);
  context.subscriptions.push(openCommand);
  context.subscriptions.push(openProjectCommand);
  context.subscriptions.push(welcomeCommand);
  context.subscriptions.push(clearWelcomeCountCommand);
  context.subscriptions.push(clearLastProjectPathCommand);
  context.subscriptions.push(resetProjectConfigurationCommand);
  // Note: createOptionsCommand has been added above, do not add it again
  context.subscriptions.push(getHome);
  context.subscriptions.push(createOperatorInWorkspaceCommand);
  context.subscriptions.push(simulatorOptionsCommand);
  context.subscriptions.push(onBoardOptionsCommand);
  context.subscriptions.push(dataCollectionConfigCommand);
  context.subscriptions.push(sanitizerOptionsCommand);
  context.subscriptions.push(sidebarProjectConfigCommand);
  context.subscriptions.push(sidebarResetProjectConfigurationCommand);
  context.subscriptions.push(sidebarBuildCommand);
  context.subscriptions.push(sidebarRunCommand);
  context.subscriptions.push(sidebarCpuDebugCommand);
  context.subscriptions.push(sidebarNpuDebugCommand);
  context.subscriptions.push(sidebarSanitizerCommand);
  context.subscriptions.push(sidebarOnBoardCommand);
  context.subscriptions.push(sidebarSimulationCommand);
  context.subscriptions.push(sidebarUtTestCommand);
  context.subscriptions.push(sidebarStTestCommand);
  context.subscriptions.push(stTestOptionsProvider);
  context.subscriptions.push(sidebarDumpTensorCommand);
  context.subscriptions.push(sidebarDebugSettingsCommand);
  context.subscriptions.push(sidebarSanitizerSettingsCommand);
  context.subscriptions.push(sidebarOnBoardSettingsCommand);
  context.subscriptions.push(sidebarSimulationSettingsCommand);
  context.subscriptions.push(sidebarSelectOperatorsCommand);
  context.subscriptions.push(sidebarClearSelectedOperatorsCommand);
  context.subscriptions.push(sidebarSearchOperatorsCommand);
  context.subscriptions.push(sidebarClearOperatorProjectsSearchCommand);
  context.subscriptions.push(sidebarSelectAllOperatorsCommand);
  context.subscriptions.push(sidebarSelectAllCompiledOperatorsCommand);
  context.subscriptions.push(sidebarSelectAllPreparedOperatorsCommand);
  context.subscriptions.push(sidebarDeselectAllPreparedOperatorsCommand);
  context.subscriptions.push(sidebarStopFlowTaskCommand, sidebarStopAllOperatorActionsCommand);
  context.subscriptions.push(sidebarOpenWelcomeCommand);
  context.subscriptions.push(sidebarOpenHelpCommand);
  context.subscriptions.push(sidebarSanitizerReportSelectCommand);
  context.subscriptions.push(sidebarSanitizerReportCopyPathCommand);
  context.subscriptions.push(sidebarSanitizerReportToggleMarkCommand);
  context.subscriptions.push(sidebarSanitizerReportMarkCommand);
  context.subscriptions.push(sidebarSanitizerReportUnmarkCommand);
  context.subscriptions.push(sidebarSanitizerReportSortTimeCommand);
  context.subscriptions.push(sidebarSanitizerReportFilterMarkedCommand);
  context.subscriptions.push(sidebarSanitizerReportShowAllCommand);
  context.subscriptions.push(sidebarSanitizerReportAddCommand);
  context.subscriptions.push(sidebarSanitizerMessageJumpCommand);
  context.subscriptions.push(sidebarSanitizerMessageAiFixCommand);
  context.subscriptions.push(sidebarSanitizerStackJumpCommand);
  context.subscriptions.push(sidebarSanitizerResultsGroupByClassCommand);
  context.subscriptions.push(sidebarSanitizerResultsGroupByClassActiveCommand);
  context.subscriptions.push(sidebarSanitizerResultsGroupBySeverityCommand);
  context.subscriptions.push(sidebarSanitizerResultsGroupBySeverityActiveCommand);
  context.subscriptions.push(sidebarSanitizerResultsGroupByTypeCommand);
  context.subscriptions.push(sidebarSanitizerResultsGroupByTypeActiveCommand);
  context.subscriptions.push(sidebarSanitizerResultsGroupByFileCommand);
  context.subscriptions.push(sidebarSanitizerResultsGroupByFileActiveCommand);
  context.subscriptions.push(sidebarSanitizerResultsHideDuplicatesCommand);
  context.subscriptions.push(sidebarSanitizerResultsShowDuplicatesCommand);
  context.subscriptions.push(sidebarSanitizerResultsOpenGroupFileCommand);
  context.subscriptions.push(sidebarActionsQuickPickCommand);
  context.subscriptions.push(sidebarPerformanceReportSelectCommand);
  context.subscriptions.push(sidebarPerformanceReportCopyPathCommand);
  context.subscriptions.push(sidebarPerformanceReportDownloadCommand);
  context.subscriptions.push(sidebarPerformanceReportMarkCommand);
  context.subscriptions.push(sidebarPerformanceReportUnmarkCommand);
  context.subscriptions.push(sidebarPerformanceReportSortTimeCommand);
  context.subscriptions.push(sidebarPerformanceReportFilterMarkedCommand);
  context.subscriptions.push(sidebarPerformanceReportShowAllCommand);
  context.subscriptions.push(sidebarPerformanceFileOpenCommand);
  context.subscriptions.push(sidebarDumpTensorReportCopyPathCommand);
  context.subscriptions.push(sidebarDumpTensorReportDownloadCommand);
  context.subscriptions.push(sidebarDumpTensorReportMarkCommand);
  context.subscriptions.push(sidebarDumpTensorReportUnmarkCommand);
  context.subscriptions.push(sidebarDumpTensorReportSortTimeCommand);
  context.subscriptions.push(sidebarDumpTensorReportFilterMarkedCommand);
  context.subscriptions.push(sidebarDumpTensorReportShowAllCommand);
  context.subscriptions.push(sidebarDumpTensorFileOpenCommand);
  context.subscriptions.push(sidebarDumpTensorFileCompareWithCommand);
  context.subscriptions.push(sidebarDumpTensorCompareCommand);
  context.subscriptions.push(sidebarDumpTensorCompareStartCommand);
  context.subscriptions.push(sidebarDumpTensorCompareCancelCommand);

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
  // Automatic detection only occurs when the user explicitly opens the project.

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
    async (firstArg?: unknown) => {
      let targetUri: vscode.Uri | undefined;

      if (isExplorerResourceFileUri(firstArg)) {
        targetUri = firstArg;
      }

      if (!targetUri) {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          canSelectFolders: true,
          canSelectFiles: false,
          title: t('extension.addPerformanceVisualizationPickFolderTitle'),
          openLabel: t('common.selectFolder'),
        });

        targetUri = picked?.[0];

        if (!targetUri) {
          return;
        }
      }

      await FolderContextMenuService.addReportToFileMapList(targetUri, 'on_board');
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
  await vscode.commands.executeCommand('setContext', contextKey('operatorProjectMarked'), false);
  await vscode.commands.executeCommand('setContext', contextKey('multiOperatorProjectMarked'), false);
  await vscode.commands.executeCommand('setContext', contextKey('operatorProjectType'), '');

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

  // Binary .npu-rep / .npu.rep: Problems/Explorer open this URI as the editor;
  // hand off to the profiling-report panel instead of a text document.
  const npuRepEditorRegistration = vscode.window.registerCustomEditorProvider(
    NpuRepEditorProvider.viewType,
    new NpuRepEditorProvider(),
    {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true },
    },
  );

  context.subscriptions.push(npuRepEditorRegistration);

  // Register a command to open a CSV file
  const openCsvCommand = vscode.commands.registerCommand(
    COMMAND_OPEN_CSV,
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

  // Register a command to open any .rep / .ncrep profiling report.
  const openProfilingReportCommand = vscode.commands.registerCommand(
    COMMAND_OPEN_PROFILING_REPORT,
    async (uri?: vscode.Uri | string) => {
      // The new-tool flow invokes this with a plain report path string; accept
      // both a Uri and a string so .npu-rep reports open without a dialog.
      const target = typeof uri === 'string' ? vscode.Uri.file(uri) : uri;

      if (target && target.fsPath) {
        await ViewOpener.openProfilingReport(target);

        return;
      }

      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: t('common.open'),
        filters: {
          [t('profilingReport.reportFile')]: [
            'rep',
            'ncrep',
            'npu-rep',
          ],
          [t('common.allFiles')]: ['*'],
        },
      });

      if (fileUri && fileUri[0]) {
        await ViewOpener.openProfilingReport(fileUri[0]);
      }
    },
  );

  context.subscriptions.push(openProfilingReportCommand);

  // Re-publish the performance hints of a .npu-rep file and focus the Problems view.
  const showPerformanceHintsCommand = vscode.commands.registerCommand(
    COMMAND_SHOW_PERFORMANCE_HINTS,
    async (argument?: unknown) => {
      const filePath = resolvePerformanceHintsFilePath(argument);

      if (!filePath) {
        return;
      }

      await performanceHintsDiagnosticsService.showPerformanceHintsForFile(filePath);
    },
  );

  context.subscriptions.push(showPerformanceHintsCommand);

  const flashMsSanitizerRunData = vscode.commands.registerCommand(
    COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
    async (options?: { openLatest?: boolean }) => {
      await operateTreeProvider.flashSanitizerRunData(options);
    },
  );

  context.subscriptions.push(flashMsSanitizerRunData);

  const flashPerformanceRunData = vscode.commands.registerCommand(
    COMMAND_FLASH_PERFORMANCE_RUN_DATA,
    async (options?: { focusIfNew?: boolean;
      openIfNew?: boolean }) => {
      await operateTreeProvider.refreshPerformanceReports(options);
    },
  );

  context.subscriptions.push(flashPerformanceRunData);

  const flashDumpTensorData = vscode.commands.registerCommand(
    COMMAND_FLASH_DUMP_TENSOR_DATA,
    async (options?: { focusIfNew?: boolean }) => {
      await operateTreeProvider.refreshDumpTensorReports(options);
    },
  );

  context.subscriptions.push(flashDumpTensorData);

  const importDumpTensorBinFileCommand = vscode.commands.registerCommand(
    COMMAND_IMPORT_DUMP_TENSOR_BIN_FILE,
    async (uri?: vscode.Uri) => {
      try {
        let binFilePath: string | undefined;

        if (uri?.fsPath) {
          binFilePath = uri.fsPath;
        }
        else {
          const picks = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Binary Files': ['bin'] },
            title: t('extension.selectDumpTensorBinFile'),
          });

          if (!picks || picks.length === 0) {
            return;
          }

          binFilePath = picks[0].fsPath;
        }

        if (binFilePath) {
          // buildService.importDumpTensorBinFile already refreshes the results
          // tree with focusIfNew internally - no second flash here.
          await taskMethods.importDumpTensorBinFile({ binFilePath });
        }
      }
      catch (error) {
        console.error('Failed to import DumpTensor .bin file:', error);
        vscode.window.showErrorMessage(t('extension.importDumpTensorBinFailed'));
      }
    },
  );

  context.subscriptions.push(importDumpTensorBinFileCommand);

  // Workspace folder change listener
  const watchWorkSpaceFolderChange =
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      logDebug('event:onDidChangeWorkspaceFolders', { workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath) });
      console.log('Workspace changed', vscode.workspace.workspaceFolders);
      vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_DUMP_TENSOR_DATA);

      // Detect operator projects in the workspace
      const workspaceFolders = vscode.workspace.workspaceFolders;

      // Discard stale project cache when the primary workspace folder no longer
      // matches the cached path. Otherwise reads (devtool_config check, build
      // command generation) would keep targeting the previous workspace.
      const pm = ProjectManager.getInstance();
      const primaryPath = workspaceFolders?.[0]?.uri.fsPath;

      if (primaryPath && path.normalize(primaryPath) !== pm.projectPath) {
        pm.resetCachedProject();
      }

      if (workspaceFolders && workspaceFolders.length > 0) {
        const { WorkspaceDetectorService } = await import('./service/workspace-detector-service.js');

        for (const folder of workspaceFolders) {
          await WorkspaceDetectorService.detectAndRegisterWorkspace(folder.uri.fsPath)
            .catch((error) => {
              console.error('Failed to detect workspace operator project:', error);
            });
        }
      }

      await refreshSidebarContexts();
    });

  context.subscriptions.push(watchWorkSpaceFolderChange);

  const devtoolConfigWatcher = vscode.workspace.createFileSystemWatcher(`**/${getIdeConfigDirName()}/devtool_config.json`);
  const watchDevtoolConfigCreate = devtoolConfigWatcher.onDidCreate(async (uri) => {
    logDebug('event:devtoolConfigWatcher:create', uri.fsPath);
    await refreshSidebarContexts();
  });
  const watchDevtoolConfigChange = devtoolConfigWatcher.onDidChange(async (uri) => {
    logDebug('event:devtoolConfigWatcher:change', uri.fsPath);
    await refreshSidebarContexts();
  });
  const watchDevtoolConfigDelete = devtoolConfigWatcher.onDidDelete(async (uri) => {
    logDebug('event:devtoolConfigWatcher:delete', uri.fsPath);
    await refreshSidebarContexts();
  });

  context.subscriptions.push(devtoolConfigWatcher, watchDevtoolConfigCreate, watchDevtoolConfigChange, watchDevtoolConfigDelete);

  console.log('Activate', vscode.workspace.workspaceFolders);
  console.log('🧠 MindStudio plugin loader activated.');
  startPostActivateBootstrap({
    context,
    operateTreeProvider,
    logDebug,
  });
  logDebug('activate:end', {
    elapsedMs: Date.now() - activateStart,
    workspaceFolders: workspaceFolderPaths,
    postActivateBootstrapScheduled: true,
  });
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

export function deactivate() {
}
