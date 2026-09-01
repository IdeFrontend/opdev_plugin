import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type {
  JumpToFileParams,
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
  PerformanceRunDataFolder,
} from '@shared/api-types';

import { homeMethods } from '@plugin/controller/home-controller';
import { SettingsLoader } from '@plugin/service/settings-loader';
import { parseNpuCheckStackFrame } from '@plugin/class/npu-check-parser';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { performanceDataMethods } from '@plugin/controller/performance-controller';
import { performanceMethods } from '@plugin/controller/performance-data-controller';
import { viewService } from '@plugin/service/view-service';
import { ensureEnvironmentScriptForOperateAction } from '@plugin/helpers/environment-script-guard';
import type { CompileRunGateUiState } from '@plugin/helpers/operator-compile-run-gate';
import { appendLog } from '@plugin/helpers/output-channel';
import { sanitizerDiagnosticsService } from '@plugin/service/sanitizer-diagnostics.service';
import { runDataService } from '@plugin/service/run-data-service';
import {
  getStTestSelectionState,
  shouldShowStTestAction,
} from '@plugin/helpers/st-test-action';
import {
  COMMAND_SIDEBAR_BUILD,
  COMMAND_SIDEBAR_CPU_DEBUG,
  COMMAND_SIDEBAR_DUMP_TENSOR,
  COMMAND_SIDEBAR_NPU_DEBUG,
  COMMAND_SIDEBAR_ON_BOARD,
  COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
  COMMAND_SIDEBAR_RUN,
  COMMAND_SIDEBAR_SANITIZER,
  COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP,
  COMMAND_SIDEBAR_SIMULATION,
  COMMAND_SIDEBAR_ST_TEST,
  COMMAND_SIDEBAR_UT_TEST,
  COMMAND_SIDEBAR_TOGGLE_OPERATOR,
  COMMAND_SIDEBAR_SANITIZER_STACK_JUMP,
} from '../constants';
import {
  CONTEXT_PREFIX,
  SETTINGS_PREFIX,
  TREE_VIEW_PERFORMANCE_RESULTS,
  TREE_VIEW_SANITIZER_RESULTS,
  treeItemContextKey,
} from '@shared/flavor';

export type OperateNodeId =
  | 'build'
  | 'run'
  | 'debug'
  | 'cpuDebug'
  | 'npuDebug'
  | 'sanitizer'
  | 'power'
  | 'onboard'
  | 'simulation'
  | 'utTest'
  | 'stTest'
  | 'dumpTensor'
  | 'sanitizerResultsRoot'
  | 'sanitizerReportsRoot'
  | 'sanitizerClass'
  | 'sanitizerMessage'
  | 'sanitizerReportItem'
  | 'performanceResultsRoot'
  | 'performanceReportItem'
  | 'performanceFolder'
  | 'performanceFile'
  | 'selectOperators'
  | 'selectedOperators'
  | 'operatorItem';

export interface OperateNode extends vscode.TreeItem {
  nodeId: OperateNodeId;
  sanitizerTooltipMeta?: {
    reportPath: string;
    globalIndex: number;
  };
}

type OperateSidebarState = {
  hasDevtoolConfig: boolean;
  debugModeEnabled: boolean;
  npuHardwareAvailable: boolean;
  remoteNpuHardwareAvailable: boolean;
  projectType: string;
  projectTemplateName: string;
  hasMultipleOperators: boolean;
  isStandardCustom: boolean;
  supportsSanitizerAndTuning: boolean;

  operators: Array<{
    id: number;
    name: string;
    hasEx: boolean;
    isCompiled: boolean;
  }>;

  searchKeyword: string;
  selectedOperatorIds: number[];
  sanitizer: {
    reports: SanitizerReportRecord[];
    sortOrder: 'asc' | 'desc';
    markedOnly: boolean;
    selectedReportPath?: string;
    selectedReportTitle?: string;
    selectedMessages: SanitizerMessageRecord[];
    resultsGroupBy: 'class' | 'severity' | 'type' | 'file';
    hideDuplicates: boolean;
    reportRevision: number;
    manualReports: SanitizerReportRecord[];
  };
  performance: {
    reports: PerformanceExecutionRecord[];
    sortOrder: 'asc' | 'desc';
    markedOnly: boolean;
    selectedReportKey?: string;
  };
};

type SanitizerReportRecord = {
  title: string;
  timestamp: number;
  id: string;
  path: string;
  marked: boolean;
};

type SanitizerMessageRecord = {
  title: string;
  type: 'error' | 'warning';
  questionType: string;
  question: string;
  msAgentIndex?: number;
  fileLink?: string;
  row?: number;
  col?: number;
  originData: string;
  sourceTool?: 'mssanitizer' | 'npu-check';
};

type SanitizerGroupMode = 'class' | 'severity' | 'type' | 'file';

type SanitizerMessageDerived = {
  classKey: string;
  classLabel: string;
  typeKey: string;
  typeLabel: string;
  fileKey: string;
  fileLabel: string;
  severityRank: number;
  tooltip?: vscode.MarkdownString;
};

type SanitizerGroupedReportNode = {
  key: string;
  label: string;
  description: string;
  contextValue?: string;
  messageIndices: number[];
};

const sanitizerQuestionLabelKeyMap = new Map<string, string>([
  [
    'illegal read of size',
    'exceptionParser.illegalRead',
  ],
  [
    'illegal write of size',
    'exceptionParser.illegalWrite',
  ],
  [
    'out of bounds of size',
    'exceptionParser.multiCoreStomp',
  ],
  [
    'misaligned access of size',
    'exceptionParser.unalignedAccess',
  ],
  [
    'LeakCheck: detected memory leaks',
    'exceptionParser.memoryLeak',
  ],
  [
    'direct leak of',
    'exceptionParser.memoryLeak',
  ],
  [
    'illegal free()',
    'exceptionParser.illegalFree',
  ],
  [
    'Unused memory',
    'exceptionParser.allocUnused',
  ],
  [
    'Potential RAW hazard detected',
    'exceptionParser.rawHazard',
  ],
  [
    'Potential WAW hazard detected',
    'exceptionParser.wawHazard',
  ],
  [
    'Potential WAR hazard detected',
    'exceptionParser.warHazard',
  ],
  [
    'uninitialized read of size',
    'exceptionParser.uninitException',
  ],
  [
    'Unpaired set_flag insetructions detected',
    'exceptionParser.syncException',
  ],
]);

const sanitizerQuestionHandlerKeyMap = new Map<string, string>([
  [
    'illegal read of size',
    'web.sanitizerPanel.handler.illegalRead',
  ],
  [
    'illegal write of size',
    'web.sanitizerPanel.handler.illegalWrite',
  ],
  [
    'out of bounds of size',
    'web.sanitizerPanel.handler.outOfBounds',
  ],
  [
    'misaligned access of size',
    'web.sanitizerPanel.handler.misalignedAccess',
  ],
  [
    'LeakCheck: detected memory leaks',
    'web.sanitizerPanel.handler.memoryLeak',
  ],
  [
    'direct leak of',
    'web.sanitizerPanel.handler.memoryLeak',
  ],
  [
    'illegal free()',
    'web.sanitizerPanel.handler.illegalFree',
  ],
  [
    'Unused memory',
    'web.sanitizerPanel.handler.unusedMemory',
  ],
  [
    'Potential RAW hazard detected',
    'web.sanitizerPanel.handler.rawHazard',
  ],
  [
    'Potential WAW hazard detected',
    'web.sanitizerPanel.handler.wawHazard',
  ],
  [
    'Potential WAR hazard detected',
    'web.sanitizerPanel.handler.warHazard',
  ],
  [
    'uninitialized read of size',
    'web.sanitizerPanel.handler.uninitializedRead',
  ],
  [
    'Unpaired set_flag insetructions detected',
    'web.sanitizerPanel.handler.unpairedSetFlag',
  ],
]);

const INITIAL_STATE: OperateSidebarState = {
  hasDevtoolConfig: false,
  debugModeEnabled: true,
  npuHardwareAvailable: false,
  remoteNpuHardwareAvailable: false,
  projectType: '',
  projectTemplateName: '',
  hasMultipleOperators: false,
  isStandardCustom: false,
  supportsSanitizerAndTuning: true,
  operators: [],
  searchKeyword: '',
  selectedOperatorIds: [],
  sanitizer: {
    reports: [],
    sortOrder: 'desc',
    markedOnly: false,
    selectedMessages: [],
    resultsGroupBy: 'class',
    hideDuplicates: false,
    reportRevision: 0,
    manualReports: [],
  },
  performance: {
    reports: [],
    sortOrder: 'desc',
    markedOnly: false,
  },
};

export type OperateTreeKind = 'flow' | 'operatorProjects';

export class OperateTreeProvider implements vscode.TreeDataProvider<OperateNode> {
  /**
   * Flow tree instance used by {@link OperateTreeProvider.runFlowActionFromWebview} (ops API / webview "Start now").
   * Set once from extension activation.
   */
  private static webviewOpsFlowProvider: OperateTreeProvider | null = null;

  static registerOperateFlowTreeProvider(provider: OperateTreeProvider | null): void {
    OperateTreeProvider.webviewOpsFlowProvider = provider;
  }

  /**
   * Same flow loading / inline-stop row state as {@link OperateTreeProvider.runFlowAction} for ops invoked from webviews (e.g. quick options "Start now").
   */
  static runFlowActionFromWebview<T>(
    nodeId: OperateNodeId,
    action: ()=> Promise<T>,
  ): Promise<T | undefined> {
    const p = OperateTreeProvider.webviewOpsFlowProvider;

    if (!p) {
      return action();
    }

    return p.runFlowAction(nodeId, action);
  }

  static runFlowActionFromWebviewWithParams<P, T>(
    nodeId: OperateNodeId,
    action: (params: P)=> Promise<T>,
    params: P,
  ): Promise<T | undefined> {
    return OperateTreeProvider.runFlowActionFromWebview(nodeId, () => action(params));
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly kind: OperateTreeKind = 'flow',
    context?: vscode.ExtensionContext,
  ) {
    if (context) {
      context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
        this.themedIconCache.clear();
        this.onDidChangeTreeDataEmitter.fire();
      }));
    }
  }

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private readonly onDidChangePerformanceTreeDataEmitter = new vscode.EventEmitter<void>();

  /** Performance results panel only — not fired when the Ops Operate flow tree updates. */
  readonly onDidChangePerformanceTreeData = this.onDidChangePerformanceTreeDataEmitter.event;

  private state: OperateSidebarState = { ...INITIAL_STATE };

  private selectionWorkspaceKey = '';
  private hasAppliedDefaultSelection = false;
  private readonly themedIconCache = new Map<string, vscode.Uri>();
  private readonly sanitizerReportMessagesCache = new Map<string, SanitizerMessageRecord[]>();
  private readonly sanitizerReportDerivedCache = new Map<string, SanitizerMessageDerived[]>();
  private readonly sanitizerVisibleMessagesCache = new Map<string, SanitizerMessageRecord[]>();
  private readonly sanitizerVisibleDerivedCache = new Map<string, SanitizerMessageDerived[]>();
  private readonly sanitizerFullDuplicateKeysCache = new Map<string, Map<number, string>>();
  private readonly sanitizerDedupeResultCache = new Map<string, {
    source: SanitizerMessageRecord[];
    filtered: SanitizerMessageRecord[];
  }>();
  private readonly sanitizerReportGroupsCache = new Map<string, Map<SanitizerGroupMode, SanitizerGroupedReportNode[]>>();
  private sanitizerReportRootNodesCache?: OperateNode[];
  private readonly sanitizerGroupNodesCache = new Map<string, OperateNode[]>();
  private readonly sanitizerGroupMessageNodesCache = new Map<string, OperateNode[]>();
  private readonly performanceNodesById = new Map<string, OperateNode[]>();
  private readonly performanceReportRootNodesByKey = new Map<string, OperateNode>();
  private performanceResultsTreeView?: vscode.TreeView<OperateNode>;
  private sanitizerResultsTreeView?: vscode.TreeView<OperateNode>;
  private performanceRefreshRevision = 0;
  private sanitizerRefreshRevision = 0;
  private performanceSelectionContextRevision = 0;
  private performanceSelectionContextSync: Promise<void> = Promise.resolve();

  setPerformanceResultsTreeView(treeView: vscode.TreeView<OperateNode>): void {
    this.performanceResultsTreeView = treeView;
  }

  setSanitizerResultsTreeView(treeView: vscode.TreeView<OperateNode>): void {
    this.sanitizerResultsTreeView = treeView;
  }

  private invalidateSanitizerPresentationCaches(): void {
    this.sanitizerReportRootNodesCache = undefined;
    this.sanitizerGroupNodesCache.clear();
    this.sanitizerGroupMessageNodesCache.clear();
  }

  private invalidateSanitizerViewCaches(): void {
    this.sanitizerVisibleMessagesCache.clear();
    this.sanitizerVisibleDerivedCache.clear();
    this.sanitizerDedupeResultCache.clear();
    this.sanitizerReportGroupsCache.clear();
    this.invalidateSanitizerPresentationCaches();
  }

  private invalidateSanitizerDataCaches(): void {
    this.sanitizerReportMessagesCache.clear();
    this.sanitizerReportDerivedCache.clear();
    this.sanitizerFullDuplicateKeysCache.clear();
    this.invalidateSanitizerViewCaches();
  }

  private getSanitizerViewCacheKey(reportPath: string): string {
    return `${reportPath}\n${this.getNormalizedWorkspacePath()
      .toLowerCase()}\n${this.state.sanitizer.hideDuplicates ? 'dedupe' : 'all'}`;
  }

  /**
   * BCP 47 locale from {@link vscode.env.language} for string collation (sorting).
   * When unset, `localeCompare` uses the runtime default.
   */
  private getLocaleForSort(): string | undefined {
    const lang = vscode.env.language?.trim();

    return lang ? lang : undefined;
  }

  /** Flow tree only: which menu row is running an action (shows `loading~spin` on that item). */
  private executingFlowNodeId: OperateNodeId | null = null;
  /** Flow tree only: queue status for queueable operator actions. */
  private queuedFlowStates: Partial<Record<OperateNodeId, 'queued' | 'running' | 'cancel_failed'>> = {};

  /** Compile/run gate row icons (build spinner + run hourglass while queued). */
  private compileRunGateFlowState: CompileRunGateUiState = {};

  setQueuedFlowStates(states: Partial<Record<OperateNodeId, 'queued' | 'running' | 'cancel_failed'>>): void {
    if (this.kind !== 'flow') {
      return;
    }

    const prev = JSON.stringify(this.queuedFlowStates);
    const next = JSON.stringify(states ?? {});

    if (prev === next) {
      return;
    }

    this.queuedFlowStates = states ?? {};
    this.onDidChangeTreeDataEmitter.fire();
  }

  setCompileRunGateUiState(state: CompileRunGateUiState): void {
    if (this.kind !== 'flow') {
      return;
    }

    const prev = JSON.stringify(this.compileRunGateFlowState);
    const next = JSON.stringify(state ?? {});

    if (prev === next) {
      return;
    }

    this.compileRunGateFlowState = state ?? {};
    this.onDidChangeTreeDataEmitter.fire();
  }

  private flowRowQueueState(nodeId: OperateNodeId): 'queued' | 'running' | 'cancel_failed' | undefined {
    if (nodeId === 'build' || nodeId === 'run') {
      const gateState = this.compileRunGateFlowState[nodeId];

      if (gateState) {
        return gateState;
      }
    }

    return this.queuedFlowStates[nodeId];
  }

  /**
   * Run an async action for the Actions tree and show a spinning icon on that row while it runs.
   * No-op for the operator-projects tree (`kind !== 'flow'`).
   * @param skipEnvironmentScriptCheck skip when the action only opens Settings (e.g. tuning pages) so users can fix the env script.
   * @param skipFlowExecutionUi when true, do not show loading/stop on the tree row (use for gear icons that only open Settings).
   */
  async runFlowAction<T>(
    nodeId: OperateNodeId,
    action: ()=> Promise<T>,
    options?: { skipEnvironmentScriptCheck?: boolean;
      skipFlowExecutionUi?: boolean },
  ): Promise<T | undefined> {
    if (this.kind !== 'flow') {
      return action();
    }

    if (!options?.skipEnvironmentScriptCheck) {
      const envOk = await ensureEnvironmentScriptForOperateAction();

      if (!envOk) {
        return undefined;
      }
    }

    if (options?.skipFlowExecutionUi) {
      return await action();
    }

    const executionNodeId = nodeId;

    this.executingFlowNodeId = nodeId;
    this.onDidChangeTreeDataEmitter.fire();
    // Let the tree view repaint before the action runs; otherwise loading/stop may never appear
    // when the task yields quickly (e.g. after env check with no dialog).
    await OperateTreeProvider.yieldToUi();

    try {
      return await action();
    }
    finally {
      // Avoid clobbering a newer flow state: if another action started while this one
      // was stopping, it owns `executingFlowNodeId` now and must keep its loading UI.
      if (this.executingFlowNodeId === executionNodeId) {
        this.executingFlowNodeId = null;
        this.onDidChangeTreeDataEmitter.fire();
      }
    }
  }

  private static yieldToUi(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof setImmediate === 'function') {
        setImmediate(() => resolve());
      }
      else {
        setTimeout(() => resolve(), 0);
      }
    });
  }

  /** Clears the running-row state (e.g. after user stops the task from the inline stop action). */
  clearFlowExecutionState(): void {
    if (this.kind !== 'flow') {
      return;
    }

    this.executingFlowNodeId = null;
    this.onDidChangeTreeDataEmitter.fire();
  }

  /** Refresh tree labels when workspace settings change (e.g. environment script path). */
  notifyConfigurationChanged(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  /**
   * True when this row is part of the active flow (same row or parent debug/power while a child runs).
   * Used for both spinner icon and `opdevtools.flowRunning` context (inline stop).
   */
  private matchesFlowExecutingNode(nodeId: OperateNodeId): boolean {
    if (this.kind !== 'flow' || this.executingFlowNodeId === null) {
      return false;
    }

    const active = this.executingFlowNodeId;

    if (active === nodeId) {
      return true;
    }

    if (
      nodeId === 'debug'
      && (active === 'cpuDebug' || active === 'npuDebug')
    ) {
      return true;
    }

    if (
      nodeId === 'power'
      && (active === 'onboard' || active === 'simulation')
    ) {
      return true;
    }

    return false;
  }

  /** True when this tree row should show the loading spinner (parent + active subitem while a flow child action runs). */
  private isFlowExecutingIcon(nodeId: OperateNodeId): boolean {
    const q = this.flowRowQueueState(nodeId);

    if (q === 'running' || q === 'queued' || q === 'cancel_failed') {
      return true;
    }

    return this.matchesFlowExecutingNode(nodeId);
  }

  private pickFlowIcon(
    nodeId: OperateNodeId,
    normalIcon: vscode.ThemeIcon | undefined,
  ): vscode.ThemeIcon | vscode.Uri | undefined {
    if (!this.isFlowExecutingIcon(nodeId)) {
      return normalIcon;
    }

    const q = this.flowRowQueueState(nodeId);

    // Waiting in the operator queue (not the active runner): themed animated SVG hourglass.
    if (q === 'queued') {
      return this.getAssetIcon('hourglass.svg');
    }

    return new vscode.ThemeIcon('loading~spin');
  }

  private static readonly FLOW_RUNNING_CONTEXT = treeItemContextKey('flowRunning');

  /** Appends `opdevtools.flowRunning` while this row is the active flow action (inline stop in tree). */
  private mergeFlowRunningContext(nodeId: OperateNodeId, base?: string): string | undefined {
    const queuedState = this.flowRowQueueState(nodeId);
    const isQueuedCancellable = queuedState === 'queued' || queuedState === 'running' || queuedState === 'cancel_failed';

    if (!this.matchesFlowExecutingNode(nodeId) && !isQueuedCancellable) {
      return base;
    }

    return base ? `${base} ${OperateTreeProvider.FLOW_RUNNING_CONTEXT}` : OperateTreeProvider.FLOW_RUNNING_CONTEXT;
  }

  async refreshState(hasDevtoolConfig: boolean): Promise<{ showOperatorSearch: boolean;
    showOperatorProjects: boolean }> {
    const prevSearchKeyword = this.state.searchKeyword;

    const [
      projectTypeResult,
      multipleResult,
    ] = await Promise.all([
      homeMethods.getProjectType(),
      homeMethods.checkMultipleOperators(),
    ]);
    const debugModeEnabled = SettingsLoader.read<boolean>('debugMode', true);
    const projectType = projectTypeResult.projectType || '';
    const projectTypeSupported = OperatorPluginRegistry.isProjectTypeSupported(projectType);

    appendLog(
      `[${SETTINGS_PREFIX}][sidebar]`,
      'refreshState:projectTypeSupport',
      {
        kind: this.kind,
        projectType,
        projectTypeSupported,
      },
    );

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    if (workspacePath !== this.selectionWorkspaceKey) {
      this.selectionWorkspaceKey = workspacePath;
      this.hasAppliedDefaultSelection = false;
    }

    const hasMultipleOperators = multipleResult.hasMultiple || false;
    const isStandardCustom = multipleResult.isStandardCustom || false;
    const showOperatorSearch = hasDevtoolConfig && (hasMultipleOperators || isStandardCustom);
    const showOperatorProjects = hasDevtoolConfig && hasMultipleOperators && isStandardCustom;

    const operators = multipleResult.operators
      ? multipleResult.operators.map((op) => ({
        id: op.id,
        name: op.name,
        hasEx: op.isExperimental,
        isCompiled: (op as unknown as { isCompiled?: boolean }).isCompiled ?? false,
      }))
      : [];

    let selectedOperatorIds = await (isStandardCustom ? homeMethods.getSelectedOperatorIds() : undefined);

    selectedOperatorIds = selectedOperatorIds ?? [];

    // Match web behavior: when no persisted selection exists and operator list is available,
    // pick the first (by name) once per workspace session.
    if (isStandardCustom && operators.length > 0 && selectedOperatorIds.length === 0 && !this.hasAppliedDefaultSelection) {
      const sorted = [...operators].sort((a, b) => a.name.localeCompare(b.name, this.getLocaleForSort()));
      const firstId = sorted[0]?.id;

      if (typeof firstId === 'number') {
        await homeMethods.setSelectedOperators({ operatorIds: [firstId] });
        selectedOperatorIds = [firstId];
      }
    }

    // Only once the operator list is actually KNOWN: the scan state can arrive
    // after the first refresh (fresh open / reset cache), and burning the flag
    // while the list is empty would leave the first operator unselected
    // forever.
    if (isStandardCustom && operators.length > 0) {
      this.hasAppliedDefaultSelection = true;
    }

    this.state = {
      hasDevtoolConfig,
      debugModeEnabled,
      npuHardwareAvailable: this.state.npuHardwareAvailable,
      remoteNpuHardwareAvailable: this.state.remoteNpuHardwareAvailable ?? false,
      projectType,
      projectTemplateName: projectTypeResult.projectTemplateName || '',
      hasMultipleOperators,
      isStandardCustom,
      supportsSanitizerAndTuning: multipleResult.supportsSanitizerAndTuning ?? true,
      operators,
      searchKeyword: prevSearchKeyword,
      selectedOperatorIds,
      sanitizer: this.state.sanitizer,
      performance: this.state.performance ?? {
        reports: [],
        sortOrder: 'desc',
        markedOnly: false,
      },
    };

    if (!hasDevtoolConfig) {
      this.state.sanitizer.reports = [];
      this.state.sanitizer.selectedReportPath = undefined;
      this.state.sanitizer.selectedReportTitle = undefined;
      this.state.sanitizer.selectedMessages = [];
      this.state.sanitizer.hideDuplicates = false;
      this.state.performance.reports = [];
      this.state.performance.selectedReportKey = undefined;
    }

    this.onDidChangeTreeDataEmitter.fire();
    this.onDidChangePerformanceTreeDataEmitter.fire();

    return {
      showOperatorSearch,
      showOperatorProjects,
    };
  }

  /**
   * Flow-tree cached state from refreshState(checkMultipleOperators):
   * true when workspace currently has multiple operators.
   */
  hasMultipleOperators(): boolean {
    return this.state.hasMultipleOperators;
  }

  /** Flow-tree cached state: true when current context is standard-custom. */
  isStandardCustomContext(): boolean {
    return this.state.isStandardCustom;
  }

  setNpuHardwareAvailable(available: boolean): void {
    if (this.state.npuHardwareAvailable === available) {
      return;
    }

    this.state.npuHardwareAvailable = available;
    this.onDidChangeTreeDataEmitter.fire();
  }

  setRemoteNpuHardwareAvailable(available: boolean): void {
    if (this.state.remoteNpuHardwareAvailable === available) {
      return;
    }

    this.state.remoteNpuHardwareAvailable = available;
    this.onDidChangeTreeDataEmitter.fire();
  }

  private resolveFlowActionState(
    hasMultipleSelectedOperators: boolean,
    commandId: string | undefined,
    requiresNpu: boolean,
  ): {
    commandId: string | undefined;
    tooltip: string | undefined;
    useDisabledIcon: boolean;
  } {
    if (hasMultipleSelectedOperators) {
      return {
        commandId: undefined,
        tooltip: t('web.operate.singleOperatorOnly'),
        useDisabledIcon: true,
      };
    }

    if (requiresNpu && !(this.state.npuHardwareAvailable || this.state.remoteNpuHardwareAvailable)) {
      return {
        commandId: undefined,
        tooltip: t('web.operate.remoteToolRequired'),
        useDisabledIcon: true,
      };
    }

    return {
      commandId,
      tooltip: undefined,
      useDisabledIcon: false,
    };
  }

  /**
   * Entry point for `COMMAND_FLASH_MS_SANITIZER_RUN_DATA`. Keeps the command payload contract
   * in one testable place: SanitizerService is the only dispatcher that asks for the fresh
   * report to be opened, every other caller just wants the list reloaded.
   */
  async flashSanitizerRunData(options?: { openLatest?: boolean }): Promise<void> {
    await this.refreshSanitizerReports(true, options?.openLatest === true);
  }

  /**
   * @param revealLatest select the newest report when nothing is selected yet
   * @param openLatest a detection run just succeeded — always switch to its report and
   *   focus the results view, otherwise the new report hides behind the previous selection
   */
  async refreshSanitizerReports(revealLatest = false, openLatest = false): Promise<void> {
    if (this.kind !== 'flow') {
      return;
    }

    const refreshRevision = ++this.sanitizerRefreshRevision;
    let reports: SanitizerReportRecord[] = [];

    try {
      reports = await runDataService.getSanitizerRunData() as SanitizerReportRecord[];
    }
    catch (error) {
      if (!this.isSanitizerRefreshCurrent(refreshRevision)) {
        return;
      }

      console.warn('[OperateTreeProvider.refreshSanitizerReports] failed to read reports:', error);
      this.state.sanitizer.reports = [];
      this.invalidateSanitizerDataCaches();
      this.onDidChangeTreeDataEmitter.fire();

      return;
    }

    if (!this.isSanitizerRefreshCurrent(refreshRevision)) {
      return;
    }

    const manualReports = this.state.sanitizer.manualReports
      .filter((item) => fs.existsSync(item.path));

    this.state.sanitizer.manualReports = manualReports;
    const merged = new Map<string, SanitizerReportRecord>();

    for (const report of reports) {
      merged.set(report.path, report);
    }

    for (const report of manualReports) {
      if (!merged.has(report.path)) {
        merged.set(report.path, report);
      }
    }

    this.state.sanitizer.reports = Array.from(merged.values());
    this.invalidateSanitizerDataCaches();

    const selectedPath = this.state.sanitizer.selectedReportPath;

    if (selectedPath && !reports.some((item) => item.path === selectedPath)) {
      this.state.sanitizer.selectedReportPath = undefined;
      this.state.sanitizer.selectedReportTitle = undefined;
      this.state.sanitizer.selectedMessages = [];
    }

    const latest = reports.reduce<SanitizerReportRecord | undefined>(
      (newest, item) => (!newest || item.timestamp > newest.timestamp ? item : newest),
      undefined,
    );

    if (latest && (openLatest || (revealLatest && !this.state.sanitizer.selectedReportPath))) {
      if (openLatest) {
        await this.showSanitizerReportUnderMarkedFilter(latest, refreshRevision);

        if (!this.isSanitizerRefreshCurrent(refreshRevision)) {
          return;
        }
      }

      try {
        await this.selectSanitizerReport(latest.path);
      }
      catch (error) {
        // An unreadable report must not turn a successful detection into a failed one.
        console.warn('[OperateTreeProvider.refreshSanitizerReports] select failed:', error);
      }

      if (!this.isSanitizerRefreshCurrent(refreshRevision)) {
        return;
      }

      if (openLatest) {
        await this.revealSanitizerReport(latest.path, refreshRevision);
      }
    }
    else {
      this.onDidChangeTreeDataEmitter.fire();
    }
  }

  /**
   * The marked-only filter hides every unmarked row, so opening a fresh report while it is on
   * leaves the user staring at the `noReports` placeholder. Drop the filter for the report we
   * are about to open, the same way marking does when it would empty the list.
   */
  private async showSanitizerReportUnderMarkedFilter(
    report: SanitizerReportRecord,
    refreshRevision?: number,
  ): Promise<void> {
    if (!this.isSanitizerRefreshCurrent(refreshRevision) || !this.state.sanitizer.markedOnly || report.marked) {
      return;
    }

    this.setSanitizerMarkedOnly(false);

    try {
      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.sanitizerMarkedOnly`, false);
    }
    catch (error) {
      console.warn('[OperateTreeProvider.refreshSanitizerReports] marked filter context sync failed:', error);
    }
  }

  /**
   * Focus the results view and scroll the report's row into view. Focus alone is not enough:
   * with ascending sort or a long list the fresh report sits off-screen, so the user sees a
   * view that did not visibly react to the run.
   *
   * Every await boundary rechecks `refreshRevision`: a newer refresh that already dropped or
   * replaced this report must not have its selection stolen by this reveal.
   */
  private async revealSanitizerReport(reportPath: string, refreshRevision?: number): Promise<void> {
    if (!this.isSanitizerRefreshCurrent(refreshRevision)
      || !this.state.sanitizer.reports.some((item) => item.path === reportPath)) {
      return;
    }

    const node = this.getSanitizerReportNodes()
      .find((item) => item.id === `sanitizer-report:${encodeURIComponent(reportPath)}`);

    try {
      await vscode.commands.executeCommand(`${TREE_VIEW_SANITIZER_RESULTS}.focus`);

      if (!this.isSanitizerRefreshCurrent(refreshRevision)) {
        return;
      }

      if (node && this.sanitizerResultsTreeView) {
        await this.sanitizerResultsTreeView.reveal(node, {
          select: true,
          focus: true,
        });
      }
    }
    catch (error) {
      console.warn('[OperateTreeProvider.refreshSanitizerReports] focus failed:', error);
    }
  }

  private isSanitizerRefreshCurrent(refreshRevision?: number): boolean {
    return refreshRevision === undefined || refreshRevision === this.sanitizerRefreshRevision;
  }

  async addSanitizerReportFromPath(reportPath: string): Promise<void> {
    if (!reportPath || !fs.existsSync(reportPath)) {
      throw new Error(t('link.fileNotExist', { path: reportPath }));
    }

    const stat = fs.statSync(reportPath);

    if (!stat.isFile()) {
      throw new Error(t('msSanitizer.pathNotFileOrDir'));
    }

    const existing = this.state.sanitizer.reports.find((item) => item.path === reportPath);

    if (existing) {
      await this.selectSanitizerReport(existing.path);

      return;
    }

    const report: SanitizerReportRecord = {
      title: path.basename(reportPath),
      timestamp: stat.mtimeMs,
      id: `sanitizer_${reportPath}`,
      path: reportPath,
      marked: false,
    };

    this.state.sanitizer.manualReports = [
      ...this.state.sanitizer.manualReports,
      report,
    ];
    this.state.sanitizer.reports = [
      ...this.state.sanitizer.reports,
      report,
    ];
    this.updateSanitizerReportRootCache();
    await this.selectSanitizerReport(reportPath);
  }

  private getSortedVisibleSanitizerReports(): SanitizerReportRecord[] {
    return [...this.state.sanitizer.reports]
      .filter((item) => (this.state.sanitizer.markedOnly ? item.marked : true))
      .sort((a, b) => {
        const order = this.state.sanitizer.sortOrder === 'desc' ? -1 : 1;

        if (a.timestamp !== b.timestamp) {
          return (a.timestamp - b.timestamp) * order;
        }

        const titleCompare = a.title.localeCompare(b.title, this.getLocaleForSort());

        if (titleCompare !== 0) {
          return titleCompare;
        }

        return a.path.localeCompare(b.path, this.getLocaleForSort());
      });
  }

  private createSanitizerReportNode(report: SanitizerReportRecord): OperateNode {
    const item = this.createItem(
      'sanitizerReportItem',
      report.title,
      undefined,
      vscode.TreeItemCollapsibleState.Collapsed,
      `${treeItemContextKey(`sanitizerReportItem.${report.marked ? 'marked' : 'unmarked'}`)}`,
      report.marked
        ? this.getCustomProductIcon('flag-filled')
        : undefined,
      undefined,
      `sanitizer-report:${encodeURIComponent(report.path)}`,
      undefined,
    );

    item.description = new Date(report.timestamp)
      .toLocaleString();
    item.tooltip = report.path;

    return item;
  }

  private updateSanitizerReportRootCache(): void {
    if (!this.sanitizerReportRootNodesCache) {
      return;
    }

    const reports = this.getSortedVisibleSanitizerReports();

    if (reports.length === 0) {
      this.sanitizerReportRootNodesCache = [
        this.createItem(
          'sanitizerReportItem',
          t('web.sanitizerPanel.noReports'),
          undefined,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];

      return;
    }

    const cachedByPath = new Map<string, OperateNode>();

    for (const node of this.sanitizerReportRootNodesCache) {
      const rawId = String(node.id ?? '');

      if (!rawId.startsWith('sanitizer-report:')) {
        continue;
      }

      const reportPath = decodeURIComponent(rawId.replace(/^sanitizer-report:/, ''));

      cachedByPath.set(reportPath, node);
    }

    this.sanitizerReportRootNodesCache = reports.map((report) => {
      const cached = cachedByPath.get(report.path);

      if (cached) {
        return cached;
      }

      return this.createSanitizerReportNode(report);
    });
  }

  toggleSanitizerSortOrder(): void {
    this.state.sanitizer.sortOrder = this.state.sanitizer.sortOrder === 'desc' ? 'asc' : 'desc';
    this.invalidateSanitizerPresentationCaches();
    this.onDidChangeTreeDataEmitter.fire();
  }

  toggleSanitizerMarkedFilter(): void {
    this.state.sanitizer.markedOnly = !this.state.sanitizer.markedOnly;
    this.invalidateSanitizerPresentationCaches();
    this.onDidChangeTreeDataEmitter.fire();
  }

  setSanitizerMarkedOnly(enabled: boolean): void {
    if (this.state.sanitizer.markedOnly === enabled) {
      return;
    }

    this.state.sanitizer.markedOnly = enabled;
    this.invalidateSanitizerPresentationCaches();
    this.onDidChangeTreeDataEmitter.fire();
  }

  isSanitizerMarkedOnlyEnabled(): boolean {
    return this.state.sanitizer.markedOnly;
  }

  setSanitizerResultsGroupBy(mode: 'class' | 'severity' | 'type' | 'file'): void {
    if (this.state.sanitizer.resultsGroupBy === mode) {
      return;
    }

    this.state.sanitizer.resultsGroupBy = mode;
    this.invalidateSanitizerPresentationCaches();
    this.onDidChangeTreeDataEmitter.fire();
  }

  getSanitizerResultsGroupBy(): 'class' | 'severity' | 'type' | 'file' {
    return this.state.sanitizer.resultsGroupBy;
  }

  toggleSanitizerHideDuplicates(): void {
    this.state.sanitizer.hideDuplicates = !this.state.sanitizer.hideDuplicates;
    this.invalidateSanitizerViewCaches();
    this.onDidChangeTreeDataEmitter.fire();
  }

  setSanitizerHideDuplicates(enabled: boolean): void {
    if (this.state.sanitizer.hideDuplicates === enabled) {
      return;
    }

    this.state.sanitizer.hideDuplicates = enabled;
    this.invalidateSanitizerViewCaches();
    this.onDidChangeTreeDataEmitter.fire();
  }

  isSanitizerHideDuplicatesEnabled(): boolean {
    return this.state.sanitizer.hideDuplicates;
  }

  private normalizeSanitizerPath(raw: string, normalizedWorkspacePath: string): string {
    const normalized = raw.replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .trim();

    if (!normalized) {
      return '';
    }

    const isWindowsPath = /^[A-Za-z]:\//.test(normalized) || /^[A-Za-z]:\//.test(normalizedWorkspacePath);
    const maybeLower = isWindowsPath ? normalized.toLowerCase() : normalized;
    const stripped = this.stripWorkspacePrefix(normalized, normalizedWorkspacePath);

    if (stripped === '') {
      return '';
    }

    if (stripped !== undefined) {
      return isWindowsPath ? stripped.toLowerCase() : stripped;
    }

    return maybeLower;
  }

  private buildSanitizerFastDuplicateMessageKey(
    msg: SanitizerMessageRecord,
    normalizedWorkspacePath: string,
  ): string {
    const file = this.normalizeSanitizerPath(msg.fileLink ?? '', normalizedWorkspacePath);
    const row = msg.row ?? '';
    const col = msg.col ?? '';
    const problem = (msg.title ?? '').replace(/\s+/g, ' ')
      .trim();

    return `${msg.type}\n${problem}\n${file}:${row}:${col}`;
  }

  private buildSanitizerFullDuplicateMessageKey(
    msg: SanitizerMessageRecord,
    normalizedWorkspacePath: string,
  ): string {
    const file = this.normalizeSanitizerPath(msg.fileLink ?? '', normalizedWorkspacePath);
    const row = msg.row ?? '';
    const col = msg.col ?? '';
    const detailsSignature = this.getSanitizerMessageDetailsText(msg)
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ')
        .trim())
      .filter((line) => line.length > 0)
      .join('\n');
    const stackSignature = (msg.originData || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^#\d+\s+/.test(line))
      .map((line) => {
        const match = line.match(/^#\d+\s+(.+?):(\d+):(\d+)(?:\s+.*)?$/);

        if (!match) {
          return line.replace(/\s+/g, ' ');
        }

        const [
          , framePath,
          frameRow,
          frameCol,
        ] = match;

        return `${this.normalizeSanitizerPath(framePath, normalizedWorkspacePath)}:${frameRow}:${frameCol}`;
      })
      .join('\n');
    const problem = (msg.title ?? '').replace(/\s+/g, ' ')
      .trim();

    if (!file) {
      return `${problem}\n${detailsSignature}`;
    }

    return `${msg.type}\n${problem}\n${stackSignature || `${file}:${row}:${col}`}`;
  }

  private getSanitizerFullDuplicateKey(
    reportPath: string | undefined,
    messages: SanitizerMessageRecord[],
    index: number,
    normalizedWorkspacePath: string,
    localCache?: Map<number, string>,
  ): string {
    if (!reportPath) {
      if (!localCache) {
        return this.buildSanitizerFullDuplicateMessageKey(messages[index], normalizedWorkspacePath);
      }

      const cachedLocal = localCache.get(index);

      if (cachedLocal !== undefined) {
        return cachedLocal;
      }

      const computedLocal = this.buildSanitizerFullDuplicateMessageKey(messages[index], normalizedWorkspacePath);

      localCache.set(index, computedLocal);

      return computedLocal;
    }

    const cacheKey = `${reportPath}\n${normalizedWorkspacePath.toLowerCase()}`;
    let cachedByIndex = this.sanitizerFullDuplicateKeysCache.get(cacheKey);

    if (!cachedByIndex) {
      cachedByIndex = new Map<number, string>();
      this.sanitizerFullDuplicateKeysCache.set(cacheKey, cachedByIndex);
    }

    const cached = cachedByIndex.get(index);

    if (cached !== undefined) {
      return cached;
    }

    const computed = this.buildSanitizerFullDuplicateMessageKey(messages[index], normalizedWorkspacePath);

    cachedByIndex.set(index, computed);

    return computed;
  }

  private getSanitizerMessageDetailsText(item: SanitizerMessageRecord): string {
    const rawLines = (item.originData || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^=+\s*/, '')
        .trim())
      .filter((line) => line.length > 0);
    const detailsLines: string[] = [];
    let inStack = false;

    for (const line of rawLines) {
      if (item.sourceTool === 'npu-check' && /^device\s+frames?\s*:\s*$/i.test(line)) {
        continue;
      }

      if (/^#\d+\s+/.test(line)) {
        inStack = true;
        continue;
      }

      if (!inStack) {
        if (/^(ERROR|WARNING):\s*/i.test(line)) {
          continue;
        }

        detailsLines.push(line);
      }
    }

    return detailsLines.join('\n');
  }

  private dedupeSanitizerMessages(
    messages: SanitizerMessageRecord[],
    reportPath?: string,
  ): SanitizerMessageRecord[] {
    if (!this.state.sanitizer.hideDuplicates) {
      return messages;
    }

    const normalizedWorkspacePath = this.getNormalizedWorkspacePath();
    const dedupeCacheKey = `${reportPath ?? '__selected__'}\n${normalizedWorkspacePath.toLowerCase()}`;
    const dedupeCached = this.sanitizerDedupeResultCache.get(dedupeCacheKey);

    if (dedupeCached && dedupeCached.source === messages) {
      return dedupeCached.filtered;
    }

    const firstIndexByFast = new Map<string, number>();
    const fullSeenByFast = new Map<string, Set<string>>();
    const localFullKeyCache = reportPath ? undefined : new Map<number, string>();
    const filtered: SanitizerMessageRecord[] = [];

    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      const fastKey = this.buildSanitizerFastDuplicateMessageKey(msg, normalizedWorkspacePath);
      const firstIndex = firstIndexByFast.get(fastKey);

      if (firstIndex === undefined) {
        firstIndexByFast.set(fastKey, i);
        filtered.push(msg);
        continue;
      }

      let seenForFast = fullSeenByFast.get(fastKey);

      if (!seenForFast) {
        seenForFast = new Set<string>();
        seenForFast.add(this.getSanitizerFullDuplicateKey(
          reportPath,
          messages,
          firstIndex,
          normalizedWorkspacePath,
          localFullKeyCache,
        ));
        fullSeenByFast.set(fastKey, seenForFast);
      }

      const fullKey = this.getSanitizerFullDuplicateKey(
        reportPath,
        messages,
        i,
        normalizedWorkspacePath,
        localFullKeyCache,
      );

      if (seenForFast.has(fullKey)) {
        continue;
      }

      seenForFast.add(fullKey);
      filtered.push(msg);
    }

    this.sanitizerDedupeResultCache.set(dedupeCacheKey, {
      source: messages,
      filtered,
    });

    return filtered;
  }

  private getVisibleSanitizerSelectedMessages(): SanitizerMessageRecord[] {
    return this.dedupeSanitizerMessages(this.state.sanitizer.selectedMessages);
  }

  async openSanitizerResultGroupFile(filePath: string): Promise<void> {
    if (!filePath || filePath === t('web.sanitizerTree.group.noFile')) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));

    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preview: true,
    });
  }

  async toggleSanitizerReportMark(reportId: string): Promise<void> {
    await runDataService.toggleSanitizerMark({ id: reportId });
    let changed = false;

    this.state.sanitizer.reports = this.state.sanitizer.reports.map((item) => {
      if (item.id !== reportId) {
        return item;
      }

      changed = true;

      return {
        ...item,
        marked: !item.marked,
      };
    });
    this.state.sanitizer.manualReports = this.state.sanitizer.manualReports.map((item) => {
      if (item.id !== reportId) {
        return item;
      }

      return {
        ...item,
        marked: !item.marked,
      };
    });

    if (!changed) {
      return;
    }

    if (this.state.sanitizer.markedOnly && !this.state.sanitizer.reports.some((item) => item.marked)) {
      // Keep list visible when filter would otherwise hide everything.
      this.state.sanitizer.markedOnly = false;
    }

    this.invalidateSanitizerPresentationCaches();
    this.onDidChangeTreeDataEmitter.fire();
  }

  getSanitizerReportByPath(reportPath: string): SanitizerReportRecord | undefined {
    return this.state.sanitizer.reports.find((item) => item.path === reportPath);
  }

  async copySanitizerReportPath(reportPath: string): Promise<void> {
    await vscode.env.clipboard.writeText(reportPath);
    void vscode.window.showInformationMessage(t('web.perf.pathCopied'));
  }

  async selectSanitizerReport(reportPath: string): Promise<void> {
    if (this.kind !== 'flow') {
      return;
    }

    const report = this.state.sanitizer.reports.find((item) => item.path === reportPath);

    if (!report) {
      return;
    }

    const revision = this.state.sanitizer.reportRevision + 1;

    this.state.sanitizer.reportRevision = revision;
    this.state.sanitizer.selectedReportPath = report.path;
    this.state.sanitizer.selectedReportTitle = report.title;
    this.onDidChangeTreeDataEmitter.fire();
    const panelData = sanitizerDiagnosticsService.loadSanitizerPanelData({
      path: report.path,
      title: report.title,
      timestamp: report.timestamp,
    });

    if (this.state.sanitizer.reportRevision !== revision) {
      return;
    }

    this.state.sanitizer.selectedMessages = (panelData.data ?? []) as SanitizerMessageRecord[];
    this.onDidChangeTreeDataEmitter.fire();
  }

  async jumpToSanitizerMessage(messageId: string): Promise<void> {
    const msg = this.state.sanitizer.selectedMessages[Number(messageId)];

    if (!msg || !msg.fileLink) {
      return;
    }

    const isNpuCheck = msg.sourceTool === 'npu-check';

    // npu-check frames may miss row/col; fall back to opening the file at line 1.
    if (!isNpuCheck && (msg.row === undefined || msg.col === undefined)) {
      return;
    }

    const problemTypeKey = sanitizerQuestionLabelKeyMap.get(msg.question);
    const problemType = problemTypeKey ? t(problemTypeKey) : msg.question;
    const handlingKey = sanitizerQuestionHandlerKeyMap.get(msg.question);
    const handling = handlingKey ? t(handlingKey) : '';
    const tooltip = this.buildSanitizerMessageTooltip(msg, problemType, handling);
    const params: JumpToFileParams = {
      fileLink: msg.fileLink,
      row: msg.row ?? 1,
      col: msg.col ?? 1,
      errorTitle: msg.title,
      errorMessage: tooltip.value,
    };

    await performanceDataMethods.jumpToFile(params);
  }

  getSanitizerMessageAiFixIndex(messageRef:
    | string
    | {
      id?: string;
      msAgentIndex?: number;
      command?: { arguments?: unknown[] };
    }): number | undefined {
    if (typeof messageRef !== 'string') {
      if (
        typeof messageRef.msAgentIndex === 'number'
        && Number.isInteger(messageRef.msAgentIndex)
        && messageRef.msAgentIndex >= 0
      ) {
        return messageRef.msAgentIndex;
      }
    }

    const rawId = typeof messageRef === 'string'
      ? messageRef
      : String(messageRef.command?.arguments?.[0] ?? messageRef.id ?? '');
    let messageId = rawId;

    if (!/^\d+$/.test(messageId) && messageId.startsWith('sanitizer-msg:')) {
      const parts = messageId.split(':');
      const maybeGlobalIndex = parts[parts.length - 2];

      if (/^\d+$/.test(maybeGlobalIndex)) {
        messageId = maybeGlobalIndex;
      }
    }

    if (!/^\d+$/.test(messageId)) {
      return undefined;
    }

    const msg = this.state.sanitizer.selectedMessages[Number(messageId)];

    if (!msg) {
      return undefined;
    }

    if (typeof msg.msAgentIndex === 'number' && Number.isInteger(msg.msAgentIndex) && msg.msAgentIndex >= 0) {
      return msg.msAgentIndex;
    }

    return undefined;
  }

  getTreeItem(element: OperateNode): vscode.TreeItem {
    return element;
  }

  async resolveTreeItem(
    item: vscode.TreeItem,
    _element: OperateNode,
    _token: vscode.CancellationToken,
  ): Promise<vscode.TreeItem> {
    const node = item as OperateNode;

    if (node.nodeId !== 'sanitizerMessage' || node.tooltip || !node.sanitizerTooltipMeta) {
      return item;
    }

    const {
      reportPath, globalIndex,
    } = node.sanitizerTooltipMeta;
    const {
      messages, derived,
    } = await this.getVisibleSanitizerReportData(reportPath);
    const message = messages[globalIndex];

    if (!message) {
      return item;
    }

    const messageDerived = derived[globalIndex];
    const problemType = messageDerived?.typeLabel ?? message.question;
    const handlingKey = sanitizerQuestionHandlerKeyMap.get(message.question);
    const handling = handlingKey ? t(handlingKey) : '';

    if (messageDerived?.tooltip) {
      node.tooltip = messageDerived.tooltip;

      return item;
    }

    const tooltip = this.buildSanitizerMessageTooltip(message, problemType, handling);

    if (messageDerived) {
      messageDerived.tooltip = tooltip;
    }

    node.tooltip = tooltip;

    return item;
  }

  getChildren(element?: OperateNode): vscode.ProviderResult<OperateNode[]> {
    if (!this.state.hasDevtoolConfig) {
      return [];
    }

    if (!element) {
      return this.kind === 'operatorProjects'
        ? this.getOperatorProjectsRootNodes()
        : this.getFlowRootNodes();
    }

    if (element.nodeId === 'debug') {
      return this.getDebugChildren();
    }

    if (element.nodeId === 'power') {
      return this.getPerformanceChildren();
    }

    if (element.nodeId === 'selectedOperators') {
      return this.getSelectedOperatorsChildren();
    }

    if (element.nodeId === 'sanitizerReportItem' && (element.id ?? '').startsWith('sanitizer-report:')) {
      const encodedPath = (element.id ?? '').replace(/^sanitizer-report:/, '');
      const reportPath = decodeURIComponent(encodedPath);

      return this.getSanitizerSeverityNodes(reportPath);
    }

    if (element.nodeId === 'sanitizerClass' && (element.id ?? '').startsWith('sanitizer-report-group:')) {
      const [
        , encodedReportPath,
        mode,
        encodedGroupKey,
      ] = (element.id ?? '').split(':');
      const reportPath = decodeURIComponent(encodedReportPath ?? '');
      const groupKey = decodeURIComponent(encodedGroupKey ?? '');

      return this.getSanitizerMessageNodesForReportGroup(
        reportPath,
        mode as 'class' | 'severity' | 'type' | 'file',
        groupKey,
      );
    }

    if (element.nodeId === 'sanitizerClass') {
      return this.getSanitizerMessageNodes(element.id ?? '');
    }

    if (element.nodeId === 'performanceResultsRoot') {
      return this.getPerformanceReportNodes();
    }

    if (element.nodeId === 'performanceReportItem' && (element.id ?? '').startsWith('performance-report:')) {
      const reportKey = decodeURIComponent((element.id ?? '').replace(/^performance-report:/, ''));

      return this.getPerformanceChildNodes(reportKey);
    }

    if (element.nodeId === 'performanceFolder' && (element.id ?? '').startsWith('performance-folder:')) {
      const encoded = (element.id ?? '').replace(/^performance-folder:/, '');
      const [
        encodedReportKey,
        ...pathParts
      ] = encoded.split(':');
      const reportKey = decodeURIComponent(encodedReportKey ?? '');
      const folderPath = pathParts.map((part) => decodeURIComponent(part));

      return this.getPerformanceFolderChildNodes(reportKey, folderPath);
    }

    return [];
  }

  private getFlowRootNodes(): OperateNode[] {
    if (this.isUnsupportedProjectTypeContext()) {
      return [];
    }

    const nodes: OperateNode[] = [];
    const behavior = this.getCurrentBuildBehavior();
    const canBuild = behavior.requiresBuildBeforeAnalysis;
    const canSanitizer = this.supportsCapability(behavior.supportsSanitizer);
    const canOnBoard = this.supportsCapability(behavior.supportsOnBoard);
    const canSimulate = this.supportsCapability(behavior.supportsSimulate);
    const canPower = canOnBoard || canSimulate;
    const hasMultipleSelectedOperators = this.state.selectedOperatorIds.length > 1;
    const stTestSelectionState = getStTestSelectionState(this.state.selectedOperatorIds.length);
    const stTestEnabled = stTestSelectionState === 'ready';
    const stTestTooltip = stTestSelectionState === 'none'
      ? t('web.operate.selectOneOperatorForStTest')
      : stTestSelectionState === 'multiple'
        ? t('web.operate.singleOperatorOnly')
        : undefined;
    const disabledIcon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
    const runAction = this.resolveFlowActionState(hasMultipleSelectedOperators, COMMAND_SIDEBAR_RUN, true);
    const sanitizerAction = this.resolveFlowActionState(hasMultipleSelectedOperators, COMMAND_SIDEBAR_SANITIZER, true);
    const utTestAction = this.resolveFlowActionState(hasMultipleSelectedOperators, COMMAND_SIDEBAR_UT_TEST, false);
    const dumpTensorAction = this.resolveFlowActionState(hasMultipleSelectedOperators, COMMAND_SIDEBAR_DUMP_TENSOR, true);

    if (canBuild) {
      nodes.push(this.createItem(
        'build',
        t('web.operate.compileDeploy'),
        COMMAND_SIDEBAR_BUILD,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        this.pickFlowIcon('build', this.getCustomProductIcon('build')),
        undefined,
      ));
    }

    nodes.push(this.createItem(
      'run',
      t('web.operate.run'),
      runAction.commandId,
      vscode.TreeItemCollapsibleState.None,
      undefined,
      this.pickFlowIcon('run', runAction.useDisabledIcon ? disabledIcon : this.getCustomProductIcon('run')),
      '- NPU',
      undefined,
      undefined,
      runAction.tooltip,
    ));

    const debugChildren = this.getDebugChildren();
    const hideDebugForStandardCustom = this.state.isStandardCustom && !this.state.supportsSanitizerAndTuning;

    if (!hideDebugForStandardCustom && debugChildren.length > 0) {
      nodes.push(this.createItem(
        'debug',
        t('web.operate.debug'),
        undefined,
        vscode.TreeItemCollapsibleState.Collapsed,
        treeItemContextKey('debug'),
        this.pickFlowIcon('debug', this.getCustomProductIcon('debug')),
      ));
    }

    if (canSanitizer) {
      nodes.push(this.createItem(
        'sanitizer',
        t('web.operate.sanitizer'),
        sanitizerAction.commandId,
        vscode.TreeItemCollapsibleState.None,
        treeItemContextKey('sanitizer'),
        this.pickFlowIcon('sanitizer', sanitizerAction.useDisabledIcon ? disabledIcon : this.getCustomProductIcon('check')),
        '- NPU',
        undefined,
        undefined,
        sanitizerAction.tooltip,
      ));
    }

    const hidePower = this.state.isStandardCustom && !this.state.supportsSanitizerAndTuning;

    if (!hidePower && canPower) {
      nodes.push(this.createItem(
        'power',
        t('web.operate.performanceTuning'),
        undefined,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        this.pickFlowIcon('power', this.getCustomProductIcon('power')),
      ));
    }

    if (canBuild && this.state.isStandardCustom) {
      nodes.push(this.createItem(
        'utTest',
        t('web.operate.utTest'),
        utTestAction.commandId,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        utTestAction.useDisabledIcon
          ? disabledIcon
          : this.pickFlowIcon('utTest', this.getCustomProductIcon('beaker')),
        undefined,
        undefined,
        undefined,
        utTestAction.tooltip,
      ));
    }

    if (shouldShowStTestAction({
      canBuild,
      isStandardCustom: this.state.isStandardCustom,
    })) {
      nodes.push(this.createItem(
        'stTest',
        t('web.operate.stTest'),
        stTestEnabled ? COMMAND_SIDEBAR_ST_TEST : undefined,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        this.pickFlowIcon(
          'stTest',
          stTestEnabled ? this.getCustomProductIcon('beaker') : disabledIcon,
        ),
        '- NPU',
        undefined,
        undefined,
        stTestTooltip,
      ));
    }

    if (canBuild) {
      nodes.push(this.createItem(
        'dumpTensor',
        t('web.operate.dumpTensor'),
        dumpTensorAction.commandId,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        dumpTensorAction.useDisabledIcon
          ? disabledIcon
          : this.pickFlowIcon('dumpTensor', this.getCustomProductIcon('tensor')),
        '- NPU',
        undefined,
        undefined,
        dumpTensorAction.tooltip,
      ));
    }

    return nodes;
  }

  private getOperatorProjectsRootNodes(): OperateNode[] {
    // Only show operator-project selection tree when multi-operator/standard-custom context is relevant.
    if (!(this.state.hasMultipleOperators || this.state.isStandardCustom)) {
      return [];
    }

    return this.getOperatorSelectorChildren();
  }

  private getDebugChildren(): OperateNode[] {
    const children: OperateNode[] = [];
    const behavior = this.getCurrentBuildBehavior();
    const hasMultipleSelectedOperators = this.state.selectedOperatorIds.length > 1;
    const disabledIcon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
    // Torch-library in both stored forms: 'cann' (the view-id value) and the
    // canonical 'torch-library' (settings-native openProject) — both must hide
    // the C/C++ CPU debug action (python debug only).
    const isCannTorchLibrary = (this.state.projectType === 'cann' || this.state.projectType === 'torch-library')
      && this.state.projectTemplateName === 'torch_library_template';
    const showCpuDebug = this.supportsCapability(behavior.supportsCpuDebug) && !isCannTorchLibrary && !this.state.isStandardCustom;
    const cpuDebugAction = this.resolveFlowActionState(hasMultipleSelectedOperators, COMMAND_SIDEBAR_CPU_DEBUG, false);
    const npuDebugAction = this.resolveFlowActionState(hasMultipleSelectedOperators, COMMAND_SIDEBAR_NPU_DEBUG, true);

    if (showCpuDebug) {
      children.push(this.createItem(
        'cpuDebug',
        t('web.operate.cpuDebug'),
        cpuDebugAction.commandId,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        cpuDebugAction.useDisabledIcon
          ? disabledIcon
          : this.pickFlowIcon('cpuDebug', this.getCustomProductIcon('debug-cpu')),
        undefined,
        undefined,
        undefined,
        cpuDebugAction.tooltip,
      ));
    }

    const showNpuDebug = this.supportsCapability(behavior.supportsNpuDebug);

    if (showNpuDebug && this.state.debugModeEnabled) {
      children.push(this.createItem(
        'npuDebug',
        t('web.operate.npuDebug'),
        npuDebugAction.commandId,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        npuDebugAction.useDisabledIcon
          ? disabledIcon
          : this.pickFlowIcon('npuDebug', this.getCustomProductIcon('debug-npu')),
        '- NPU',
        undefined,
        undefined,
        npuDebugAction.tooltip,
      ));
    }

    return children;
  }

  private getPerformanceChildren(): OperateNode[] {
    const behavior = this.getCurrentBuildBehavior();
    const showOnBoard = this.supportsCapability(behavior.supportsOnBoard);
    const showSimulation = this.supportsCapability(behavior.supportsSimulate);
    const hasMultipleSelectedOperators = this.state.selectedOperatorIds.length > 1;
    const disabledIcon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
    const onboardAction = this.resolveFlowActionState(hasMultipleSelectedOperators, COMMAND_SIDEBAR_ON_BOARD, true);
    const simulationAction = this.resolveFlowActionState(hasMultipleSelectedOperators, COMMAND_SIDEBAR_SIMULATION, false);
    const items: OperateNode[] = [];

    if (showOnBoard) {
      items.push(this.createItem(
        'onboard',
        t('web.operate.onBoardAnalysis'),
        onboardAction.commandId,
        vscode.TreeItemCollapsibleState.None,
        treeItemContextKey('onboard'),
        onboardAction.useDisabledIcon
          ? disabledIcon
          : this.pickFlowIcon('onboard', this.getCustomProductIcon('onboard')),
        '- NPU',
        undefined,
        undefined,
        onboardAction.tooltip,
      ));
    }

    if (showSimulation) {
      items.push(this.createItem(
        'simulation',
        t('web.operate.simulationAnalysis'),
        simulationAction.commandId,
        vscode.TreeItemCollapsibleState.None,
        treeItemContextKey('simulation'),
        simulationAction.useDisabledIcon
          ? disabledIcon
          : this.pickFlowIcon('simulation', this.getCustomProductIcon('simulation')),
        undefined,
        undefined,
        undefined,
        simulationAction.tooltip,
      ));
    }

    return items;
  }

  private getSanitizerReportNodes(): OperateNode[] {
    if (this.sanitizerReportRootNodesCache) {
      return this.sanitizerReportRootNodesCache;
    }

    const reports = this.getSortedVisibleSanitizerReports();

    if (reports.length === 0) {
      this.sanitizerReportRootNodesCache = [
        this.createItem(
          'sanitizerReportItem',
          t('web.sanitizerPanel.noReports'),
          undefined,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];

      return this.sanitizerReportRootNodesCache;
    }

    this.sanitizerReportRootNodesCache = reports.map((report) => this.createSanitizerReportNode(report));

    return this.sanitizerReportRootNodesCache;
  }

  private getSanitizerResultGroupNodes(): OperateNode[] {
    if (!this.state.sanitizer.selectedReportPath) {
      return [
        this.createItem(
          'sanitizerMessage',
          t('web.sanitizerPanel.selectReportHint'),
          undefined,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    const mode = this.state.sanitizer.resultsGroupBy;
    const groups = this.getSanitizerResultGroups(mode);

    return groups.map(({
      key, label, messages,
    }) => {
      const errorCount = messages.filter((item) => item.type === 'error').length;
      const warningCount = messages.filter((item) => item.type === 'warning').length;
      const parts: string[] = [];

      if (errorCount > 0) {
        parts.push(`${errorCount} 🔴`);
      }

      if (warningCount > 0) {
        parts.push(`${warningCount} 🟡`);
      }

      return this.createItem(
        'sanitizerClass',
        label,
        undefined,
        vscode.TreeItemCollapsibleState.Collapsed,
        mode === 'file' && key !== t('web.sanitizerTree.group.noFile')
          ? treeItemContextKey('sanitizerPathGroupItem')
          : undefined,
        mode === 'severity'
          ? (key === 'warning'
            ? this.getCustomProductIcon('group-severity-warning')
            : this.getCustomProductIcon('group-severity-error'))
          : undefined,
        parts.join(', '),
        `sanitizer-group:${mode}:${encodeURIComponent(key)}`,
      );
    });
  }

  private getSanitizerResultGroups(mode: 'class' | 'severity' | 'type' | 'file'): Array<{ key: string;
    label: string;
    messages: SanitizerMessageRecord[] }> {
    const bucketOrder: Array<{ key: string;
      label: string }> = [
      {
        key: 'memory',
        label: t('web.sanitizerPanel.memory'),
      },
      {
        key: 'memoryContention',
        label: t('web.sanitizerPanel.memoryRace'),
      },
      {
        key: 'uninitialized',
        label: t('web.sanitizerPanel.uninitialized'),
      },
      {
        key: 'synchronize',
        label: t('web.sanitizerPanel.sync'),
      },
      {
        key: 'other',
        label: t('web.sanitizerPanel.other'),
      },
    ];
    const classSet = new Set(bucketOrder.map((bucket) => bucket.key));

    if (mode === 'class') {
      return bucketOrder
        .map((bucket) => {
          const messages = this.getVisibleSanitizerSelectedMessages()
            .filter((msg) => {
              const key = classSet.has(msg.questionType) ? msg.questionType : 'other';

              return key === bucket.key;
            });

          return {
            key: bucket.key,
            label: bucket.label,
            messages,
          };
        })
        .filter((group) => group.messages.length > 0);
    }

    if (mode === 'severity') {
      const visibleMessages = this.getVisibleSanitizerSelectedMessages();
      const warningMessages = visibleMessages.filter((msg) => msg.type === 'warning');
      const errorMessages = visibleMessages.filter((msg) => msg.type === 'error');

      return [
        {
          key: 'error',
          label: t('web.sanitizerTree.group.error'),
          messages: errorMessages,
        },
        {
          key: 'warning',
          label: t('web.sanitizerTree.group.warning'),
          messages: warningMessages,
        },
      ].filter((group) => group.messages.length > 0);
    }

    const grouped = new Map<string, { label: string;
      messages: SanitizerMessageRecord[] }>();

    for (const msg of this.getVisibleSanitizerSelectedMessages()) {
      if (mode === 'type') {
        const labelKey = sanitizerQuestionLabelKeyMap.get(msg.question);
        const label = labelKey ? t(labelKey) : msg.question;
        const key = msg.question || 'unknown';
        const current = grouped.get(key);

        if (current) {
          current.messages.push(msg);
        }
        else {
          grouped.set(key, {
            label,
            messages: [msg],
          });
        }
      }
      else {
        const filePath = msg.fileLink || t('web.sanitizerTree.group.noFile');
        const key = filePath;
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        let labelPath = filePath;

        if (workspacePath && msg.fileLink) {
          labelPath = this.stripWorkspacePrefix(filePath, workspacePath) ?? filePath;
        }

        const current = grouped.get(key);

        if (current) {
          current.messages.push(msg);
        }
        else {
          grouped.set(key, {
            label: labelPath || filePath,
            messages: [msg],
          });
        }
      }
    }

    return [...grouped.entries()]
      .map(([
        key,
        value,
      ]) => ({
        key,
        label: value.label,
        messages: value.messages,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, this.getLocaleForSort()));
  }

  getSanitizerReportsPanelNodes(): OperateNode[] {
    return this.getSanitizerReportNodes();
  }

  getSanitizerResultsPanelNodes(): OperateNode[] {
    return this.getSanitizerReportNodes();
  }

  getPerformanceResultsPanelNodes(): OperateNode[] {
    return this.getPerformanceReportNodes();
  }

  /** Sort `state.performance.reports` by current `sortOrder` (in-memory only). */
  private sortPerformanceReportsInPlace(): void {
    const {
      reports, sortOrder,
    } = this.state.performance;

    if (reports.length <= 1) {
      return;
    }

    reports.sort((a, b) => {
      const byTime = sortOrder === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;

      return byTime !== 0 ? byTime : a.key.localeCompare(b.key);
    });
  }

  /** Root report rows have no parent; required for `TreeView.reveal` to update selection. */
  getPerformanceTreeParent(element: OperateNode): vscode.ProviderResult<OperateNode | null | undefined> {
    if (element.nodeId === 'performanceReportItem' && (element.id ?? '').startsWith('performance-report:')) {
      return null;
    }

    return undefined;
  }

  /** Same contract as `getPerformanceTreeParent`, for the sanitizer results view. */
  getSanitizerTreeParent(element: OperateNode): vscode.ProviderResult<OperateNode | null | undefined> {
    if (element.nodeId === 'sanitizerReportItem' && (element.id ?? '').startsWith('sanitizer-report:')) {
      return null;
    }

    return undefined;
  }

  /**
   * Reload performance reports from disk/config; optionally focus and expand a newly added row.
   *
   * `openIfNew` additionally opens that report's data file. It is separate from `focusIfNew`
   * because the post-action hook runs from a `finally` and therefore fires for a stopped or
   * failed run too, whose report directory holds a half-written csv: only the run paths that
   * checked the exit code ask for the file to be opened.
   */
  async refreshPerformanceReports(options?: { focusIfNew?: boolean;
    openIfNew?: boolean }): Promise<void> {
    const refreshRevision = ++this.performanceRefreshRevision;
    const previousKeys = new Set(this.state.performance.reports.map((item) => item.key));
    let reports: PerformanceExecutionRecord[];

    try {
      const result = await performanceMethods.getRunData({
        sort: {
          by: 'timestamp',
          order: this.state.performance.sortOrder,
        },
      });

      reports = result?.data ?? [];
    }
    catch (error) {
      if (refreshRevision !== this.performanceRefreshRevision) {
        return;
      }

      console.error('Failed to load performance reports:', error);

      return;
    }

    if (refreshRevision !== this.performanceRefreshRevision) {
      return;
    }

    this.state.performance.reports = reports;
    this.sortPerformanceReportsInPlace();

    const selectedReportKey = this.state.performance.selectedReportKey;

    if (selectedReportKey && !this.getPerformanceReportByKey(selectedReportKey)) {
      this.state.performance.selectedReportKey = undefined;
    }

    this.performanceNodesById.clear();

    for (const key of this.performanceReportRootNodesByKey.keys()) {
      if (!this.state.performance.reports.some((item) => item.key === key)) {
        this.performanceReportRootNodesByKey.delete(key);
      }
    }

    const focusReportKey = options?.focusIfNew
      ? this.findNewPerformanceReportKey(previousKeys)
      : undefined;

    this.onDidChangePerformanceTreeDataEmitter.fire();
    await this.syncPerformanceSelectionContext();

    if (focusReportKey) {
      await OperateTreeProvider.yieldToUi();

      if (refreshRevision !== this.performanceRefreshRevision) {
        return;
      }

      await this.revealPerformanceReport(focusReportKey, refreshRevision);

      if (options?.openIfNew) {
        await this.openPrimaryPerformanceReportFile(focusReportKey, refreshRevision);
      }
    }
  }

  /**
   * Open the report a just-finished run produced, so the user does not have to hunt for it
   * in the results tree. Prefers the Insight primary data file (`visualize_data.bin`) produced by
   * msprof at the run root over raw per-device files under `dump/` (e.g. `DeviceProf*.bin`); then
   * falls back to the first `bin`, `json`, `csv`. A report without any openable file is left alone.
   */
  private async openPrimaryPerformanceReportFile(reportKey: string, refreshRevision: number): Promise<void> {
    if (!this.isPerformanceRefreshCurrent(refreshRevision)) {
      return;
    }

    const report = this.getPerformanceReportByKey(reportKey);

    if (!report) {
      return;
    }

    const files = OperateTreeProvider.collectPerformanceReportFiles(report.children);
    const file = files.find((item) => item.fileType === 'bin' && item.title === 'visualize_data.bin')
      ?? files.find((item) => item.fileType === 'bin')
      ?? files.find((item) => item.fileType === 'json')
      ?? files.find((item) => item.fileType === 'csv');

    if (!file) {
      return;
    }

    if (!fs.existsSync(file.filePath)) {
      OperateTreeProvider.warnPerformanceReportOpenFailed(file.filePath, 'file no longer exists');

      return;
    }

    try {
      await this.openPerformanceFile(file.filePath, file.fileType);
    }
    catch (error) {
      OperateTreeProvider.warnPerformanceReportOpenFailed(file.filePath, error);
    }
  }

  /** Auto-open is the only feedback the user gets after a run, so a silent failure reads as a broken feature. */
  private static warnPerformanceReportOpenFailed(filePath: string, error: unknown): void {
    console.warn('[OperateTreeProvider.openPrimaryPerformanceReportFile] open failed:', filePath, error);
    void vscode.window.showErrorMessage(t('performance.openReportFailed', { path: filePath }));
  }

  private static collectPerformanceReportFiles(children: (PerformanceRunDataFolder | PerformanceRunDataFile)[]): PerformanceRunDataFile[] {
    const files: PerformanceRunDataFile[] = [];

    for (const child of children) {
      if ('children' in child) {
        files.push(...OperateTreeProvider.collectPerformanceReportFiles(child.children));
      }
      else {
        files.push(child);
      }
    }

    return files;
  }

  private findNewPerformanceReportKey(previousKeys: Set<string>): string | undefined {
    const newReports = this.state.performance.reports.filter((item) => !previousKeys.has(item.key));

    if (newReports.length === 0) {
      return undefined;
    }

    if (previousKeys.size === 0 && newReports.length > 1) {
      return undefined;
    }

    return newReports.reduce((latest, item) => (
      item.timestamp > latest.timestamp ? item : latest
    )).key;
  }

  private async revealPerformanceReport(reportKey: string, refreshRevision?: number): Promise<void> {
    if (!this.isPerformanceRefreshCurrent(refreshRevision) || !this.getPerformanceReportByKey(reportKey)) {
      return;
    }

    this.state.performance.selectedReportKey = reportKey;
    const node = this.getPerformanceReportNodes()
      .find((item) => {
        const report = this.getPerformanceReportByKey(reportKey);

        return report && item.id === `performance-report:${encodeURIComponent(report.key)}`;
      }) ?? this.performanceReportRootNodesByKey.get(reportKey);
    const treeView = this.performanceResultsTreeView;

    if (!node || !treeView) {
      await this.syncPerformanceSelectionContext();

      return;
    }

    node.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

    try {
      if (!this.isPerformanceRefreshCurrent(refreshRevision)) {
        await this.syncPerformanceSelectionContext();

        return;
      }

      await vscode.commands.executeCommand(`${TREE_VIEW_PERFORMANCE_RESULTS}.focus`);

      if (!this.isPerformanceRefreshCurrent(refreshRevision)) {
        await this.syncPerformanceSelectionContext();

        return;
      }

      await treeView.reveal(node, {
        select: true,
        focus: true,
        expand: true,
      });

      if (!this.isPerformanceRefreshCurrent(refreshRevision)) {
        await this.syncPerformanceSelectionContext();

        return;
      }
    }
    catch (error) {
      console.warn('[OperateTreeProvider.revealPerformanceReport] reveal failed:', error);
    }

    await this.syncPerformanceSelectionContext();
  }

  private isPerformanceRefreshCurrent(refreshRevision?: number): boolean {
    return refreshRevision === undefined || refreshRevision === this.performanceRefreshRevision;
  }

  private syncPerformanceSelectionContext(): Promise<void> {
    const contextRevision = ++this.performanceSelectionContextRevision;
    const syncPromise = this.performanceSelectionContextSync.then(async () => {
      if (contextRevision !== this.performanceSelectionContextRevision) {
        return;
      }

      const selected = this.getSelectedPerformanceReport();

      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceReportSelected`, Boolean(selected));

      if (contextRevision !== this.performanceSelectionContextRevision) {
        return;
      }

      await vscode.commands.executeCommand('setContext', `${CONTEXT_PREFIX}.performanceSelectedReportMarked`, Boolean(selected?.marked));
    });

    this.performanceSelectionContextSync = syncPromise.catch(() => undefined);

    return syncPromise;
  }

  /**
   * Flip timestamp sort direction and reorder loaded rows only — no filesystem rescan.
   */
  togglePerformanceSortOrder(): void {
    this.state.performance.sortOrder = this.state.performance.sortOrder === 'asc' ? 'desc' : 'asc';
    this.sortPerformanceReportsInPlace();
    this.performanceNodesById.clear();
    this.onDidChangePerformanceTreeDataEmitter.fire();
  }

  setPerformanceMarkedOnly(markedOnly: boolean): void {
    this.state.performance.markedOnly = markedOnly;
    this.performanceNodesById.clear();
    this.onDidChangePerformanceTreeDataEmitter.fire();
  }

  isPerformanceMarkedOnlyEnabled(): boolean {
    return this.state.performance.markedOnly;
  }

  getPerformanceReportByKey(reportKey: string): PerformanceExecutionRecord | undefined {
    return this.state.performance.reports.find((item) => item.key === reportKey);
  }

  selectPerformanceReport(reportKey: string): void {
    this.state.performance.selectedReportKey = reportKey;
    void this.syncPerformanceSelectionContext();
  }

  getSelectedPerformanceReport(): PerformanceExecutionRecord | undefined {
    const key = this.state.performance.selectedReportKey;

    if (!key) {
      return undefined;
    }

    return this.getPerformanceReportByKey(key);
  }

  async togglePerformanceReportMark(reportKey: string): Promise<void> {
    const report = this.getPerformanceReportByKey(reportKey);

    if (!report) {
      return;
    }

    const nextMarked = !Boolean(report.marked);

    report.marked = nextMarked;
    this.onDidChangePerformanceTreeDataEmitter.fire();

    try {
      performanceMethods.toggleRecordMark({
        key: reportKey,
        marked: nextMarked,
      });
    }
    catch (error) {
      report.marked = !nextMarked;
      this.onDidChangePerformanceTreeDataEmitter.fire();
      vscode.window.showErrorMessage(t('web.perf.markFailed'));
      console.error('Failed to toggle performance mark:', error);
    }
  }

  async copyPerformanceReportPath(reportKey: string): Promise<void> {
    const report = this.getPerformanceReportByKey(reportKey);

    if (!report?.dirPath) {
      return;
    }

    try {
      await performanceMethods.copyReport({ dirPath: report.dirPath });
    }
    catch (error) {
      console.error('Failed to copy performance report:', error);
    }
  }

  async downloadPerformanceReport(reportKey: string): Promise<void> {
    const report = this.getPerformanceReportByKey(reportKey);

    if (!report?.dirPath) {
      return;
    }

    try {
      await performanceMethods.downloadReport({ dirPath: report.dirPath });
    }
    catch (error) {
      console.error('Failed to download performance report:', error);
    }
  }

  async openPerformanceFile(filePath: string, fileType: string): Promise<void> {
    if (fileType === 'csv') {
      await viewService.openCsvFile(filePath);

      return;
    }

    if (fileType === 'rep' || fileType === 'ncrep') {
      await viewService.openProfilingReport(filePath);

      return;
    }

    if (fileType === 'bin' || fileType === 'json') {
      await viewService.openInsight(filePath);
    }
  }

  private getVisiblePerformanceReports(): PerformanceExecutionRecord[] {
    if (!this.state.performance.markedOnly) {
      return this.state.performance.reports;
    }

    return this.state.performance.reports.filter((item) => Boolean(item.marked));
  }

  private getPerformanceReportNodes(): OperateNode[] {
    const reports = this.getVisiblePerformanceReports();

    if (reports.length === 0) {
      this.performanceReportRootNodesByKey.clear();

      return [
        this.createItem(
          'performanceReportItem',
          t('web.perf.noData'),
          undefined,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    return reports.map((report) => {
      const contextValue = report.marked
        ? treeItemContextKey('performanceReportItem.marked')
        : treeItemContextKey('performanceReportItem.unmarked');
      const description = this.formatPerformanceTimestamp(report.timestamp);
      const nodeId = `performance-report:${encodeURIComponent(report.key)}`;
      let node = this.performanceReportRootNodesByKey.get(report.key);

      if (!node) {
        node = this.createItem(
          'performanceReportItem',
          report.title,
          undefined,
          vscode.TreeItemCollapsibleState.Collapsed,
          contextValue,
          report.marked
            ? this.getCustomProductIcon('flag-filled')
            : undefined,
          description,
          nodeId,
        );
        this.performanceReportRootNodesByKey.set(report.key, node);
      }
      else {
        node.label = report.title;
        node.description = description;
        node.contextValue = contextValue;
        node.iconPath = report.marked
          ? this.getCustomProductIcon('flag-filled')
          : undefined;

        if (this.state.performance.selectedReportKey !== report.key) {
          node.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
      }

      this.performanceNodesById.set(node.id ?? '', []);

      return node;
    });
  }

  private getPerformanceChildNodes(reportKey: string): OperateNode[] {
    const report = this.getPerformanceReportByKey(reportKey);

    if (!report) {
      return [];
    }

    return report.children.map((child) => this.createPerformanceChildNode(report.key, child, [child.title]));
  }

  private getPerformanceFolderChildNodes(reportKey: string, folderPath: string[]): OperateNode[] {
    const report = this.getPerformanceReportByKey(reportKey);

    if (!report) {
      return [];
    }

    let currentChildren: (PerformanceRunDataFolder | PerformanceRunDataFile)[] = report.children;

    for (const segment of folderPath) {
      const next = currentChildren.find((child) => 'children' in child && child.title === segment);

      if (!next || !('children' in next)) {
        return [];
      }

      currentChildren = next.children;
    }

    return currentChildren.map((child) => this.createPerformanceChildNode(report.key, child, [
      ...folderPath,
      child.title,
    ]));
  }

  private createPerformanceChildNode(
    reportKey: string,
    child: PerformanceRunDataFolder | PerformanceRunDataFile,
    pathSegments: string[],
  ): OperateNode {
    if ('children' in child) {
      const encodedSegments = pathSegments.map((segment) => encodeURIComponent(segment));

      return this.createItem(
        'performanceFolder',
        child.title,
        undefined,
        vscode.TreeItemCollapsibleState.Collapsed,
        treeItemContextKey('performanceFolder'),
        undefined,
        undefined,
        `performance-folder:${encodeURIComponent(reportKey)}:${encodedSegments.join(':')}`,
      );
    }

    return this.createItem(
      'performanceFile',
      child.title,
      COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
      vscode.TreeItemCollapsibleState.None,
      `${treeItemContextKey(`performanceFile.${child.fileType}`)}`,
      undefined,
      undefined,
      `performance-file:${encodeURIComponent(child.filePath)}`,
      [
        child.filePath,
        child.fileType,
      ],
    );
  }

  private formatPerformanceTimestamp(timestamp: number): string {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleString();
  }

  private async getSanitizerMessagesForReport(reportPath: string): Promise<SanitizerMessageRecord[]> {
    const cached = this.sanitizerReportMessagesCache.get(reportPath);

    if (cached) {
      return cached;
    }

    const report = this.state.sanitizer.reports.find((item) => item.path === reportPath);

    if (!report) {
      return [];
    }

    const panelData = sanitizerDiagnosticsService.loadSanitizerPanelData({
      path: report.path,
      title: report.title,
      timestamp: report.timestamp,
    });
    const messages = (panelData.data ?? []) as SanitizerMessageRecord[];

    this.sanitizerReportMessagesCache.set(reportPath, messages);
    this.sanitizerReportDerivedCache.set(
      reportPath,
      messages.map((msg) => this.buildSanitizerMessageDerived(msg)),
    );
    this.sanitizerReportGroupsCache.delete(reportPath);

    return messages;
  }

  private async getVisibleSanitizerReportData(reportPath: string): Promise<{
    messages: SanitizerMessageRecord[];
    derived: SanitizerMessageDerived[];
  }> {
    const cacheKey = this.getSanitizerViewCacheKey(reportPath);
    const cachedMessages = this.sanitizerVisibleMessagesCache.get(cacheKey);
    const cachedDerived = this.sanitizerVisibleDerivedCache.get(cacheKey);

    if (cachedMessages && cachedDerived) {
      return {
        messages: cachedMessages,
        derived: cachedDerived,
      };
    }

    const sourceMessages = await this.getSanitizerMessagesForReport(reportPath);
    const visibleMessages = this.dedupeSanitizerMessages(sourceMessages, reportPath);
    const visibleDerived = visibleMessages.map((msg) => this.buildSanitizerMessageDerived(msg));

    this.sanitizerVisibleMessagesCache.set(cacheKey, visibleMessages);
    this.sanitizerVisibleDerivedCache.set(cacheKey, visibleDerived);

    return {
      messages: visibleMessages,
      derived: visibleDerived,
    };
  }

  private getNormalizedWorkspacePath(): string {
    return (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '').replace(/\\/g, '/')
      .replace(/\/+$/, '');
  }

  /**
   * Strips the workspace root prefix from a file path with Windows-aware
   * case-insensitive comparison. Returns `undefined` when the file is not
   * under the workspace root (or no workspace path is given), `''` when the
   * file IS the root itself, and otherwise the relative path sliced from the
   * normalized raw file string.
   */
  private stripWorkspacePrefix(filePath: string, workspacePath: string): string | undefined {
    if (!workspacePath) {
      return undefined;
    }

    const normWorkRaw = workspacePath.replace(/\\/g, '/')
      .replace(/\/+$/, '');
    const normFileRaw = filePath.replace(/\\/g, '/');
    const isWindowsPath = /^[A-Za-z]:\//.test(normWorkRaw) || /^[A-Za-z]:\//.test(normFileRaw);
    const normWork = isWindowsPath ? normWorkRaw.toLowerCase() : normWorkRaw;
    const normFile = isWindowsPath ? normFileRaw.toLowerCase() : normFileRaw;

    if (normFile === normWork) {
      return '';
    }

    if (normFile.startsWith(`${normWork}/`)) {
      return normFileRaw.slice(normWorkRaw.length + 1);
    }

    return undefined;
  }

  private buildSanitizerMessageDerived(msg: SanitizerMessageRecord): SanitizerMessageDerived {
    const classKey = [
      'memory',
      'memoryContention',
      'uninitialized',
      'synchronize',
    ].includes(msg.questionType)
      ? msg.questionType
      : 'other';
    const classLabelMap: Record<string, string> = {
      memory: t('web.sanitizerPanel.memory'),
      memoryContention: t('web.sanitizerPanel.memoryRace'),
      uninitialized: t('web.sanitizerPanel.uninitialized'),
      synchronize: t('web.sanitizerPanel.sync'),
      other: t('web.sanitizerPanel.other'),
    };
    const typeKey = msg.question || 'unknown';
    const typeLabelKey = sanitizerQuestionLabelKeyMap.get(msg.question);
    const typeLabel = typeLabelKey ? t(typeLabelKey) : msg.question;
    const fileKey = msg.fileLink || t('web.sanitizerTree.group.noFile');
    const fileLabel = msg.fileLink
      ? this.stripWorkspacePrefix(msg.fileLink, this.getNormalizedWorkspacePath()) ?? msg.fileLink
      : t('web.sanitizerTree.group.noFile');

    return {
      classKey,
      classLabel: classLabelMap[classKey] ?? classLabelMap.other,
      typeKey,
      typeLabel,
      fileKey,
      fileLabel,
      severityRank: msg.type === 'error' ? 0 : 1,
    };
  }

  private compareMessageIndicesByMode(
    mode: SanitizerGroupMode,
    derived: SanitizerMessageDerived[],
    messages: SanitizerMessageRecord[],
    a: number,
    b: number,
  ): number {
    const da = derived[a];
    const db = derived[b];
    const severityDelta = da.severityRank - db.severityRank;

    if (severityDelta !== 0) {
      return severityDelta;
    }

    if (mode === 'class') {
      const classRank: Record<string, number> = {
        memory: 0,
        memoryContention: 1,
        uninitialized: 2,
        synchronize: 3,
        other: 4,
      };
      const d = (classRank[da.classKey] ?? 4) - (classRank[db.classKey] ?? 4);

      if (d !== 0) {
        return d;
      }
    }
    else if (mode === 'type') {
      const d = da.typeLabel.localeCompare(db.typeLabel, this.getLocaleForSort());

      if (d !== 0) {
        return d;
      }
    }
    else if (mode === 'file') {
      const d = da.fileLabel.localeCompare(db.fileLabel, this.getLocaleForSort());

      if (d !== 0) {
        return d;
      }
    }

    return a - b;
  }

  private buildGroupedReportNodes(
    mode: SanitizerGroupMode,
    messages: SanitizerMessageRecord[],
    derived: SanitizerMessageDerived[],
  ): SanitizerGroupedReportNode[] {
    const grouped = new Map<string, SanitizerGroupedReportNode>();

    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      const d = derived[i];
      let key = '';
      let label = '';

      if (mode === 'severity') {
        key = msg.type;
        label = msg.type === 'error' ? t('web.sanitizerTree.group.error') : t('web.sanitizerTree.group.warning');
      }
      else if (mode === 'class') {
        key = d.classKey;
        label = d.classLabel;
      }
      else if (mode === 'type') {
        key = d.typeKey;
        label = d.typeLabel;
      }
      else {
        key = d.fileKey;
        label = d.fileLabel;
      }

      const existing = grouped.get(key);

      if (existing) {
        existing.messageIndices.push(i);
      }
      else {
        grouped.set(key, {
          key,
          label,
          description: '',
          contextValue: mode === 'file' && key !== t('web.sanitizerTree.group.noFile')
            ? treeItemContextKey('sanitizerPathGroupItem')
            : undefined,
          messageIndices: [i],
        });
      }
    }

    const groups = [...grouped.values()];

    for (const group of groups) {
      group.messageIndices.sort((a, b) => this.compareMessageIndicesByMode(mode, derived, messages, a, b));

      if (mode === 'severity') {
        group.description = String(group.messageIndices.length);
      }
      else {
        let errors = 0;
        let warnings = 0;

        for (const idx of group.messageIndices) {
          if (messages[idx].type === 'error') {
            errors += 1;
          }
          else {
            warnings += 1;
          }
        }

        const parts: string[] = [];

        if (errors > 0) {
          parts.push(`${errors} 🔴`);
        }

        if (warnings > 0) {
          parts.push(`${warnings} 🟡`);
        }

        group.description = parts.join(', ');
      }
    }

    if (mode === 'severity') {
      groups.sort((a, b) => (a.key === 'error' ? -1 : 1) - (b.key === 'error' ? -1 : 1));
    }
    else if (mode === 'type') {
      const rank = (g: SanitizerGroupedReportNode): number => {
        const hasError = g.messageIndices.some((idx) => messages[idx].type === 'error');
        const hasWarning = g.messageIndices.some((idx) => messages[idx].type === 'warning');

        if (hasError && !hasWarning) {
          return 0;
        }

        if (hasError && hasWarning) {
          return 1;
        }

        return 2;
      };

      groups.sort((a, b) => {
        const d = rank(a) - rank(b);

        if (d !== 0) {
          return d;
        }

        return a.label.localeCompare(b.label, this.getLocaleForSort());
      });
    }
    else {
      groups.sort((a, b) => a.label.localeCompare(b.label, this.getLocaleForSort()));
    }

    return groups;
  }

  private async getGroupedReportNodes(reportPath: string, mode: SanitizerGroupMode): Promise<SanitizerGroupedReportNode[]> {
    const viewCacheKey = this.getSanitizerViewCacheKey(reportPath);
    const byMode = this.sanitizerReportGroupsCache.get(viewCacheKey) ?? new Map<SanitizerGroupMode, SanitizerGroupedReportNode[]>();
    const cached = byMode.get(mode);

    if (cached) {
      return cached;
    }

    const {
      messages, derived,
    } = await this.getVisibleSanitizerReportData(reportPath);
    const built = this.buildGroupedReportNodes(mode, messages, derived);

    byMode.set(mode, built);
    this.sanitizerReportGroupsCache.set(viewCacheKey, byMode);

    return built;
  }

  private async getSanitizerSeverityNodes(reportPath: string): Promise<OperateNode[]> {
    const mode = this.state.sanitizer.resultsGroupBy;
    const groupCacheKey = `${this.getSanitizerViewCacheKey(reportPath)}\n${mode}`;
    const cached = this.sanitizerGroupNodesCache.get(groupCacheKey);

    if (cached) {
      return cached;
    }

    const groups = await this.getGroupedReportNodes(reportPath, mode);
    const nodes = groups.map((group) => this.createItem(
      'sanitizerClass',
      group.label,
      undefined,
      vscode.TreeItemCollapsibleState.Collapsed,
      group.contextValue,
      mode === 'severity'
        ? (group.key === 'warning'
          ? this.getCustomProductIcon('group-severity-warning')
          : this.getCustomProductIcon('group-severity-error'))
        : undefined,
      group.description,
      `sanitizer-report-group:${encodeURIComponent(reportPath)}:${mode}:${encodeURIComponent(group.key)}`,
    ));

    this.sanitizerGroupNodesCache.set(groupCacheKey, nodes);

    return nodes;
  }

  private async getSanitizerMessageNodesForReportGroup(
    reportPath: string,
    mode: 'class' | 'severity' | 'type' | 'file',
    groupKey: string,
  ): Promise<OperateNode[]> {
    const messageCacheKey = `${this.getSanitizerViewCacheKey(reportPath)}\n${mode}\n${groupKey}`;
    const cached = this.sanitizerGroupMessageNodesCache.get(messageCacheKey);

    if (cached) {
      return cached;
    }

    const { messages: visibleMessages } = await this.getVisibleSanitizerReportData(reportPath);

    this.state.sanitizer.selectedMessages = visibleMessages;
    const groups = await this.getGroupedReportNodes(reportPath, mode);
    const group = groups.find((entry) => entry.key === groupKey);

    if (!group) {
      return [];
    }

    const nodes = group.messageIndices.map((globalIndex, index) => {
      const item = visibleMessages[globalIndex];
      const id = String(globalIndex);
      const description = mode === 'file' ? undefined : this.getSanitizerMessageDescription(item);
      const canJump = !!item.fileLink
        && (item.sourceTool === 'npu-check' || (item.row !== undefined && item.col !== undefined));
      const node = this.createItem(
        'sanitizerMessage',
        item.title,
        canJump
          ? COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP
          : undefined,
        vscode.TreeItemCollapsibleState.None,
        typeof item.msAgentIndex === 'number' && Number.isInteger(item.msAgentIndex) && item.msAgentIndex >= 0
          ? treeItemContextKey('sanitizerMessage.aiFix')
          : undefined,
        item.type === 'warning'
          ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'))
          : new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground')),
        description,
        `sanitizer-msg:${encodeURIComponent(reportPath)}:${mode}:${encodeURIComponent(groupKey)}:${globalIndex}:${index}`,
        canJump ? [id] : undefined,
      );

      node.sanitizerTooltipMeta = {
        reportPath,
        globalIndex,
      };

      return node;
    });

    this.sanitizerGroupMessageNodesCache.set(messageCacheKey, nodes);

    return nodes;
  }

  private getSanitizerMessageNodes(classId: string): OperateNode[] {
    const prefix = 'sanitizer-group:';
    const rawId = classId.startsWith(prefix) ? classId.slice(prefix.length) : classId;
    const [
      modeRaw,
      ...rest
    ] = rawId.split(':');
    const mode = (modeRaw || this.state.sanitizer.resultsGroupBy) as 'class' | 'severity' | 'type' | 'file';
    const key = decodeURIComponent(rest.join(':') || '');
    const targetGroup = this.getSanitizerResultGroups(mode)
      .find((group) => group.key === key);
    const messages = (targetGroup?.messages ?? [])
      .map((item, globalIndex) => ({
        item,
        globalIndex,
      }))
      .sort((a, b) => a.globalIndex - b.globalIndex);
    const reportPath = this.state.sanitizer.selectedReportPath;

    return messages.map(({
      item, globalIndex,
    }, index) => {
      const id = String(globalIndex);
      const description = mode === 'file' ? undefined : this.getSanitizerMessageDescription(item);
      const canJump = !!item.fileLink
        && (item.sourceTool === 'npu-check' || (item.row !== undefined && item.col !== undefined));
      const node = this.createItem(
        'sanitizerMessage',
        item.title,
        canJump
          ? COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP
          : undefined,
        vscode.TreeItemCollapsibleState.None,
        typeof item.msAgentIndex === 'number' && Number.isInteger(item.msAgentIndex) && item.msAgentIndex >= 0
          ? treeItemContextKey('sanitizerMessage.aiFix')
          : undefined,
        item.type === 'warning'
          ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'))
          : new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground')),
        description,
        `sanitizer-msg:legacy:${mode}:${encodeURIComponent(key)}:${globalIndex}:${index}`,
        canJump ? [id] : undefined,
      );

      if (reportPath) {
        node.sanitizerTooltipMeta = {
          reportPath,
          globalIndex,
        };
      }

      return node;
    });
  }

  private getSanitizerMessageDescription(item: SanitizerMessageRecord): string | undefined {
    const fileName = item.fileLink ? path.basename(item.fileLink.replace(/\\/g, '/')) : '';

    if (!fileName) {
      return undefined;
    }

    if (item.row !== undefined && item.col !== undefined) {
      return `${fileName} ${item.row}:${item.col}`;
    }

    return fileName;
  }

  private buildSanitizerStackLinkLabel(fileLink: string): string {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    let labelPath = fileLink;

    if (workspacePath) {
      const normWorkRaw = workspacePath.replace(/\\/g, '/')
        .replace(/\/+$/, '');
      const normFileRaw = fileLink.replace(/\\/g, '/');
      const isWindowsPath = /^[A-Za-z]:\//.test(normWorkRaw) || /^[A-Za-z]:\//.test(normFileRaw);
      const normWork = isWindowsPath ? normWorkRaw.toLowerCase() : normWorkRaw;
      const normFile = isWindowsPath ? normFileRaw.toLowerCase() : normFileRaw;

      if (normFile === normWork) {
        labelPath = '';
      }
      else if (normFile.startsWith(`${normWork}/`)) {
        labelPath = normFileRaw.slice(normWorkRaw.length + 1);
      }
    }

    return labelPath;
  }

  private buildSanitizerMessageTooltip(
    item: SanitizerMessageRecord,
    problemType: string,
    handling: string,
  ): vscode.MarkdownString {
    const rawLines = (item.originData || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^=+\s*/, '')
        .trim())
      .filter((line) => line.length > 0);
    const stackLines: string[] = [];

    for (const line of rawLines) {
      if (/^#\d+\s+/.test(line)) {
        stackLines.push(line);
      }
    }

    const isNpuCheck = item.sourceTool === 'npu-check';
    const renderedStack = stackLines.map((line) => {
      if (isNpuCheck) {
        const frame = parseNpuCheckStackFrame(line);

        if (frame && frame.filePath !== undefined) {
          const label = `${this.buildSanitizerStackLinkLabel(frame.filePath)}${frame.row !== undefined ? `:${frame.row}` : ''}`;
          const cmdArgs = encodeURIComponent(JSON.stringify([
            {
              fileLink: frame.filePath,
              row: frame.row ?? 1,
              col: frame.col ?? 1,
              errorTitle: item.title,
            },
          ]));
          const cmd = `command:${COMMAND_SIDEBAR_SANITIZER_STACK_JUMP}?${cmdArgs}`;

          return `- [${label}](${cmd})`;
        }

        return `- ${line.replace(/^#\d+\s+/, '')}`;
      }

      const m = line.match(/^#\d+\s+(.+):(\d+):(\d+)(?:\s+.*)?$/);

      if (!m) {
        return `- ${line.replace(/^#\d+\s+/, '')}`;
      }

      const fileLink = m[1];
      // Sanitizer stack frame uses "line:position" ordering.
      const lineNo = Number(m[2]);
      const position = Number(m[3]);
      const labelPath = this.buildSanitizerStackLinkLabel(fileLink);
      const cmdArgs = encodeURIComponent(JSON.stringify([
        {
          fileLink,
          row: lineNo,
          col: position,
          errorTitle: item.title,
        },
      ]));
      const cmd = `command:${COMMAND_SIDEBAR_SANITIZER_STACK_JUMP}?${cmdArgs}`;

      return `- [${labelPath}:${lineNo}:${position}](${cmd})`;
    });
    const md = new vscode.MarkdownString([
      `**${t('web.sanitizerPanel.problem')}**: ${item.title}`,
      `**${t('web.sanitizerTree.details')}**: ${this.getSanitizerMessageDetailsText(item)}`.trim(),
      ...(isNpuCheck
        ? []
        : [
          `**${t('web.sanitizerTree.type')}**: ${problemType}`,
          handling ? `**${t('web.sanitizerTree.description')}**: ${handling}` : '',
        ]),
      renderedStack.length > 0 ? `**${t('web.sanitizerTree.stack')}**:\n${renderedStack.join('\n')}` : '',
    ].filter(Boolean)
      .join('\n\n'));

    md.isTrusted = true;

    return md;
  }

  getSearchKeyword(): string {
    return this.state.searchKeyword;
  }

  setSearchKeyword(keyword: string): void {
    this.state.searchKeyword = keyword ?? '';
    this.onDidChangeTreeDataEmitter.fire();
  }

  async toggleOperator(operatorId: number): Promise<void> {
    const operator = this.state.operators.find((o) => o.id === operatorId);

    if (!operator) {
      return;
    }

    const isSelected = this.state.selectedOperatorIds.includes(operatorId);

    if (!isSelected && this.isOperatorDisabled(operator)) {
      return;
    }

    const nextIds = isSelected
      ? this.state.selectedOperatorIds.filter((id) => id !== operatorId)
      : [
        ...this.state.selectedOperatorIds,
        operatorId,
      ];

    await homeMethods.setSelectedOperators({ operatorIds: nextIds });
    this.state.selectedOperatorIds = nextIds;
    this.onDidChangeTreeDataEmitter.fire();
  }

  async toggleCompiledAll(): Promise<void> {
    const selectedType = this.getSelectedType();

    if (!selectedType) {
      return;
    }

    const filteredCompiled = this.getFilteredCompiledOperators();

    if (filteredCompiled.length === 0) {
      return;
    }

    const targetHasEx = selectedType === 'ex';
    const targetItems = filteredCompiled.filter((op) => op.hasEx === targetHasEx);

    if (targetItems.length === 0) {
      return;
    }

    const shouldDeselect = this.isCompiledAllSelected();
    const targetIds = new Set(targetItems.map((op) => op.id));

    const nextIds = shouldDeselect
      ? this.state.selectedOperatorIds.filter((id) => !targetIds.has(id))
      : [
        ...this.state.selectedOperatorIds,
        ...targetItems.map((op) => op.id)
          .filter((id) => !this.state.selectedOperatorIds.includes(id)),
      ];

    await homeMethods.setSelectedOperators({ operatorIds: nextIds });
    this.state.selectedOperatorIds = nextIds;
    this.onDidChangeTreeDataEmitter.fire();
  }

  async togglePreparedAll(): Promise<void> {
    const selectedType = this.getSelectedType();

    if (!selectedType) {
      return;
    }

    const filteredPrepared = this.getFilteredPreparedOperators();

    if (filteredPrepared.length === 0) {
      return;
    }

    const targetHasEx = selectedType === 'ex';
    const targetItems = filteredPrepared.filter((op) => op.hasEx === targetHasEx);

    if (targetItems.length === 0) {
      return;
    }

    const shouldDeselect = this.isPreparedAllSelected();
    const targetIds = new Set(targetItems.map((op) => op.id));

    const nextIds = shouldDeselect
      ? this.state.selectedOperatorIds.filter((id) => !targetIds.has(id))
      : [
        ...this.state.selectedOperatorIds,
        ...targetItems.map((op) => op.id)
          .filter((id) => !this.state.selectedOperatorIds.includes(id)),
      ];

    await homeMethods.setSelectedOperators({ operatorIds: nextIds });
    this.state.selectedOperatorIds = nextIds;
    this.onDidChangeTreeDataEmitter.fire();
  }

  private getSelectedType(): 'ex' | 'nonEx' | null {
    if (this.state.selectedOperatorIds.length === 0) {
      return null;
    }

    const selectedOps = this.state.operators.filter((o) => this.state.selectedOperatorIds.includes(o.id));
    const hasEx = selectedOps.some((op) => op.hasEx);
    const hasNonEx = selectedOps.some((op) => !op.hasEx);

    if (hasEx && !hasNonEx) {
      return 'ex';
    }

    if (!hasEx && hasNonEx) {
      return 'nonEx';
    }

    return null;
  }

  private isOperatorDisabled(operator: { hasEx: boolean }): boolean {
    if (this.state.selectedOperatorIds.length === 0) {
      return false;
    }

    const selectedOps = this.state.operators.filter((o) => this.state.selectedOperatorIds.includes(o.id));
    const hasSelectedEx = selectedOps.some((op) => op.hasEx);
    const hasSelectedNonEx = selectedOps.some((op) => !op.hasEx);

    if (operator.hasEx) {
      return hasSelectedNonEx;
    }

    return hasSelectedEx;
  }

  private getFilteredCompiledOperators() {
    const keyword = this.state.searchKeyword.trim()
      .toLowerCase();
    const compiled = this.state.operators.filter((o) => o.isCompiled);

    if (!keyword) {
      return compiled;
    }

    return compiled.filter((op) => op.name.toLowerCase()
      .includes(keyword));
  }

  private getFilteredPreparedOperators() {
    const keyword = this.state.searchKeyword.trim()
      .toLowerCase();
    const prepared = this.state.operators.filter((o) => !o.isCompiled);

    if (!keyword) {
      return prepared;
    }

    return prepared.filter((op) => op.name.toLowerCase()
      .includes(keyword));
  }

  private isCompiledAllSelected(): boolean {
    const selectedType = this.getSelectedType();

    if (!selectedType) {
      return false;
    }

    const filtered = this.getFilteredCompiledOperators();
    const targetHasEx = selectedType === 'ex';
    const targetItems = filtered.filter((op) => op.hasEx === targetHasEx);

    return targetItems.length > 0 && targetItems.every((op) => this.state.selectedOperatorIds.includes(op.id));
  }

  private isPreparedAllSelected(): boolean {
    const selectedType = this.getSelectedType();

    if (!selectedType) {
      return false;
    }

    const filtered = this.getFilteredPreparedOperators();
    const targetHasEx = selectedType === 'ex';
    const targetItems = filtered.filter((op) => op.hasEx === targetHasEx);

    return targetItems.length > 0 && targetItems.every((op) => this.state.selectedOperatorIds.includes(op.id));
  }

  getAllOperatorsSelected(): boolean {
    const selectedType = this.getSelectedType();

    if (!selectedType) {
      return false;
    }

    const targetHasEx = selectedType === 'ex';
    const keyword = this.state.searchKeyword.trim()
      .toLowerCase();
    const filtered = keyword
      ? this.state.operators.filter((op) => op.name.toLowerCase()
        .includes(keyword))
      : this.state.operators;
    const targetItems = filtered.filter((op) => op.hasEx === targetHasEx);

    return targetItems.length > 0 && targetItems.every((op) => this.state.selectedOperatorIds.includes(op.id));
  }

  async selectAllOperators(): Promise<void> {
    const keyword = this.state.searchKeyword.trim()
      .toLowerCase();
    const filtered = keyword
      ? this.state.operators.filter((op) => op.name.toLowerCase()
        .includes(keyword))
      : this.state.operators;

    const currentType = this.getSelectedType();
    const targetHasEx = currentType === 'ex'
      ? true
      : currentType === 'nonEx'
        ? false
        : filtered.some((op) => !op.hasEx)
          ? false
          : true;

    const targetItems = filtered.filter((op) => op.hasEx === targetHasEx);

    if (targetItems.length === 0) {
      return;
    }

    const nextIds = targetItems.map((op) => op.id);

    await homeMethods.setSelectedOperators({ operatorIds: nextIds });
    this.state.selectedOperatorIds = nextIds;
    this.onDidChangeTreeDataEmitter.fire();
  }

  getPreparedAllSelected(): boolean {
    return this.isPreparedAllSelected();
  }

  private getOperatorSelectorChildren(): OperateNode[] {
    if (!(this.state.hasMultipleOperators || this.state.isStandardCustom)) {
      return [];
    }

    const selectedCount = this.state.selectedOperatorIds.length;

    const nodes: OperateNode[] = [];

    if (selectedCount > 0) {
      // Collapsible list of selected operators; clear-all is the inline action (package.json view/item/context).
      nodes.push(this.createItem(
        'selectedOperators',
        t('web.operate.selectedCount', { count: selectedCount }),
        undefined,
        vscode.TreeItemCollapsibleState.Collapsed,
        'operator-projects-selected',
        undefined,
        undefined,
        'operator-projects-selected',
      ));
    }

    nodes.push(...this.getFlatOperatorProjectRows());

    return nodes;
  }

  /** All operators (compiled + prepared) as direct children, search-filtered and sorted by name. */
  private getFlatOperatorProjectRows(): OperateNode[] {
    const keyword = this.state.searchKeyword.trim()
      .toLowerCase();
    let list = [...this.state.operators];

    if (keyword) {
      list = list.filter((op) => op.name.toLowerCase()
        .includes(keyword));
    }

    // Keep "ex" items at the bottom, matching previous behavior.
    list.sort((a, b) => {
      if (a.hasEx !== b.hasEx) {
        return a.hasEx ? 1 : -1;
      }

      return a.name.localeCompare(b.name, this.getLocaleForSort());
    });

    const nodes: OperateNode[] = [];
    const disabledIcon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));

    for (const op of list) {
      const isDisabled = this.isOperatorDisabled(op);
      const isSelected = this.state.selectedOperatorIds.includes(op.id);
      const iconPath = isSelected
        ? new vscode.ThemeIcon('check')
        : isDisabled
          ? disabledIcon
          : undefined;

      nodes.push(this.createItem(
        'operatorItem',
        op.name,
        isDisabled ? undefined : COMMAND_SIDEBAR_TOGGLE_OPERATOR,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        iconPath,
        this.buildOperatorProjectsDescription(op),
        `operator-${op.id}`,
        isDisabled ? undefined : [op.id],
      ));
    }

    return nodes;
  }

  private getSelectedOperatorsChildren(): OperateNode[] {
    const selectedIds = this.state.selectedOperatorIds;

    if (!selectedIds || selectedIds.length === 0) {
      return [];
    }

    const nodes: OperateNode[] = [];

    for (const id of selectedIds) {
      const operator = this.state.operators.find((op) => op.id === id);

      if (!operator) {
        continue;
      }

      nodes.push(this.createItem(
        'operatorItem',
        operator.name,
        // Toggle operator to remove it from the selected list.
        COMMAND_SIDEBAR_TOGGLE_OPERATOR,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        new vscode.ThemeIcon('check'),
        this.buildOperatorProjectsDescription(operator),
        `selected-operator-${operator.id}`,
        [id],
      ));
    }

    return nodes;
  }

  /**
   * Secondary text to the right of the label. Uses `$(getting-started-item-checked)` for compiled
   * (same codicon syntax as labels; see Icons in labels in the VS Code extension docs).
   */
  private buildOperatorProjectsDescription(op: { hasEx: boolean;
    isCompiled: boolean }): string | undefined {
    const parts: string[] = [];

    if (op.hasEx) {
      parts.push('ex');
    }

    if (op.isCompiled) {
      parts.push('⚑');
    }

    return parts.length ? parts.join(' · ') : undefined;
  }

  private createItem(
    nodeId: OperateNodeId,
    label: string,
    commandId?: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    contextValue?: string,
    iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri;
      dark: vscode.Uri },
    description?: string,
    treeItemId?: string,
    commandArguments?: unknown[],
    tooltip?: string | vscode.MarkdownString,
    disabled?: boolean,
  ): OperateNode {
    const item = new vscode.TreeItem(label, collapsibleState) as OperateNode;

    item.nodeId = nodeId;
    item.id = treeItemId ?? nodeId;

    if (commandId) {
      item.command = {
        command: commandId,
        title: label,
        arguments: commandArguments,
      };
    }

    const mergedContext = this.mergeFlowRunningContext(nodeId, contextValue);

    if (mergedContext) {
      item.contextValue = mergedContext;
    }

    if (iconPath) {
      item.iconPath = iconPath;
    }

    if (description) {
      item.description = description;
    }

    if (tooltip) {
      item.tooltip = tooltip;
    }

    return item;
  }

  private getCustomProductIcon(name: string): vscode.ThemeIcon {
    return new vscode.ThemeIcon(`opdevtools-${name}`);
  }

  private getThemedHourglassFileName(): string {
    switch (vscode.window.activeColorTheme.kind) {
      case vscode.ColorThemeKind.Light:
        return 'animated/hourglass-light.svg';
      case vscode.ColorThemeKind.HighContrastLight:
        return 'animated/hourglass-high-contrast-light.svg';
      case vscode.ColorThemeKind.HighContrast:
        return 'animated/hourglass-high-contrast.svg';
      case vscode.ColorThemeKind.Dark:
      default:
        return 'animated/hourglass-dark.svg';
    }
  }

  private getAssetIcon(fileName: string): vscode.Uri {
    const resolved = fileName === 'hourglass.svg' ? this.getThemedHourglassFileName() : fileName;
    const cacheKey = `${vscode.window.activeColorTheme.kind}:${resolved}`;
    const cached = this.themedIconCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Packaged with the web build: `web/vite.config.ts` copies `src/assets/svg/animated` → `out/web/tree-icons/svg/animated`.
    const segments = resolved.split('/')
      .filter(Boolean);
    const iconFileUri = vscode.Uri.joinPath(
      this.extensionUri,
      'out',
      'web',
      'tree-icons',
      'svg',
      ...segments,
    );

    this.themedIconCache.set(cacheKey, iconFileUri);

    return iconFileUri;
  }

  private getCurrentBuildBehavior() {
    return OperatorPluginRegistry.getBuildBehaviorByProjectType(this.state.projectType);
  }

  private supportsCapability(value: boolean | undefined): boolean {
    return value !== false;
  }

  private isUnsupportedProjectTypeContext(): boolean {
    return !OperatorPluginRegistry.isProjectTypeSupported(this.state.projectType);
  }
}
