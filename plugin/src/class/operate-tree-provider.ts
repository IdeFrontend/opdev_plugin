import { t } from 'i18next';
import * as vscode from 'vscode';

import { configMethods } from '@plugin/controller/config-controller';
import { homeMethods } from '@plugin/controller/home-controller';
import { ensureEnvironmentScriptForOperateAction } from '@plugin/helpers/environment-script-guard';
import { COMMAND_SIDEBAR_TOGGLE_OPERATOR } from '../constants';

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
  | 'dumpTensor'
  | 'selectOperators'
  | 'selectedOperators'
  | 'operatorItem';

export interface OperateNode extends vscode.TreeItem {
  nodeId: OperateNodeId;
}

type OperateSidebarState = {
  hasDevtoolConfig: boolean;
  debugModeEnabled: boolean;
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
};

const INITIAL_STATE: OperateSidebarState = {
  hasDevtoolConfig: false,
  debugModeEnabled: true,
  projectType: '',
  projectTemplateName: '',
  hasMultipleOperators: false,
  isStandardCustom: false,
  supportsSanitizerAndTuning: true,
  operators: [],
  searchKeyword: '',
  selectedOperatorIds: [],
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
    action: () => Promise<T>,
  ): Promise<T | undefined> {
    const p = OperateTreeProvider.webviewOpsFlowProvider;
    if (!p) {
      return action();
    }
    return p.runFlowAction(nodeId, action);
  }

  static runFlowActionFromWebviewWithParams<P, T>(
    nodeId: OperateNodeId,
    action: (params: P) => Promise<T>,
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
      context.subscriptions.push(
        vscode.window.onDidChangeActiveColorTheme(() => {
          this.themedIconCache.clear();
          this.onDidChangeTreeDataEmitter.fire();
        }),
      );
    }
  }

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private state: OperateSidebarState = { ...INITIAL_STATE };

  private selectionWorkspaceKey = '';
  private hasAppliedDefaultSelection = false;
  private readonly themedIconCache = new Map<string, vscode.Uri>();

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

  /**
   * Run an async action for the Actions tree and show a spinning icon on that row while it runs.
   * No-op for the operator-projects tree (`kind !== 'flow'`).
   * @param skipEnvironmentScriptCheck skip when the action only opens Settings (e.g. tuning pages) so users can fix the env script.
   * @param skipFlowExecutionUi when true, do not show loading/stop on the tree row (use for gear icons that only open Settings).
   */
  async runFlowAction<T>(
    nodeId: OperateNodeId,
    action: () => Promise<T>,
    options?: { skipEnvironmentScriptCheck?: boolean; skipFlowExecutionUi?: boolean },
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
      nodeId === 'debug' &&
      (active === 'cpuDebug' || active === 'npuDebug')
    ) {
      return true;
    }
    if (
      nodeId === 'power' &&
      (active === 'onboard' || active === 'simulation')
    ) {
      return true;
    }
    return false;
  }

  /** True when this tree row should show the loading spinner (parent + active subitem while a flow child action runs). */
  private isFlowExecutingIcon(nodeId: OperateNodeId): boolean {
    const q = this.queuedFlowStates[nodeId];
    if (q === 'running' || q === 'queued' || q === 'cancel_failed') {
      return true;
    }
    return this.matchesFlowExecutingNode(nodeId);
  }

  private pickFlowIcon(
    nodeId: OperateNodeId,
    normalIcon: vscode.ThemeIcon | vscode.Uri | undefined,
  ): vscode.ThemeIcon | vscode.Uri | undefined {
    if (!this.isFlowExecutingIcon(nodeId)) {
      return normalIcon;
    }
    const q = this.queuedFlowStates[nodeId];
    // Waiting in the operator queue (not the active runner): themed animated SVG hourglass.
    if (q === 'queued') {
      return this.getAssetIcon('hourglass.svg');
    }
    return new vscode.ThemeIcon('loading~spin');
  }

  private static readonly FLOW_RUNNING_CONTEXT = 'opdevtools.flowRunning';

  /** Appends `opdevtools.flowRunning` while this row is the active flow action (inline stop in tree). */
  private mergeFlowRunningContext(nodeId: OperateNodeId, base?: string): string | undefined {
    const queuedState = this.queuedFlowStates[nodeId];
    const isQueuedCancellable = queuedState === 'queued' || queuedState === 'running' || queuedState === 'cancel_failed';
    if (!this.matchesFlowExecutingNode(nodeId) && !isQueuedCancellable) {
      return base;
    }
    return base ? `${base} ${OperateTreeProvider.FLOW_RUNNING_CONTEXT}` : OperateTreeProvider.FLOW_RUNNING_CONTEXT;
  }

  async refreshState(hasDevtoolConfig: boolean): Promise<{ showOperatorSearch: boolean; showOperatorProjects: boolean }> {
    const prevSearchKeyword = this.state.searchKeyword;

    const [projectTypeResult, multipleResult, debugModeEnabled] = await Promise.all([
      homeMethods.getProjectType(),
      homeMethods.checkMultipleOperators(),
      configMethods.getDebugMode(),
    ]);

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

    if (isStandardCustom) {
      this.hasAppliedDefaultSelection = true;
    }

    this.state = {
      hasDevtoolConfig,
      debugModeEnabled,
      projectType: projectTypeResult.projectType || '',
      projectTemplateName: projectTypeResult.projectTemplateName || '',
      hasMultipleOperators,
      isStandardCustom,
      supportsSanitizerAndTuning: multipleResult.supportsSanitizerAndTuning ?? true,
      operators,
      searchKeyword: prevSearchKeyword,
      selectedOperatorIds,
    };

    this.onDidChangeTreeDataEmitter.fire();
    return { showOperatorSearch, showOperatorProjects };
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

  getTreeItem(element: OperateNode): vscode.TreeItem {
    return element;
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

    return [];
  }

  private getFlowRootNodes(): OperateNode[] {
    const nodes: OperateNode[] = [];
    const isPyasc = this.state.projectType === 'pyasc';
    const hasMultipleSelectedOperators = this.state.selectedOperatorIds.length > 1;
    const singleOnlyTooltip = hasMultipleSelectedOperators ? t('web.operate.singleOperatorOnly') : undefined;
    const disabledIcon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));

    if (!isPyasc) {
      nodes.push(this.createItem(
        'build',
        t('web.operate.compileDeploy'),
        'huawei-op-devtools.sidebar.build',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        this.pickFlowIcon('build', this.getAssetIcon('build.svg')),
      ));
    }

    nodes.push(this.createItem(
      'run',
      t('web.operate.run'),
      hasMultipleSelectedOperators ? undefined : 'huawei-op-devtools.sidebar.run',
      vscode.TreeItemCollapsibleState.None,
      undefined,
      this.pickFlowIcon('run', hasMultipleSelectedOperators ? disabledIcon : this.getAssetIcon('run.svg')),
      undefined,
      undefined,
      undefined,
      singleOnlyTooltip,
    ));

    const debugChildren = this.getDebugChildren();
    const hideDebugForStandardCustom = this.state.isStandardCustom && !this.state.supportsSanitizerAndTuning;
    if (!isPyasc && !hideDebugForStandardCustom && debugChildren.length > 0) {
      nodes.push(this.createItem(
        'debug',
        t('web.operate.debug'),
        undefined,
        vscode.TreeItemCollapsibleState.Collapsed,
        'opdevtools.debug',
        this.pickFlowIcon('debug', this.getAssetIcon('debug.svg')),
      ));
    }

    if (!isPyasc) {
      nodes.push(this.createItem(
        'sanitizer',
        t('web.operate.sanitizer'),
        hasMultipleSelectedOperators ? undefined : 'huawei-op-devtools.sidebar.sanitizer',
        vscode.TreeItemCollapsibleState.None,
        'opdevtools.sanitizer',
        this.pickFlowIcon('sanitizer', hasMultipleSelectedOperators ? disabledIcon : this.getAssetIcon('check.svg')),
        undefined,
        undefined,
        undefined,
        singleOnlyTooltip,
      ));
    }

    const hidePower = this.state.isStandardCustom && !this.state.supportsSanitizerAndTuning;
    if (!hidePower) {
      nodes.push(this.createItem(
        'power',
        t('web.operate.performanceTuning'),
        undefined,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        this.pickFlowIcon('power', this.getAssetIcon('power.svg')),
      ));
    }

    if (!isPyasc && this.state.isStandardCustom) {
      nodes.push(this.createItem(
        'utTest',
        t('web.operate.utTest'),
        hasMultipleSelectedOperators ? undefined : 'huawei-op-devtools.sidebar.utTest',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        hasMultipleSelectedOperators
          ? disabledIcon
          : this.pickFlowIcon('utTest', this.getAssetIcon('beaker.svg')),
        undefined,
        undefined,
        undefined,
        singleOnlyTooltip,
      ));
    }

    if (!isPyasc) {
      nodes.push(this.createItem(
        'dumpTensor',
        t('web.operate.dumpTensor'),
        hasMultipleSelectedOperators ? undefined : 'huawei-op-devtools.sidebar.dumpTensor',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        hasMultipleSelectedOperators
          ? disabledIcon
          : this.pickFlowIcon('dumpTensor', this.getAssetIcon('tensor.svg')),
        undefined,
        undefined,
        undefined,
        singleOnlyTooltip,
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
    const hasMultipleSelectedOperators = this.state.selectedOperatorIds.length > 1;
    const singleOnlyTooltip = hasMultipleSelectedOperators ? t('web.operate.singleOperatorOnly') : undefined;
    const disabledIcon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
    const isCannTorchLibrary = this.state.projectType === 'cann' && this.state.projectTemplateName === 'torch_library_template';
    const showCpuDebug = this.state.projectType !== 'ascend' && !isCannTorchLibrary;

    if (showCpuDebug) {
      children.push(this.createItem(
        'cpuDebug',
        t('web.operate.cpuDebug'),
        hasMultipleSelectedOperators ? undefined : 'huawei-op-devtools.sidebar.cpuDebug',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        hasMultipleSelectedOperators
          ? disabledIcon
          : this.pickFlowIcon('cpuDebug', this.getAssetIcon('debug-cpu.svg')),
        undefined,
        undefined,
        undefined,
        singleOnlyTooltip,
      ));
    }

    if (this.state.debugModeEnabled) {
      children.push(this.createItem(
        'npuDebug',
        t('web.operate.npuDebug'),
        hasMultipleSelectedOperators ? undefined : 'huawei-op-devtools.sidebar.npuDebug',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        hasMultipleSelectedOperators
          ? disabledIcon
          : this.pickFlowIcon('npuDebug', this.getAssetIcon('debug-npu.svg')),
        undefined,
        undefined,
        undefined,
        singleOnlyTooltip,
      ));
    }

    return children;
  }

  private getPerformanceChildren(): OperateNode[] {
    const hasMultipleSelectedOperators = this.state.selectedOperatorIds.length > 1;
    const singleOnlyTooltip = hasMultipleSelectedOperators ? t('web.operate.singleOperatorOnly') : undefined;
    const disabledIcon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
    return [
      this.createItem(
        'onboard',
        t('web.operate.onBoardAnalysis'),
        hasMultipleSelectedOperators ? undefined : 'huawei-op-devtools.sidebar.onBoard',
        vscode.TreeItemCollapsibleState.None,
        'opdevtools.onboard',
        hasMultipleSelectedOperators
          ? disabledIcon
          : this.pickFlowIcon('onboard', this.getAssetIcon('onboard.svg')),
        undefined,
        undefined,
        undefined,
        singleOnlyTooltip,
      ),
      this.createItem(
        'simulation',
        t('web.operate.simulationAnalysis'),
        hasMultipleSelectedOperators ? undefined : 'huawei-op-devtools.sidebar.simulation',
        vscode.TreeItemCollapsibleState.None,
        'opdevtools.simulation',
        hasMultipleSelectedOperators
          ? disabledIcon
          : this.pickFlowIcon('simulation', this.getAssetIcon('simulation.svg')),
        undefined,
        undefined,
        undefined,
        singleOnlyTooltip,
      ),
    ];
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
    if (!operator) return;

    const isSelected = this.state.selectedOperatorIds.includes(operatorId);
    if (!isSelected && this.isOperatorDisabled(operator)) {
      return;
    }

    const nextIds = isSelected
      ? this.state.selectedOperatorIds.filter((id) => id !== operatorId)
      : [...this.state.selectedOperatorIds, operatorId];

    await homeMethods.setSelectedOperators({ operatorIds: nextIds });
    this.state.selectedOperatorIds = nextIds;
    this.onDidChangeTreeDataEmitter.fire();
  }

  async toggleCompiledAll(): Promise<void> {
    const selectedType = this.getSelectedType();
    if (!selectedType) return;

    const filteredCompiled = this.getFilteredCompiledOperators();
    if (filteredCompiled.length === 0) return;

    const targetHasEx = selectedType === 'ex';
    const targetItems = filteredCompiled.filter((op) => op.hasEx === targetHasEx);
    if (targetItems.length === 0) return;

    const shouldDeselect = this.isCompiledAllSelected();
    const targetIds = new Set(targetItems.map((op) => op.id));

    const nextIds = shouldDeselect
      ? this.state.selectedOperatorIds.filter((id) => !targetIds.has(id))
      : [...this.state.selectedOperatorIds, ...targetItems.map((op) => op.id).filter((id) => !this.state.selectedOperatorIds.includes(id))];

    await homeMethods.setSelectedOperators({ operatorIds: nextIds });
    this.state.selectedOperatorIds = nextIds;
    this.onDidChangeTreeDataEmitter.fire();
  }

  async togglePreparedAll(): Promise<void> {
    const selectedType = this.getSelectedType();
    if (!selectedType) return;

    const filteredPrepared = this.getFilteredPreparedOperators();
    if (filteredPrepared.length === 0) return;

    const targetHasEx = selectedType === 'ex';
    const targetItems = filteredPrepared.filter((op) => op.hasEx === targetHasEx);
    if (targetItems.length === 0) return;

    const shouldDeselect = this.isPreparedAllSelected();
    const targetIds = new Set(targetItems.map((op) => op.id));

    const nextIds = shouldDeselect
      ? this.state.selectedOperatorIds.filter((id) => !targetIds.has(id))
      : [...this.state.selectedOperatorIds, ...targetItems.map((op) => op.id).filter((id) => !this.state.selectedOperatorIds.includes(id))];

    await homeMethods.setSelectedOperators({ operatorIds: nextIds });
    this.state.selectedOperatorIds = nextIds;
    this.onDidChangeTreeDataEmitter.fire();
  }

  private getSelectedType(): 'ex' | 'nonEx' | null {
    if (this.state.selectedOperatorIds.length === 0) return null;

    const selectedOps = this.state.operators.filter((o) => this.state.selectedOperatorIds.includes(o.id));
    const hasEx = selectedOps.some((op) => op.hasEx);
    const hasNonEx = selectedOps.some((op) => !op.hasEx);

    if (hasEx && !hasNonEx) return 'ex';
    if (!hasEx && hasNonEx) return 'nonEx';
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
    const keyword = this.state.searchKeyword.trim().toLowerCase();
    const compiled = this.state.operators.filter((o) => o.isCompiled);
    if (!keyword) return compiled;
    return compiled.filter((op) => op.name.toLowerCase().includes(keyword));
  }

  private getFilteredPreparedOperators() {
    const keyword = this.state.searchKeyword.trim().toLowerCase();
    const prepared = this.state.operators.filter((o) => !o.isCompiled);
    if (!keyword) return prepared;
    return prepared.filter((op) => op.name.toLowerCase().includes(keyword));
  }

  private isCompiledAllSelected(): boolean {
    const selectedType = this.getSelectedType();
    if (!selectedType) return false;

    const filtered = this.getFilteredCompiledOperators();
    const targetHasEx = selectedType === 'ex';
    const targetItems = filtered.filter((op) => op.hasEx === targetHasEx);
    return targetItems.length > 0 && targetItems.every((op) => this.state.selectedOperatorIds.includes(op.id));
  }

  private isPreparedAllSelected(): boolean {
    const selectedType = this.getSelectedType();
    if (!selectedType) return false;

    const filtered = this.getFilteredPreparedOperators();
    const targetHasEx = selectedType === 'ex';
    const targetItems = filtered.filter((op) => op.hasEx === targetHasEx);
    return targetItems.length > 0 && targetItems.every((op) => this.state.selectedOperatorIds.includes(op.id));
  }

  getAllOperatorsSelected(): boolean {
    const selectedType = this.getSelectedType();
    if (!selectedType) return false;
    const targetHasEx = selectedType === 'ex';
    const keyword = this.state.searchKeyword.trim().toLowerCase();
    const filtered = keyword
      ? this.state.operators.filter((op) => op.name.toLowerCase().includes(keyword))
      : this.state.operators;
    const targetItems = filtered.filter((op) => op.hasEx === targetHasEx);
    return targetItems.length > 0 && targetItems.every((op) => this.state.selectedOperatorIds.includes(op.id));
  }

  async selectAllOperators(): Promise<void> {
    const keyword = this.state.searchKeyword.trim().toLowerCase();
    const filtered = keyword
      ? this.state.operators.filter((op) => op.name.toLowerCase().includes(keyword))
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
    if (targetItems.length === 0) return;

    const nextIds = targetItems.map((op) => op.id);
    await homeMethods.setSelectedOperators({ operatorIds: nextIds });
    this.state.selectedOperatorIds = nextIds;
    this.onDidChangeTreeDataEmitter.fire();
  }

  getPreparedAllSelected(): boolean {
    return this.isPreparedAllSelected();
  }

  private getOperatorSelectorChildren(): OperateNode[] {
    if (!(this.state.hasMultipleOperators || this.state.isStandardCustom)) return [];

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
    const keyword = this.state.searchKeyword.trim().toLowerCase();
    let list = [...this.state.operators];
    if (keyword) {
      list = list.filter((op) => op.name.toLowerCase().includes(keyword));
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
      nodes.push(
        this.createItem(
          'operatorItem',
          op.name,
          isDisabled ? undefined : COMMAND_SIDEBAR_TOGGLE_OPERATOR,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          iconPath,
          this.buildOperatorProjectsDescription(op),
          `operator-${op.id}`,
          isDisabled ? undefined : [op.id],
        ),
      );
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
      if (!operator) continue;

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
  private buildOperatorProjectsDescription(op: { hasEx: boolean; isCompiled: boolean }): string | undefined {
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
    iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri },
    description?: string,
    treeItemId?: string,
    commandArguments?: unknown[],
    tooltip?: string | vscode.MarkdownString,
  ): OperateNode {
    const item = new vscode.TreeItem(label, collapsibleState) as OperateNode;
    item.nodeId = nodeId;
    item.id = treeItemId ?? nodeId;
    if (commandId) {
      item.command = { command: commandId, title: label, arguments: commandArguments };
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

  /**
   * Tree icons: packaged SVGs per `vscode.ColorThemeKind` under `web/src/assets/svg/<theme>/`.
   * Root-level `svg/*.svg` (currentColor) remains for the web UI; the extension loads themed files only.
   */
  private getAssetIcon(fileName: string): vscode.Uri {
    const subfolder = this.getThemeIconSubfolder();
    const cacheKey = `${vscode.window.activeColorTheme.kind}:${subfolder}:${fileName}`;
    const cached = this.themedIconCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const iconFileUri = vscode.Uri.joinPath(
      this.extensionUri,
      'web',
      'src',
      'assets',
      'svg',
      subfolder,
      fileName,
    );
    this.themedIconCache.set(cacheKey, iconFileUri);
    return iconFileUri;
  }

  /** Folder names under `web/src/assets/svg/` matching pre-baked stroke/fill colors per theme. */
  private getThemeIconSubfolder(): string {
    switch (vscode.window.activeColorTheme.kind) {
      case vscode.ColorThemeKind.Light:
        return 'light';
      case vscode.ColorThemeKind.HighContrastLight:
        return 'high-contrast-light';
      case vscode.ColorThemeKind.HighContrast:
        return 'high-contrast';
      case vscode.ColorThemeKind.Dark:
      default:
        return 'dark';
    }
  }

}

