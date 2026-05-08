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
import { OperateTreeProvider, type OperateNode } from './class/operate-tree-provider';
import {
  ApiServer, type ApiGroup,
} from './core/api-server';
import { ViewServer } from './core/view/view-server';
import { routes } from './routes';
import { apis } from './api-routes';
import { homeMethods } from './controller/home-controller';
import { taskMethods } from './controller/task-controller';
import { performanceDataMethods } from './controller/performance-controller';
import { PermanentStorage } from './class/permanent-storage';
import { ExtensionConfig } from './core/extension-config';
import { RemoteConfig } from './helpers/remote-config';
import { sanitizerDiagnosticsService } from './service/sanitizer-diagnostics.service';
import { msAgentBridgeService } from './service/ms-agent-bridge.service';
import { getDumpTensorPanelViewProvider } from './class/dump-tensor-panel-view';
import { appendLog } from './helpers/output-channel';

import { MindStudioPluginInstaller } from './class/mind-studio-plugin-installer';
import { registerOperatorPlugins } from './domain/plugins';
import { OperatorPluginRegistry } from './domain/plugins/operator-plugin.registry';
import {
  COMMAND_OPEN,
  COMMAND_WELCOME,
  COMMAND_CREATE_OPERATOR_IN_WORKSPACE,
  COMMAND_TOGGLE_OPS_OPERATE,
  COMMAND_CLEAR_WELCOME_COUNT,
  COMMAND_CLEAR_LAST_PROJECT_PATH,
  COMMAND_CREATE_DIRECTORY,
  COMMAND_GET_HOME,
  COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
  COMMAND_FLASH_DUMP_TENSOR_DATA,
  VIEW_NEW_PROJECT,
  VIEW_WELCOME,
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
} from './constants';
import { FolderContextMenuService } from './service/folder-context-menu-service';
import { buildService } from './service/build-service';
import { configService } from './service/config-service';
import { projectService } from './service/project-service';
import { OperatorProjectIconTheme } from './class/operator-project-icon-theme';
import { welcomeMethods } from './controller/welcome-controller';
import { registerSidebarContextsRefresh } from './helpers/sidebar-context-refresh';
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
  dispatchStopAllOperatorActions,
  dispatchStopTask,
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

function resolvePerformanceReportCommandKey(
  arg: string | { id?: string; command?: { arguments?: unknown[] } } | undefined,
): string {
  const raw = typeof arg === 'string'
    ? arg
    : String(arg?.command?.arguments?.[0] ?? arg?.id ?? '');
  if (raw.startsWith('performance-report:')) {
    return decodeURIComponent(raw.replace(/^performance-report:/, ''));
  }
  return raw;
}

/** Explorer context passes a `file:` URI; `view/title` often passes unrelated values (e.g. `TreeView`). */
function isExplorerResourceFileUri(candidate: unknown): candidate is vscode.Uri {
  return (
    candidate instanceof vscode.Uri
    && candidate.scheme === 'file'
    && candidate.fsPath.trim().length > 0
  );
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
  const debugTag = '[op-devtools][activate]';
  const logDebug = (...args: unknown[]) => {
    const [message, payload] = args;
    appendLog(debugTag, String(message ?? ''), payload);
  };
  logDebug('activate:start', {
    workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
  });

  extensionContext = context;
  (
    globalThis as unknown as { extensionContext: vscode.ExtensionContext }
  ).extensionContext = context;

  // Register all operator-type plugins and project-type detectors.
  // Must be called before any code that uses OperatorPluginRegistry.
  registerOperatorPlugins();
  sanitizerDiagnosticsService.activate(context);

  // api interface
  const apiServer = initApiServer();

  // Internationalization (i18n)
  await initI18n();

  // Whether devtool_config.json exists (drives command visibility)
  let hasDevtoolConfig = await checkDevtoolConfigExists();

  const homeTreeProvider = new HomeTreeProvider();
  const operateTreeProvider = new OperateTreeProvider(context.extensionUri, 'flow', context);
  OperateTreeProvider.registerOperateFlowTreeProvider(operateTreeProvider);
  const operatorProjectsTreeProvider = new OperateTreeProvider(context.extensionUri, 'operatorProjects', context);
  let isSyncingWorkspaceSettings = false;
  let isRefreshingSidebarContexts = false;
  let hasPendingSidebarRefresh = false;

  const hasSameSettingValue = (current: unknown, next: unknown): boolean => {
    if (Object.is(current, next)) {
      return true;
    }
    if (
      current
      && next
      && typeof current === 'object'
      && typeof next === 'object'
    ) {
      try {
        return JSON.stringify(current) === JSON.stringify(next);
      }
      catch {
        return false;
      }
    }
    return false;
  };

  const getOpDevtoolsObject = (scopeUri?: vscode.Uri): Record<string, unknown> => {
    const value = vscode.workspace
      .getConfiguration(undefined, scopeUri)
      .get<Record<string, unknown>>('op-devtools', {});
    return { ...(value || {}) };
  };

  const getValueByPath = (obj: Record<string, unknown>, path: string): unknown => {
    const segments = path.split('.');
    let current: unknown = obj;
    for (const segment of segments) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  };

  const setValueByPath = (obj: Record<string, unknown>, path: string, value: unknown): void => {
    const segments = path.split('.');
    let cursor = obj;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      const next = cursor[segment];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = value;
  };

  const getDeclaredOpDevtoolsDottedKeys = (): string[] => {
    const prefix = 'op-devtools.';
    const contributes = (context.extension.packageJSON as { contributes?: { configuration?: unknown } }).contributes;
    const configuration = contributes?.configuration;
    const blocks = Array.isArray(configuration) ? configuration : [configuration];
    const keys = new Set<string>();

    for (const block of blocks) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      const properties = (block as { properties?: Record<string, unknown> }).properties;
      if (!properties || typeof properties !== 'object') {
        continue;
      }

      for (const key of Object.keys(properties)) {
        if (!key.startsWith(prefix)) {
          continue;
        }
        const relativeKey = key.slice(prefix.length);
        if (relativeKey.length === 0) {
          continue;
        }
        keys.add(relativeKey);
      }
    }

    return Array.from(keys);
  };

  const DOTTED_OP_DEVTOOLS_KEYS = getDeclaredOpDevtoolsDottedKeys();

  const normalizeDottedOpDevtoolsWorkspaceSettings = async (): Promise<boolean> => {
    try {
      const cfg = vscode.workspace.getConfiguration('op-devtools');
      const nextSettings = getOpDevtoolsObject();
      let changed = false;

      for (const relativeKey of DOTTED_OP_DEVTOOLS_KEYS) {
        const inspection = cfg.inspect<unknown>(relativeKey);
        if (!inspection || inspection.workspaceValue === undefined) {
          continue;
        }
        setValueByPath(nextSettings, relativeKey, inspection.workspaceValue);
        await cfg.update(relativeKey, undefined, vscode.ConfigurationTarget.Workspace);
        changed = true;
      }

      if (!changed) {
        return false;
      }

      await vscode.workspace.getConfiguration().update(
        'op-devtools',
        nextSettings,
        vscode.ConfigurationTarget.Workspace,
      );
      return true;
    }
    catch (error) {
      console.warn('[normalizeDottedOpDevtoolsWorkspaceSettings] failed:', error);
      return false;
    }
  };

  const syncOperatorProjectWorkspaceSettings = async () => {
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

    isSyncingWorkspaceSettings = true;
    const syncStart = Date.now();
    logDebug('syncOperatorProjectWorkspaceSettings:start');
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
      const projectSocVersion =
        (await projectService.getProjectSocVersion()).trim() || 'ascend910b';

      const buildOpOpts = (buildOp?.user_options || {}) as Record<string, unknown>;
      const buildExampleOpts = (buildExample?.user_options || {}) as Record<string, unknown>;
      const simulateOpts = (simulate?.user_options || {}) as Record<string, unknown>;
      const onBoardOpts = (onBoard?.user_options || {}) as Record<string, unknown>;
      const utTestOpts = (utTest?.user_options || {}) as Record<string, unknown>;
      const sanitizerOpts = (sanitizer?.user_options || {}) as Record<string, unknown>;
      const cfg = vscode.workspace.getConfiguration('op-devtools');
      const nextSettings = getOpDevtoolsObject();
      let changed = false;
      const syncSettingIfUnset = (key: string, value: unknown) => {
        if (value === undefined) {
          return;
        }
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
        const current = getValueByPath(nextSettings, key);
        if (hasSameSettingValue(current, value)) {
          return;
        }
        setValueByPath(nextSettings, key, value);
        changed = true;
      };

      syncSettingIfUnset('compileAndDeploy.buildConfig.operatorNameToCompile', buildOpOpts.op);
      syncSettingIfUnset('compileAndDeploy.buildConfig.deployCommandOrRunCommand', buildOpOpts.target_file);
      syncSettingIfUnset('compileAndDeploy.buildConfig.compileCommand', buildOpOpts.script);
      syncSettingIfUnset('compileAndDeploy.buildConfig.cpuDebugCompileCommand', buildOpOpts.cpu_debug_script);
      syncSettingIfUnset('compileAndDeploy.buildConfig.npuDebugCompileCommand', buildOpOpts.npu_debug_script);
      syncSettingIfUnset('compileAndDeploy.buildConfig.sanitizerCompileCommand', sanitizerOpts.script);
      syncSettingIfUnset('compileAndDeploy.buildConfig.onBoardCompileCommand', onBoardOpts.script);
      syncSettingIfUnset('compileAndDeploy.buildConfig.simulationCompileCommand', simulateOpts.script);
      syncSettingIfUnset('compileAndDeploy.buildConfig.utTestCompileCommand', utTestOpts.script);

      const shouldExposeExampleBuildConfig = Boolean(multiResult.isStandardCustom && multiResult.hasMultiple);
      if (shouldExposeExampleBuildConfig) {
        syncSettingIfUnset('compileAndDeploy.exampleBuildConfig.executionMode', buildExampleOpts.execution_mode);
        syncSettingIfUnset('compileAndDeploy.exampleBuildConfig.runCommand', buildExampleOpts.script);
      }

      syncSettingIfUnset('sanitizer.reportLogLevel', sanitizerOpts.logLevel);
      syncSettingIfUnset('sanitizer.maxSingleLogFileSize', sanitizerOpts.maxDebuglogSize);
      const sanitizerTool = (sanitizerOpts.tool || {}) as Record<string, unknown>;
      const sanitizerMemcheckOption = (sanitizerOpts.memcheckOption || {}) as Record<string, unknown>;
      syncSettingIfUnset('sanitizer.memory', sanitizerTool.memcheck);
      syncSettingIfUnset('sanitizer.race', sanitizerTool.racecheck);
      syncSettingIfUnset('sanitizer.uninitialized', sanitizerTool.initcheck);
      syncSettingIfUnset('sanitizer.memoryLeak', sanitizerMemcheckOption['leak-check']);
      syncSettingIfUnset('sanitizer.allocUnused', sanitizerMemcheckOption['check-unused-memory']);
      const useBlock = sanitizerOpts.useBlock;
      if (typeof useBlock === 'boolean') {
        syncSettingIfUnset('sanitizer.detectionScope', useBlock ? 'singleBlock' : 'global');
      }
      syncSettingIfUnset('sanitizer.blockId', sanitizerOpts.blockId ?? null);

      syncSettingIfUnset('performanceTuning.simulation.simulatorType', simulateOpts.simulatorType);
      syncSettingIfUnset(
        'performanceTuning.simulation.memoryThroughputWaveform',
        simulateOpts.PMSampling,
      );
      syncSettingIfUnset(
        'performanceTuning.simulation.resourceConflictRatio',
        simulateOpts.ResourceConflictRatio,
      );
      syncSettingIfUnset(
        'performanceTuning.simulation.parameters',
        toKeyValueMap(simulateOpts.advance_param),
      );
      syncSettingIfUnset('performanceTuning.onBoard.interCoreLoad', onBoardOpts.Occupancy);
      syncSettingIfUnset('performanceTuning.onBoard.roofline', onBoardOpts.Roofline);
      syncSettingIfUnset('performanceTuning.onBoard.operatorCodeHotspot', onBoardOpts.Source);
      syncSettingIfUnset('performanceTuning.onBoard.cacheHeatmap', onBoardOpts.MemoryDetail);
      syncSettingIfUnset(
        'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
        onBoardOpts.ArithmeticUtilization,
      );
      syncSettingIfUnset('performanceTuning.onBoard.l2CacheHitRate', onBoardOpts.L2Cache);
      syncSettingIfUnset(
        'performanceTuning.onBoard.memoryReadWriteBandwidth',
        onBoardOpts.Memory,
      );
      syncSettingIfUnset('performanceTuning.onBoard.l0ReadWriteBandwidth', onBoardOpts.MemoryL0);
      syncSettingIfUnset('performanceTuning.onBoard.ubReadWriteBandwidth', onBoardOpts.MemoryUB);
      syncSettingIfUnset(
        'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
        onBoardOpts.PipeUtilization,
      );
      syncSettingIfUnset(
        'performanceTuning.onBoard.resourceConflictRatio',
        onBoardOpts.ResourceConflictRatio,
      );
      syncSettingIfUnset('performanceTuning.onBoard.enableKernelCodeSegmentProfiling', onBoardOpts.KernelScale);
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
      syncSettingIfUnset('performanceTuning.onBoard.operatorMetrics', allMetricEnabled);
      syncSettingIfUnset(
        'performanceTuning.onBoard.parameters',
        toKeyValueMap(onBoardOpts.advance_param),
      );
      syncSettingIfUnset('environment.environmentScript', projectSH);
      syncSettingIfUnset('environment.socVersion', projectSocVersion);

      if (changed) {
        await vscode.workspace.getConfiguration().update(
          'op-devtools',
          nextSettings,
          vscode.ConfigurationTarget.Workspace,
        );
      }
    }
    catch (error) {
      logDebug('syncOperatorProjectWorkspaceSettings:error', error);
      console.warn('[syncOperatorProjectWorkspaceSettings] failed:', error);
    }
    finally {
      isSyncingWorkspaceSettings = false;
      logDebug('syncOperatorProjectWorkspaceSettings:end', {
        elapsedMs: Date.now() - syncStart,
      });
    }
  };

  const refreshSidebarContexts = async () => {
    const refreshStart = Date.now();
    if (isRefreshingSidebarContexts) {
      hasPendingSidebarRefresh = true;
      logDebug('refreshSidebarContexts:coalesced', {
        hasPendingSidebarRefresh,
        isSyncingWorkspaceSettings,
      });
      return;
    }
    isRefreshingSidebarContexts = true;
    logDebug('refreshSidebarContexts:start', {
      hasDevtoolConfig,
      isSyncingWorkspaceSettings,
    });
    try {
      do {
        hasPendingSidebarRefresh = false;
        hasDevtoolConfig = await checkDevtoolConfigExists();
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
        if (effectiveHasDevtoolConfig) {
          await syncOperatorProjectWorkspaceSettings();
        }
        await vscode.commands.executeCommand('setContext', 'hasDevtoolConfig', effectiveHasDevtoolConfig);
        await vscode.commands.executeCommand('setContext', 'opDevtools.showHomeTree', !effectiveHasDevtoolConfig);
        await vscode.commands.executeCommand('setContext', 'opDevtools.showOperateTree', effectiveHasDevtoolConfig);
        const { showOperatorSearch, showOperatorProjects } = await operateTreeProvider.refreshState(effectiveHasDevtoolConfig);
        // Keep both tree views in sync.
        await operatorProjectsTreeProvider.refreshState(effectiveHasDevtoolConfig);
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

  const queueActionToNodeId: Record<QueueableActionType, 'sanitizer' | 'onboard' | 'simulation' | 'utTest' | 'dumpTensor'> = {
    sanitizer: 'sanitizer',
    onboard: 'onboard',
    simulation: 'simulation',
    utTest: 'utTest',
    dumpTensor: 'dumpTensor',
  };

  const nodeIdToQueueAction: Partial<Record<string, QueueableActionType>> = {
    sanitizer: 'sanitizer',
    onboard: 'onboard',
    simulation: 'simulation',
    utTest: 'utTest',
    dumpTensor: 'dumpTensor',
  };

  const syncNativeQueueState = async () => {
    try {
      const { items } = await dispatchGetOperatorActionQueueStatus();
      await vscode.commands.executeCommand(
        'setContext',
        'opDevtools.operatorActionQueueStopAllVisible',
        items.length >= 2,
      );
      const states: Partial<Record<'sanitizer' | 'onboard' | 'simulation' | 'utTest' | 'dumpTensor', 'queued' | 'running' | 'cancel_failed'>> = {};
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
      await vscode.commands.executeCommand('setContext', 'opDevtools.operatorActionQueueStopAllVisible', false);
    }
  };

  registerSidebarContextsRefresh(refreshSidebarContexts);

  await refreshSidebarContexts();
  await syncNativeQueueState();

  const queueStatusTimer = setInterval(() => {
    void syncNativeQueueState();
  }, 1000);
  context.subscriptions.push({
    dispose: () => clearInterval(queueStatusTimer),
  });

  const watchColorThemeChange = vscode.window.onDidChangeActiveColorTheme(async () => {
    logDebug('event:onDidChangeActiveColorTheme');
    await refreshSidebarContexts();
  });
  context.subscriptions.push(watchColorThemeChange);

  const watchOpDevtoolsEnvAndOperatorConfig = vscode.workspace.onDidChangeConfiguration(async (e) => {
    const envAffected = e.affectsConfiguration('op-devtools.environment');
    const operatorAffected = e.affectsConfiguration('op-devtools.operatorProject');
    const operatorSupportAffected = e.affectsConfiguration('op-devtools.operatorSupport');
    const tritonSupportAffected = e.affectsConfiguration('op-devtools.operatorSupport.triton');
    const opDevtoolsAffected = e.affectsConfiguration('op-devtools');
    logDebug('event:onDidChangeConfiguration', {
      isSyncingWorkspaceSettings,
      envAffected,
      operatorAffected,
      operatorSupportAffected,
      tritonSupportAffected,
      opDevtoolsAffected,
    });
    if (isSyncingWorkspaceSettings) {
      logDebug('event:onDidChangeConfiguration:ignoredDueToSync');
      return;
    }
    if (opDevtoolsAffected) {
      isSyncingWorkspaceSettings = true;
      try {
        const normalized = await normalizeDottedOpDevtoolsWorkspaceSettings();
        if (normalized) {
          logDebug('event:onDidChangeConfiguration:normalizedDottedOpDevtoolsSettings');
          return;
        }
      }
      finally {
        isSyncingWorkspaceSettings = false;
      }
    }
    if (
      envAffected
      || operatorAffected
      || operatorSupportAffected
    ) {
      logDebug('event:onDidChangeConfiguration:syncAscendEnvScriptFromWorkspaceSettings:start');
      await projectService.syncAscendEnvScriptFromWorkspaceSettings();
      logDebug('event:onDidChangeConfiguration:syncAscendEnvScriptFromWorkspaceSettings:end');
      operateTreeProvider.notifyConfigurationChanged();
      operatorProjectsTreeProvider.notifyConfigurationChanged();
    }

    if (tritonSupportAffected) {
      const reloadAction = t('extension.reloadWindowAction');
      const message = t('extension.tritonSupportChangedReload');
      const pick = await vscode.window.showInformationMessage(message, reloadAction);
      if (pick === reloadAction) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
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
  const sanitizerResultsPanelProvider: vscode.TreeDataProvider<OperateNode> = {
    onDidChangeTreeData: operateTreeProvider.onDidChangeTreeData,
    getTreeItem: (element) => operateTreeProvider.getTreeItem(element),
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
  const sanitizerResultsTreeView = vscode.window.createTreeView('opdevtoolsSanitizerResultsTree', {
    treeDataProvider: sanitizerResultsPanelProvider,
    showCollapseAll: false,
  });
  const performanceResultsPanelProvider: vscode.TreeDataProvider<OperateNode> = {
    onDidChangeTreeData: operateTreeProvider.onDidChangeTreeData,
    getTreeItem: (element) => operateTreeProvider.getTreeItem(element),
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
  const performanceResultsTreeView = vscode.window.createTreeView('opdevtoolsPerformanceResultsTree', {
    treeDataProvider: performanceResultsPanelProvider,
    showCollapseAll: false,
  });
  const operatorProjectsTreeView = vscode.window.createTreeView('opdevtoolsOperatorProjectsTree', {
    treeDataProvider: operatorProjectsTreeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(
    homeTreeView,
    operateTreeView,
    sanitizerResultsTreeView,
    performanceResultsTreeView,
    operatorProjectsTreeView,
    toggleOpsOperateCommand,
  );
  await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerDuplicatesHidden', operateTreeProvider.isSanitizerHideDuplicatesEnabled());
  await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerMarkedOnly', operateTreeProvider.isSanitizerMarkedOnlyEnabled());
  await vscode.commands.executeCommand('setContext', 'opDevtools.performanceMarkedOnly', operateTreeProvider.isPerformanceMarkedOnlyEnabled());
  await vscode.commands.executeCommand('setContext', 'opDevtools.performanceReportSelected', false);
  await vscode.commands.executeCommand('setContext', 'opDevtools.performanceSelectedReportMarked', false);
  await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', operateTreeProvider.getSanitizerResultsGroupBy());
  await vscode.commands.executeCommand(
    'setContext',
    'opDevtools.sanitizerAiFixAvailable',
    await msAgentBridgeService.isMsAgentIntegrationAvailable(),
  );
  // Load sanitizer report tree data only after Actions/Operators views are initialized.

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

  const getCompileOptionFromSelection = async (): Promise<string | undefined> => {
    const selectedIds = await homeMethods.getSelectedOperatorIds() || [];
    if (selectedIds.length === 0) {
      return undefined;
    }
    const multiple = await homeMethods.checkMultipleOperators();
    if (!multiple.isStandardCustom || !multiple.operators) {
      return undefined;
    }
    const selectedSet = new Set(selectedIds);
    const hasExperimental = multiple.operators.some((op) => selectedSet.has(op.id) && op.isExperimental);
    return hasExperimental ? '--experimental' : undefined;
  };

  const sidebarBuildCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_BUILD,
    async () =>
      operateTreeProvider.runFlowAction('build', async () => {
        const operatorNames = await getOperatorNamesFromSelection();
        await dispatchStartBuild({ operatorNames });
      }),
  );

  const sidebarRunCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_RUN,
    async () => {
      await operateTreeProvider.runFlowAction('run', async () => {
        if (operateTreeProvider.hasMultipleOperators()) {
          const operatorNames = await getOperatorNamesFromSelection();
          const compileOption = await getCompileOptionFromSelection();
          const operatorType = operateTreeProvider.isStandardCustomContext() ? 'standard-custom' : undefined;
          await dispatchStartBuildExample({ operatorNames, operatorType, compileOption });
          return;
        }
        await dispatchStartRun();
      });
    },
  );

  // Expand or close the sidebar based on whether the devtool_config.json file exists
  if (hasDevtoolConfig) {
    // Delay execution to ensure UI is ready
    setTimeout(async () => {
      try {
        console.log('[Extension] devtool_config.json found, focusing opdevtoolsOperateTree');
        await vscode.commands.executeCommand('opdevtoolsOperateTree.focus');
      }
      catch (error) {
        console.warn('[Extension] Failed to focus opdevtoolsOperateTree:', error);
      }
    }, 300);
  }
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
        await dispatchEnqueueNativeOperatorAction(
          'onboard',
          { operatorNames },
          dispatchStartOnBoard,
          async () => {
            await operateTreeProvider.refreshPerformanceReports();
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
        await dispatchEnqueueNativeOperatorAction(
          'simulation',
          { operatorNames },
          dispatchStartSimulate,
          async () => {
            await operateTreeProvider.refreshPerformanceReports();
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
      await operateTreeProvider.runFlowAction('utTest', async () => {
        await dispatchEnqueueNativeOperatorAction('utTest', { operatorNames }, dispatchStartUtTest);
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
        await dispatchEnqueueNativeOperatorAction(
          'dumpTensor',
          { operatorNames, compileOption },
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
  const sidebarSanitizerReportSelectCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_SELECT,
    async (reportPath: string) => {
      await operateTreeProvider.selectSanitizerReport(reportPath);
    },
  );
  const sidebarSanitizerReportCopyPathCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH,
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerMarkedOnly', operateTreeProvider.isSanitizerMarkedOnlyEnabled());
    },
  );
  const sidebarSanitizerReportMarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_MARK,
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerMarkedOnly', operateTreeProvider.isSanitizerMarkedOnlyEnabled());
    },
  );
  const sidebarSanitizerReportUnmarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK,
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerMarkedOnly', operateTreeProvider.isSanitizerMarkedOnlyEnabled());
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
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerMarkedOnly', true);
    },
  );
  const sidebarSanitizerReportShowAllCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_REPORT_SHOW_ALL,
    async () => {
      operateTreeProvider.setSanitizerMarkedOnly(false);
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerMarkedOnly', false);
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
          [t('web.sanitizerPanel.sanitizerResult')]: ['log', '*'],
        },
      });
      const filePath = picked?.[0]?.fsPath;
      if (!filePath) {
        return;
      }
      await vscode.window.withProgress(
        {
          location: { viewId: 'opdevtoolsSanitizerResultsTree' },
        },
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
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
    async (params: { fileLink: string; row: number; col: number; errorTitle?: string; errorMessage?: string }) => {
      await performanceDataMethods.jumpToFile(params);
    },
  );
  const sidebarSanitizerResultsGroupByClassCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_CLASS,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('class');
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', 'class');
    },
  );
  const sidebarSanitizerResultsGroupByClassActiveCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_CLASS_ACTIVE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('class');
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', 'class');
    },
  );
  const sidebarSanitizerResultsGroupBySeverityCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_SEVERITY,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('severity');
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', 'severity');
    },
  );
  const sidebarSanitizerResultsGroupBySeverityActiveCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_SEVERITY_ACTIVE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('severity');
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', 'severity');
    },
  );
  const sidebarSanitizerResultsGroupByTypeCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_TYPE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('type');
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', 'type');
    },
  );
  const sidebarSanitizerResultsGroupByTypeActiveCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_TYPE_ACTIVE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('type');
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', 'type');
    },
  );
  const sidebarSanitizerResultsGroupByFileCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_FILE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('file');
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', 'file');
    },
  );
  const sidebarSanitizerResultsGroupByFileActiveCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_FILE_ACTIVE,
    async () => {
      operateTreeProvider.setSanitizerResultsGroupBy('file');
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerResultsGroupBy', 'file');
    },
  );
  const sidebarSanitizerResultsHideDuplicatesCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_HIDE_DUPLICATES,
    async () => {
      operateTreeProvider.setSanitizerHideDuplicates(true);
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerDuplicatesHidden', true);
    },
  );
  const sidebarSanitizerResultsShowDuplicatesCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_SANITIZER_RESULTS_SHOW_DUPLICATES,
    async () => {
      operateTreeProvider.setSanitizerHideDuplicates(false);
      await vscode.commands.executeCommand('setContext', 'opDevtools.sanitizerDuplicatesHidden', false);
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
      const [, encodedReportPath, mode, encodedGroupKey] = raw.split(':');
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
        const children = await Promise.resolve(
          operateTreeProvider.getChildren(node as never),
        );
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
      operateTreeProvider.selectPerformanceReport(reportKey);
      const selected = operateTreeProvider.getSelectedPerformanceReport();
      await vscode.commands.executeCommand('setContext', 'opDevtools.performanceReportSelected', Boolean(selected));
      await vscode.commands.executeCommand('setContext', 'opDevtools.performanceSelectedReportMarked', Boolean(selected?.marked));
    },
  );
  const sidebarPerformanceReportCopyPathCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH,
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
      await vscode.commands.executeCommand('setContext', 'opDevtools.performanceMarkedOnly', operateTreeProvider.isPerformanceMarkedOnlyEnabled());
      await vscode.commands.executeCommand('setContext', 'opDevtools.performanceSelectedReportMarked', Boolean(selected?.marked));
    },
  );
  const sidebarPerformanceReportUnmarkCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_UNMARK,
    async (arg: string | { id?: string; command?: { arguments?: unknown[] } }) => {
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
      await vscode.commands.executeCommand('setContext', 'opDevtools.performanceMarkedOnly', operateTreeProvider.isPerformanceMarkedOnlyEnabled());
      await vscode.commands.executeCommand('setContext', 'opDevtools.performanceSelectedReportMarked', Boolean(selected?.marked));
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
      await vscode.commands.executeCommand('setContext', 'opDevtools.performanceMarkedOnly', true);
    },
  );
  const sidebarPerformanceReportShowAllCommand = vscode.commands.registerCommand(
    COMMAND_SIDEBAR_PERFORMANCE_REPORT_SHOW_ALL,
    async () => {
      operateTreeProvider.setPerformanceMarkedOnly(false);
      await vscode.commands.executeCommand('setContext', 'opDevtools.performanceMarkedOnly', false);
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
    async (node?: { nodeId?: string }) => {
      const actionType = node?.nodeId ? nodeIdToQueueAction[node.nodeId] : undefined;
      if (actionType) {
        await dispatchStopOperatorAction({ actionType });
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
      await dispatchStopAllOperatorActions();
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
      data: { createOperatorProjectDirectoryFileType: OperatorProjectViewIdValue },
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
      await operateTreeProvider.refreshSanitizerReports(true);
    },
  );

  context.subscriptions.push(flashMsSanitizerRunData);

  const flashPerformanceRunData = vscode.commands.registerCommand(
    COMMAND_FLASH_PERFORMANCE_RUN_DATA,
    async () => {
      await operateTreeProvider.refreshPerformanceReports();
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
      logDebug('event:onDidChangeWorkspaceFolders', {
        workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
      });
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

    const applyMetricKeys = async (target: vscode.ConfigurationTarget, scopeUri?: vscode.Uri) => {
      const nextSettings = getOpDevtoolsObject(scopeUri);
      metricKeys.forEach((k) => setValueByPath(nextSettings, k, desired));
      await vscode.workspace.getConfiguration(undefined, scopeUri).update(
        'op-devtools',
        nextSettings,
        target,
      );
    };

    const applyForWorkspace = async () => {
      await applyMetricKeys(vscode.ConfigurationTarget.Workspace);
    };

    const applyForGlobal = async () => {
      await applyMetricKeys(vscode.ConfigurationTarget.Global);
    };

    const applyForAllFolders = async () => {
      const folders = vscode.workspace.workspaceFolders || [];
      await Promise.all(
        folders.map(async (folder) => {
          await applyMetricKeys(vscode.ConfigurationTarget.WorkspaceFolder, folder.uri);
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

  // Detect current workspace when plugin is activated
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    // Delay execution to ensure the plugin is fully initialized
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    logDebug('activate:autoOpenProject:start', { workspacePath });
    try {
      await welcomeMethods.openProject({ projectPath: workspacePath || '' }, true);
      await operateTreeProvider.refreshSanitizerReports(false);
      await operateTreeProvider.refreshPerformanceReports();

      logDebug('activate:autoOpenProject:end');
    }
    catch (error) {
      logDebug('activate:autoOpenProject:error', error);
    }
  
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
