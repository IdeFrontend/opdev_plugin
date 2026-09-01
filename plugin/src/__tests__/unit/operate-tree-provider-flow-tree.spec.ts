import {
  CONTEXT_PREFIX,
  TREE_VIEW_PERFORMANCE_RESULTS,
} from '@shared/flavor';

const mockGetProjectType = jest.fn();
const mockCheckMultipleOperators = jest.fn();
const mockGetSelectedOperatorIds = jest.fn();
const mockSetSelectedOperators = jest.fn();
const mockSettingsRead = jest.fn();
const mockGetBuildBehavior = jest.fn();
const mockIsProjectTypeSupported = jest.fn(() => true);
const mockEnsureEnvironmentScript = jest.fn();
const mockGetRunData = jest.fn();
const mockToggleRecordMark = jest.fn();
const mockCopyReport = jest.fn();
const mockDownloadReport = jest.fn();
const mockOpenInsight = jest.fn();
const mockOpenCsvFile = jest.fn();
const mockGetStTestSelectionState = jest.fn();
const mockShouldShowStTestAction = jest.fn();

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => {
  class EventEmitter<T> {
    readonly event = jest.fn();
    readonly fire = jest.fn((_value?: T) => undefined);
    readonly dispose = jest.fn();
  }

  class TreeItem {
    id?: string;
    command?: unknown;
    contextValue?: string;
    iconPath?: unknown;
    description?: string;
    tooltip?: unknown;

    constructor(
      public label: string,
      public collapsibleState: number,
    ) {}
  }

  class ThemeIcon {
    constructor(public id: string) {}
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  return {
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    EventEmitter,
    ThemeColor,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (uri: { fsPath: string }, ...segments: string[]) => ({
        fsPath: [
          uri.fsPath,
          ...segments,
        ].join('/'),
      }),
    },
    commands: {
      executeCommand: jest.fn()
        .mockResolvedValue(undefined),
    },
    env: { language: 'en' },
    window: {
      activeColorTheme: { kind: 2 },
      onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })),
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
    },
  };
});

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    getProjectType: (...args: unknown[]) => mockGetProjectType(...args),
    checkMultipleOperators: (...args: unknown[]) => mockCheckMultipleOperators(...args),
    getSelectedOperatorIds: (...args: unknown[]) => mockGetSelectedOperatorIds(...args),
    setSelectedOperators: (...args: unknown[]) => mockSetSelectedOperators(...args),
  },
}));
jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: { read: (...args: unknown[]) => mockSettingsRead(...args) } }));
jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({
  OperatorPluginRegistry: {
    getBuildBehaviorByProjectType: (...args: unknown[]) => mockGetBuildBehavior(...args),
    isProjectTypeSupported: (...args: unknown[]) => mockIsProjectTypeSupported(...args),
  },
}));
jest.mock('@plugin/controller/performance-controller', () => ({ performanceDataMethods: {} }));
jest.mock('@plugin/controller/performance-data-controller', () => ({
  performanceMethods: {
    getRunData: (...args: unknown[]) => mockGetRunData(...args),
    toggleRecordMark: (...args: unknown[]) => mockToggleRecordMark(...args),
    copyReport: (...args: unknown[]) => mockCopyReport(...args),
    downloadReport: (...args: unknown[]) => mockDownloadReport(...args),
  },
}));
jest.mock('@plugin/service/view-service', () => ({
  viewService: {
    openInsight: (...args: unknown[]) => mockOpenInsight(...args),
    openCsvFile: (...args: unknown[]) => mockOpenCsvFile(...args),
  },
}));
jest.mock('@plugin/helpers/environment-script-guard', () => ({ ensureEnvironmentScriptForOperateAction: (...args: unknown[]) => mockEnsureEnvironmentScript(...args) }));
jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));
jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: {} }));
jest.mock('@plugin/service/run-data-service', () => ({ runDataService: {} }));
jest.mock('@plugin/helpers/st-test-action', () => ({
  getStTestSelectionState: (...args: unknown[]) => mockGetStTestSelectionState(...args),
  shouldShowStTestAction: (...args: unknown[]) => mockShouldShowStTestAction(...args),
}));

import * as vscode from 'vscode';
import type { PerformanceExecutionRecord } from '@shared/api-types';
import {
  COMMAND_SIDEBAR_BUILD,
  COMMAND_SIDEBAR_CPU_DEBUG,
  COMMAND_SIDEBAR_DUMP_TENSOR,
  COMMAND_SIDEBAR_NPU_DEBUG,
  COMMAND_SIDEBAR_ON_BOARD,
  COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
  COMMAND_SIDEBAR_RUN,
  COMMAND_SIDEBAR_SANITIZER,
  COMMAND_SIDEBAR_SIMULATION,
  COMMAND_SIDEBAR_ST_TEST,
  COMMAND_SIDEBAR_UT_TEST,
} from '../../constants';
import { treeItemContextKey } from '@shared/flavor';
import {
  OperateNode,
  OperateTreeProvider,
} from '@plugin/class/operate-tree-provider';

type SanitizerReportRecord = {
  title: string;
  timestamp: number;
  id: string;
  path: string;
  marked: boolean;
};

type StateHarness = {
  state: {
    hasDevtoolConfig: boolean;
    debugModeEnabled: boolean;
    npuHardwareAvailable: boolean;
    remoteNpuHardwareAvailable: boolean;
    projectType: string;
    projectTemplateName: string;
    hasMultipleOperators: boolean;
    isStandardCustom: boolean;
    supportsSanitizerAndTuning: boolean;
    operators: Array<{ id: number;
      name: string;
      hasEx: boolean;
      isCompiled: boolean }>;
    searchKeyword: string;
    selectedOperatorIds: number[];
    sanitizer: {
      reports: SanitizerReportRecord[];
      sortOrder: 'asc' | 'desc';
      markedOnly: boolean;
      selectedReportPath?: string;
      selectedReportTitle?: string;
      selectedMessages: unknown[];
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
};

const behavior = (overrides: Record<string, boolean | undefined> = {}): Record<string, boolean> => ({
  requiresBuildBeforeAnalysis: true,
  supportsSanitizer: true,
  supportsOnBoard: true,
  supportsSimulate: true,
  supportsCpuDebug: true,
  supportsNpuDebug: true,
  ...overrides,
});

const createState = (): StateHarness['state'] => ({
  hasDevtoolConfig: true,
  debugModeEnabled: true,
  npuHardwareAvailable: true,
  remoteNpuHardwareAvailable: false,
  projectType: 'ascend-c',
  projectTemplateName: 'operator_template',
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
});

const record = (
  key: string,
  timestamp: number,
  children: PerformanceExecutionRecord['children'] = [],
): PerformanceExecutionRecord => ({
  key,
  title: key,
  timestamp,
  dirPath: `/reports/${key}`,
  children,
});

const createProvider = (kind: 'flow' | 'operatorProjects' = 'flow'): OperateTreeProvider => {
  const provider = new OperateTreeProvider(vscode.Uri.file('/extension'), kind);

  (provider as unknown as StateHarness).state = createState();

  return provider;
};

const deferred = <T>() => {
  let resolve!: (value: T)=> void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return {
    promise,
    resolve,
  };
};

beforeEach(() => {
  mockGetBuildBehavior.mockReset();
  mockGetBuildBehavior.mockReturnValue(behavior());
  mockIsProjectTypeSupported.mockReset();
  mockIsProjectTypeSupported.mockReturnValue(true);
  mockGetStTestSelectionState.mockReset();
  mockGetStTestSelectionState.mockReturnValue('none');
  mockShouldShowStTestAction.mockReset();
  mockShouldShowStTestAction.mockReturnValue(false);
  mockEnsureEnvironmentScript.mockReset();
  mockEnsureEnvironmentScript.mockResolvedValue(true);
  (vscode.commands.executeCommand as jest.Mock)
    .mockReset();
  (vscode.commands.executeCommand as jest.Mock)
    .mockResolvedValue(undefined);
  (vscode.window as unknown as { activeColorTheme: { kind: number } }).activeColorTheme.kind = vscode.ColorThemeKind.Dark;
  (vscode.workspace as unknown as { workspaceFolders?: Array<{ uri: { fsPath: string } }> }).workspaceFolders = undefined;
});

describe('OperateTreeProvider static webview flow bridge', () => {
  afterEach(() => {
    OperateTreeProvider.registerOperateFlowTreeProvider(null);
  });

  it('runs the action directly when no webview flow provider is registered', async () => {
    const action = jest.fn()
      .mockResolvedValue('done');

    await expect(OperateTreeProvider.runFlowActionFromWebview('run', action))
      .resolves
      .toBe('done');
    expect(action)
      .toHaveBeenCalledTimes(1);
  });

  it('delegates to the registered provider for flow loading and inline-stop state', async () => {
    const provider = createProvider();
    const action = jest.fn()
      .mockResolvedValue('done');

    OperateTreeProvider.registerOperateFlowTreeProvider(provider);
    mockEnsureEnvironmentScript.mockResolvedValue(true);

    await expect(OperateTreeProvider.runFlowActionFromWebview('run', action))
      .resolves
      .toBe('done');
    expect(action)
      .toHaveBeenCalledTimes(1);
    expect(mockEnsureEnvironmentScript)
      .toHaveBeenCalledTimes(1);
  });

  it('wraps parameters for actions that need them', async () => {
    const provider = createProvider();
    const action = jest.fn()
      .mockResolvedValue(42);

    OperateTreeProvider.registerOperateFlowTreeProvider(provider);
    mockEnsureEnvironmentScript.mockResolvedValue(true);

    await expect(OperateTreeProvider.runFlowActionFromWebviewWithParams('run', action, { a: 1 }))
      .resolves
      .toBe(42);
    expect(action)
      .toHaveBeenCalledWith({ a: 1 });
  });

  it('falls back to the raw action when the provider was unregistered', async () => {
    const action = jest.fn()
      .mockResolvedValue(undefined);

    OperateTreeProvider.registerOperateFlowTreeProvider(createProvider());
    OperateTreeProvider.registerOperateFlowTreeProvider(null);

    await OperateTreeProvider.runFlowActionFromWebview('run', action);
    expect(action)
      .toHaveBeenCalledTimes(1);
    expect(mockEnsureEnvironmentScript)
      .not
      .toHaveBeenCalled();
  });
});

describe('OperateTreeProvider theme subscription', () => {
  it('registers a theme change handler that refreshes the tree', () => {
    const subscriptions: Array<{ dispose: jest.Mock }> = [];
    const onThemeChange = vscode.window.onDidChangeActiveColorTheme as jest.Mock;

    const provider = new OperateTreeProvider(
      vscode.Uri.file('/extension'),
      'flow',
      { subscriptions } as unknown as vscode.ExtensionContext,
    );

    expect(onThemeChange)
      .toHaveBeenCalledTimes(1);
    expect(subscriptions)
      .toHaveLength(1);
    expect(typeof subscriptions[0].dispose)
      .toBe('function');

    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );
    const themeCallback = onThemeChange.mock.calls[0][0];

    themeCallback();
    expect(fire)
      .toHaveBeenCalled();
  });
});

describe('OperateTreeProvider queued and gate UI state', () => {
  it('ignores queued-flow state on the operator-projects tree', () => {
    const provider = createProvider('operatorProjects');
    const harness = provider as unknown as StateHarness;
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    provider.setQueuedFlowStates({ build: 'running' });
    expect(harness.state.selectedOperatorIds)
      .toEqual([]);
    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('does not refire when queued-flow state is unchanged', () => {
    const provider = createProvider();
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    provider.setQueuedFlowStates({ build: 'queued' });
    fire.mockClear();
    provider.setQueuedFlowStates({ build: 'queued' });

    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('ignores compile-run gate state on the operator-projects tree', () => {
    const provider = createProvider('operatorProjects');
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    provider.setCompileRunGateUiState({ build: 'running' });
    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('does not refire when compile-run gate state is unchanged', () => {
    const provider = createProvider();
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    provider.setCompileRunGateUiState({ build: 'running' });
    fire.mockClear();
    provider.setCompileRunGateUiState({ build: 'running' });

    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('shows the themed hourglass asset for a queued build row', () => {
    const provider = createProvider();

    provider.setQueuedFlowStates({ build: 'queued' });
    const buildNode = provider.getChildren(undefined)![0];

    expect(buildNode.nodeId)
      .toBe('build');
    expect((buildNode.iconPath as { fsPath: string }).fsPath)
      .toContain('tree-icons/svg/animated/hourglass-dark.svg');
  });

  it('reuses the cached themed hourglass asset across row rebuilds', () => {
    const provider = createProvider();

    provider.setQueuedFlowStates({
      build: 'queued',
      run: 'queued',
    });
    const firstIcon = provider.getChildren(undefined)![0].iconPath;

    provider.setQueuedFlowStates({});
    provider.setQueuedFlowStates({
      build: 'queued',
      run: 'queued',
    });
    const secondIcon = provider.getChildren(undefined)![0].iconPath;

    expect(secondIcon)
      .toBe(firstIcon);
  });

  it('prefers the compile-run gate state over the queue for build and run rows', () => {
    const provider = createProvider();

    provider.setQueuedFlowStates({ build: 'queued' });
    provider.setCompileRunGateUiState({ build: 'running' });

    const buildNode = provider.getChildren(undefined)![0];

    expect((buildNode.iconPath as vscode.ThemeIcon).id)
      .toBe('loading~spin');
  });

  it('shows the loading spinner for cancel-failed queue state', () => {
    const provider = createProvider();

    provider.setCompileRunGateUiState({ run: 'cancel_failed' });
    const runNode = provider.getChildren(undefined)![1];

    expect(runNode.nodeId)
      .toBe('run');
    expect((runNode.iconPath as vscode.ThemeIcon).id)
      .toBe('loading~spin');
  });

  it('keeps the normal icon when no flow state matches', () => {
    const provider = createProvider();

    provider.setQueuedFlowStates({ sanitizer: 'queued' });
    const buildNode = provider.getChildren(undefined)![0];

    expect((buildNode.iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-build');
  });
});

describe('OperateTreeProvider.runFlowAction', () => {
  beforeEach(() => {
    mockEnsureEnvironmentScript.mockReset();
    mockEnsureEnvironmentScript.mockResolvedValue(true);
  });

  it('runs the action directly on the operator-projects tree without an env check', async () => {
    const provider = createProvider('operatorProjects');
    const action = jest.fn()
      .mockResolvedValue('ok');

    await expect(provider.runFlowAction('run', action))
      .resolves
      .toBe('ok');
    expect(mockEnsureEnvironmentScript)
      .not
      .toHaveBeenCalled();
  });

  it('aborts when the environment script check fails', async () => {
    const provider = createProvider();
    const action = jest.fn();

    mockEnsureEnvironmentScript.mockResolvedValue(false);

    await expect(provider.runFlowAction('run', action))
      .resolves
      .toBeUndefined();
    expect(action)
      .not
      .toHaveBeenCalled();
  });

  it('skips the environment script check when asked to', async () => {
    const provider = createProvider();
    const action = jest.fn()
      .mockResolvedValue('ok');

    await provider.runFlowAction('run', action, { skipEnvironmentScriptCheck: true });

    expect(mockEnsureEnvironmentScript)
      .not
      .toHaveBeenCalled();
    expect(action)
      .toHaveBeenCalledTimes(1);
  });

  it('runs without flow UI when skipFlowExecutionUi is set', async () => {
    const provider = createProvider();
    const action = jest.fn()
      .mockResolvedValue('ok');
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    await provider.runFlowAction('run', action, { skipFlowExecutionUi: true });

    expect(action)
      .toHaveBeenCalledTimes(1);
    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('shows the loading row while the action runs and clears it afterwards', async () => {
    const provider = createProvider();
    const gate = deferred<string>();

    const pending = provider.runFlowAction('run', () => gate.promise);

    // Let the environment-script check pass so the loading row is armed.
    await new Promise((resolve) => setImmediate(resolve));
    const buildNode = provider.getChildren(undefined)![1];

    expect(buildNode.nodeId)
      .toBe('run');
    expect((buildNode.iconPath as vscode.ThemeIcon).id)
      .toBe('loading~spin');

    gate.resolve('ok');

    await expect(pending)
      .resolves
      .toBe('ok');
    expect((provider.getChildren(undefined)![1].iconPath as vscode.ThemeIcon).id)
      .not
      .toBe('loading~spin');
  });

  it('falls back to setTimeout when setImmediate is unavailable', async () => {
    const provider = createProvider();
    const action = jest.fn()
      .mockResolvedValue('ok');
    const globalWithImmediate = globalThis as {
      setImmediate?: unknown;
      setTimeout: typeof setTimeout;
    };
    const originalSetImmediate = globalWithImmediate.setImmediate;

    delete globalWithImmediate.setImmediate;

    try {
      await provider.runFlowAction('run', action);
    }
    finally {
      globalWithImmediate.setImmediate = originalSetImmediate;
    }

    expect(action)
      .toHaveBeenCalledTimes(1);
  });

  it('does not clobber a newer running flow state when an older action finishes', async () => {
    const provider = createProvider();
    const olderAction = deferred<string>();
    const newerAction = deferred<string>();

    const older = provider.runFlowAction('run', () => olderAction.promise);
    const newer = provider.runFlowAction('build', () => newerAction.promise);

    olderAction.resolve('older');
    await older;

    // The build action still owns the loading row: run must not clear it.
    const buildNode = provider.getChildren(undefined)![0];

    expect((buildNode.iconPath as vscode.ThemeIcon).id)
      .toBe('loading~spin');

    newerAction.resolve('newer');
    await newer;

    expect((provider.getChildren(undefined)![0].iconPath as vscode.ThemeIcon).id)
      .not
      .toBe('loading~spin');
  });

  it('merges the flowRunning context on parent debug and power rows', async () => {
    const provider = createProvider();
    const cpuDebugAction = deferred<string>();
    const running = provider.runFlowAction('cpuDebug', () => cpuDebugAction.promise);

    await new Promise((resolve) => setImmediate(resolve));
    const debugNode = provider.getChildren(undefined)!.find((node) => node.nodeId === 'debug')!;

    expect(debugNode.contextValue)
      .toBe(`${treeItemContextKey('debug')} ${treeItemContextKey('flowRunning')}`);

    cpuDebugAction.resolve('done');
    await running;
  });

  it('merges the flowRunning context on the power row while an onboard action runs', async () => {
    const provider = createProvider();
    const onboardAction = deferred<string>();
    const running = provider.runFlowAction('onboard', () => onboardAction.promise);

    await new Promise((resolve) => setImmediate(resolve));
    const powerNode = provider.getChildren(undefined)!.find((node) => node.nodeId === 'power')!;

    expect(powerNode.contextValue)
      .toBe(treeItemContextKey('flowRunning'));

    onboardAction.resolve('done');
    await running;
  });
});

describe('OperateTreeProvider flow execution helpers', () => {
  it('clears the executing row on demand', async () => {
    const provider = createProvider();
    const gate = deferred<string>();
    const pending = provider.runFlowAction('run', () => gate.promise);

    provider.clearFlowExecutionState();
    expect((provider.getChildren(undefined)![1].iconPath as vscode.ThemeIcon).id)
      .not
      .toBe('loading~spin');

    gate.resolve('done');
    await pending;
  });

  it('ignores clearFlowExecutionState on the operator-projects tree', () => {
    const provider = createProvider('operatorProjects');
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    provider.clearFlowExecutionState();
    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('notifies listeners on configuration change', () => {
    const provider = createProvider();
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    provider.notifyConfigurationChanged();
    expect(fire)
      .toHaveBeenCalled();
  });

  it('returns the element unchanged from getTreeItem', () => {
    const provider = createProvider();
    const node: OperateNode = {
      nodeId: 'build',
      label: 'build',
      collapsibleState: vscode.TreeItemCollapsibleState.None,
    } as OperateNode;

    expect(provider.getTreeItem(node))
      .toBe(node);
  });
});

describe('OperateTreeProvider.refreshState', () => {
  beforeEach(() => {
    mockGetProjectType.mockReset();
    mockCheckMultipleOperators.mockReset();
    mockGetSelectedOperatorIds.mockReset();
    mockGetSelectedOperatorIds.mockResolvedValue([]);
    mockSetSelectedOperators.mockReset();
    mockSetSelectedOperators.mockResolvedValue(undefined);
    mockSettingsRead.mockReset();
    mockSettingsRead.mockReturnValue(true);
    mockGetProjectType.mockResolvedValue({
      projectType: 'ascend-c',
      projectTemplateName: 'operator_template',
    });
    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: false,
      isStandardCustom: false,
      operators: [],
    });
  });

  it('returns empty flags and clears results state without a devtool config', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.reports = [
      {
        title: 'old.log',
        timestamp: 1,
        id: 'old',
        path: '/old.log',
        marked: false,
      },
    ];
    harness.state.performance.reports = [record('old', 1)];

    await expect(provider.refreshState(false))
      .resolves
      .toEqual({
        showOperatorSearch: false,
        showOperatorProjects: false,
      });
    expect(harness.state.sanitizer.reports)
      .toEqual([]);
    expect(harness.state.sanitizer.selectedReportPath)
      .toBeUndefined();
    expect(harness.state.sanitizer.selectedReportTitle)
      .toBeUndefined();
    expect(harness.state.sanitizer.selectedMessages)
      .toEqual([]);
    expect(harness.state.sanitizer.hideDuplicates)
      .toBe(false);
    expect(harness.state.performance.reports)
      .toEqual([]);
    expect(harness.state.performance.selectedReportKey)
      .toBeUndefined();
  });

  it('maps operators and shows search only, without standard custom', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: true,
      isStandardCustom: false,
      operators: [
        {
          id: 1,
          name: 'op-a',
          isExperimental: true,
        },
      ],
    });

    const result = await provider.refreshState(true);

    expect(result)
      .toEqual({
        showOperatorSearch: true,
        showOperatorProjects: false,
      });
    expect(harness.state.operators)
      .toEqual([
        {
          id: 1,
          name: 'op-a',
          hasEx: true,
          isCompiled: false,
        },
      ]);
    expect(harness.state.npuHardwareAvailable)
      .toBe(true);
    expect(harness.state.debugModeEnabled)
      .toBe(true);
    expect(harness.state.projectType)
      .toBe('ascend-c');
    expect(harness.state.projectTemplateName)
      .toBe('operator_template');
    expect(mockSettingsRead)
      .toHaveBeenCalledWith('debugMode', true);
  });

  it('applies the first-operator default selection once per workspace session', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: true,
      isStandardCustom: true,
      supportsSanitizerAndTuning: true,
      operators: [
        {
          id: 2,
          name: 'op-b',
          isExperimental: false,
        },
        {
          id: 1,
          name: 'op-a',
          isExperimental: false,
        },
      ],
    });

    const result = await provider.refreshState(true);

    expect(result)
      .toEqual({
        showOperatorSearch: true,
        showOperatorProjects: true,
      });
    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({ operatorIds: [1] });
    expect(harness.state.selectedOperatorIds)
      .toEqual([1]);
    expect(provider.hasMultipleOperators())
      .toBe(true);
    expect(provider.isStandardCustomContext())
      .toBe(true);

    // A second refresh keeps the applied selection.
    await provider.refreshState(true);
    expect(mockSetSelectedOperators)
      .toHaveBeenCalledTimes(1);
  });

  it('resets the default-selection flag when the workspace changes', async () => {
    const provider = createProvider();

    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: true,
      isStandardCustom: true,
      operators: [
        {
          id: 1,
          name: 'op-a',
          isExperimental: false,
        },
      ],
    });

    await provider.refreshState(true);
    (vscode.workspace as unknown as { workspaceFolders?: Array<{ uri: { fsPath: string } }> }).workspaceFolders = [{ uri: { fsPath: '/other-workspace' } }];

    await provider.refreshState(true);

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledTimes(2);
  });

  it('keeps a persisted operator selection', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    mockGetSelectedOperatorIds.mockResolvedValue([7]);
    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: true,
      isStandardCustom: true,
      operators: [
        {
          id: 7,
          name: 'op-a',
          isExperimental: false,
        },
      ],
    });

    await provider.refreshState(true);

    expect(harness.state.selectedOperatorIds)
      .toEqual([7]);
    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
  });

  it('does not burn the default-selection flag while the operator list is still unknown', async () => {
    const provider = createProvider();

    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: true,
      isStandardCustom: true,
      operators: [],
    });

    await provider.refreshState(true);
    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();

    // The list arrives later: the default must still be applied.
    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: true,
      isStandardCustom: true,
      operators: [
        {
          id: 3,
          name: 'op-c',
          isExperimental: false,
        },
      ],
    });
    await provider.refreshState(true);

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({ operatorIds: [3] });
  });
});

describe('OperateTreeProvider capability state setters', () => {
  it('reports cached multi-operator and standard-custom context', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.hasMultipleOperators = true;
    harness.state.isStandardCustom = true;

    expect(provider.hasMultipleOperators())
      .toBe(true);
    expect(provider.isStandardCustomContext())
      .toBe(true);
  });

  it('does not fire when the NPU hardware flag is unchanged', () => {
    const provider = createProvider();
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    provider.setNpuHardwareAvailable(true);
    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('fires and re-enables the run row when NPU hardware becomes available', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.npuHardwareAvailable = false;
    provider.setNpuHardwareAvailable(true);

    const runNode = provider.getChildren(undefined)!.find((node) => node.nodeId === 'run')!;

    expect(runNode.command)
      .toBeDefined();
  });

  it('toggles remote NPU availability with a fire', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.npuHardwareAvailable = false;
    provider.setRemoteNpuHardwareAvailable(true);

    expect(harness.state.remoteNpuHardwareAvailable)
      .toBe(true);
    expect(provider.getChildren(undefined)!.find((node) => node.nodeId === 'run')!.command)
      .toBeDefined();
  });

  it('does not fire when the remote NPU hardware flag is unchanged', () => {
    const provider = createProvider();
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    provider.setRemoteNpuHardwareAvailable(false);
    expect(fire)
      .not
      .toHaveBeenCalled();
  });
});

describe('OperateTreeProvider flow root nodes', () => {
  beforeEach(() => {
    mockGetBuildBehavior.mockReset();
    mockGetBuildBehavior.mockReturnValue(behavior());
    mockGetStTestSelectionState.mockReset();
    mockGetStTestSelectionState.mockReturnValue('none');
    mockShouldShowStTestAction.mockReset();
    mockShouldShowStTestAction.mockReturnValue(false);
  });

  it('builds the full action list for a supported project type', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.isStandardCustom = true;
    mockShouldShowStTestAction.mockReturnValue(true);
    mockGetStTestSelectionState.mockReturnValue('ready');

    const nodes = provider.getChildren(undefined) as OperateNode[];

    expect(nodes.map((node) => node.nodeId))
      .toEqual([
        'build',
        'run',
        'debug',
        'sanitizer',
        'power',
        'utTest',
        'stTest',
        'dumpTensor',
      ]);

    const [
      build,
      run,
      debug,
      sanitizer,
      power,
      utTest,
      stTest,
      dumpTensor,
    ] = nodes;

    expect(build.command)
      .toEqual({
        command: COMMAND_SIDEBAR_BUILD,
        title: 'web.operate.compileDeploy',
        arguments: undefined,
      });
    expect(run.command)
      .toEqual({
        command: COMMAND_SIDEBAR_RUN,
        title: 'web.operate.run',
        arguments: undefined,
      });
    expect(run.description)
      .toBe('- NPU');
    expect(debug.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(debug.contextValue)
      .toBe(treeItemContextKey('debug'));
    expect(sanitizer.command)
      .toEqual({
        command: COMMAND_SIDEBAR_SANITIZER,
        title: 'web.operate.sanitizer',
        arguments: undefined,
      });
    expect(sanitizer.description)
      .toBe('- NPU');
    expect(power.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(utTest.command)
      .toEqual({
        command: COMMAND_SIDEBAR_UT_TEST,
        title: 'web.operate.utTest',
        arguments: undefined,
      });
    expect(stTest.command)
      .toEqual({
        command: COMMAND_SIDEBAR_ST_TEST,
        title: 'web.operate.stTest',
        arguments: undefined,
      });
    expect(dumpTensor.command)
      .toEqual({
        command: COMMAND_SIDEBAR_DUMP_TENSOR,
        title: 'web.operate.dumpTensor',
        arguments: undefined,
      });
    expect(dumpTensor.description)
      .toBe('- NPU');
  });

  it('returns an empty root for an unsupported project type', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.projectType = 'unsupported-type';
    mockIsProjectTypeSupported.mockReturnValue(false);

    expect(provider.getChildren(undefined))
      .toEqual([]);
  });

  it('returns an empty root before the devtool config is known', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.hasDevtoolConfig = false;

    expect(provider.getChildren(undefined))
      .toEqual([]);
  });

  it('drops build-dependent rows when no build is required', () => {
    const provider = createProvider();

    mockGetBuildBehavior.mockReturnValue(behavior({
      requiresBuildBeforeAnalysis: false,
      supportsCpuDebug: false,
      supportsNpuDebug: false,
    }));

    const nodes = provider.getChildren(undefined) as OperateNode[];

    expect(nodes.map((node) => node.nodeId))
      .toEqual([
        'run',
        'sanitizer',
        'power',
      ]);
  });

  it('disables NPU actions when no NPU hardware is available', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.npuHardwareAvailable = false;
    harness.state.remoteNpuHardwareAvailable = false;
    harness.state.isStandardCustom = true;

    const nodes = provider.getChildren(undefined) as OperateNode[];

    const run = nodes.find((node) => node.nodeId === 'run')!;
    const sanitizer = nodes.find((node) => node.nodeId === 'sanitizer')!;
    const dumpTensor = nodes.find((node) => node.nodeId === 'dumpTensor')!;

    for (const node of [
      run,
      sanitizer,
      dumpTensor,
    ]) {
      expect(node.command)
        .toBeUndefined();
      expect(node.tooltip)
        .toBe('web.operate.remoteToolRequired');
      expect((node.iconPath as vscode.ThemeIcon).id)
        .toBe('circle-slash');
    }

    // utTest does not require NPU.
    const utTest = nodes.find((node) => node.nodeId === 'utTest')!;

    expect(utTest.command)
      .toBeDefined();
  });

  it('disables actions while multiple operators are selected', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.isStandardCustom = true;
    harness.state.selectedOperatorIds = [
      1,
      2,
    ];

    const nodes = provider.getChildren(undefined) as OperateNode[];

    const run = nodes.find((node) => node.nodeId === 'run')!;
    const sanitizer = nodes.find((node) => node.nodeId === 'sanitizer')!;
    const utTest = nodes.find((node) => node.nodeId === 'utTest')!;
    const dumpTensor = nodes.find((node) => node.nodeId === 'dumpTensor')!;

    for (const node of [
      run,
      sanitizer,
      utTest,
      dumpTensor,
    ]) {
      expect(node.command)
        .toBeUndefined();
      expect(node.tooltip)
        .toBe('web.operate.singleOperatorOnly');
      expect((node.iconPath as vscode.ThemeIcon).id)
        .toBe('circle-slash');
    }

    // The debug and performance-tuning sections mirror the disabled state of
    // their children.
    const debug = nodes.find((node) => node.nodeId === 'debug')!;
    const power = nodes.find((node) => node.nodeId === 'power')!;

    for (const node of [
      debug,
      power,
    ]) {
      expect((node.iconPath as vscode.ThemeIcon).id)
        .toBe('circle-slash');
    }
  });

  it('hides debug and power for standard custom without sanitizer support', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.isStandardCustom = true;
    harness.state.supportsSanitizerAndTuning = false;
    mockShouldShowStTestAction.mockReturnValue(true);

    const nodes = provider.getChildren(undefined) as OperateNode[];

    expect(nodes.map((node) => node.nodeId))
      .not
      .toContain('debug');
    expect(nodes.map((node) => node.nodeId))
      .not
      .toContain('power');
  });

  it('shows the st-test row with disabled state and tooltip when nothing is selected', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.isStandardCustom = true;
    mockShouldShowStTestAction.mockReturnValue(true);
    mockGetStTestSelectionState.mockReturnValue('none');

    const stTest = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'stTest')!;

    expect(stTest.command)
      .toBeUndefined();
    expect(stTest.tooltip)
      .toBe('web.operate.selectOneOperatorForStTest');
    expect((stTest.iconPath as vscode.ThemeIcon).id)
      .toBe('circle-slash');
  });

  it('shows the st-test row disabled for a multiple selection', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.isStandardCustom = true;
    harness.state.selectedOperatorIds = [
      1,
      2,
    ];
    mockShouldShowStTestAction.mockReturnValue(true);
    mockGetStTestSelectionState.mockReturnValue('multiple');

    const stTest = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'stTest')!;

    expect(stTest.tooltip)
      .toBe('web.operate.singleOperatorOnly');
  });
});

describe('OperateTreeProvider debug children', () => {
  beforeEach(() => {
    mockGetBuildBehavior.mockReset();
    mockGetBuildBehavior.mockReturnValue(behavior());
  });

  it('hides the cpu-debug row for the torch-library template', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.projectType = 'cann';
    harness.state.projectTemplateName = 'torch_library_template';

    const debugNode = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'debug')!;
    const children = provider.getChildren(debugNode) as OperateNode[];

    expect(children.map((node) => node.nodeId))
      .toEqual(['npuDebug']);
  });

  it('hides the cpu-debug row in standard-custom context', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.isStandardCustom = true;

    const debugNode = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'debug')!;
    const children = provider.getChildren(debugNode) as OperateNode[];

    expect(children.map((node) => node.nodeId))
      .toEqual(['npuDebug']);
  });

  it('hides the npu-debug row when debug mode is off', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.debugModeEnabled = false;

    const debugNode = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'debug')!;
    const children = provider.getChildren(debugNode) as OperateNode[];

    expect(children.map((node) => node.nodeId))
      .toEqual(['cpuDebug']);
  });

  it('renders cpu and npu debug rows with commands and descriptions', () => {
    const provider = createProvider();

    const debugNode = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'debug')!;
    const children = provider.getChildren(debugNode) as OperateNode[];

    expect(children.map((node) => node.nodeId))
      .toEqual([
        'cpuDebug',
        'npuDebug',
      ]);

    const [
      cpuDebug,
      npuDebug,
    ] = children;

    expect(cpuDebug.command)
      .toEqual({
        command: COMMAND_SIDEBAR_CPU_DEBUG,
        title: 'web.operate.cpuDebug',
        arguments: undefined,
      });
    expect(npuDebug.command)
      .toEqual({
        command: COMMAND_SIDEBAR_NPU_DEBUG,
        title: 'web.operate.npuDebug',
        arguments: undefined,
      });
    expect(npuDebug.description)
      .toBe('- NPU');
  });

  it('disables the npu-debug row when no NPU hardware is available', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.npuHardwareAvailable = false;
    harness.state.remoteNpuHardwareAvailable = false;

    const debugNode = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'debug')!;
    const children = provider.getChildren(debugNode) as OperateNode[];

    const npuDebug = children.find((node) => node.nodeId === 'npuDebug')!;

    expect(npuDebug.command)
      .toBeUndefined();
    expect(npuDebug.tooltip)
      .toBe('web.operate.remoteToolRequired');
  });
});

describe('OperateTreeProvider power children', () => {
  beforeEach(() => {
    mockGetBuildBehavior.mockReset();
    mockGetBuildBehavior.mockReturnValue(behavior());
  });

  it('renders on-board and simulation rows', () => {
    const provider = createProvider();

    const powerNode = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'power')!;
    const children = provider.getChildren(powerNode) as OperateNode[];

    expect(children.map((node) => node.nodeId))
      .toEqual([
        'onboard',
        'simulation',
      ]);

    const [
      onboard,
      simulation,
    ] = children;

    expect(onboard.command)
      .toEqual({
        command: COMMAND_SIDEBAR_ON_BOARD,
        title: 'web.operate.onBoardAnalysis',
        arguments: undefined,
      });
    expect(onboard.description)
      .toBe('- NPU');
    expect(onboard.contextValue)
      .toBe(treeItemContextKey('onboard'));
    expect(simulation.command)
      .toEqual({
        command: COMMAND_SIDEBAR_SIMULATION,
        title: 'web.operate.simulationAnalysis',
        arguments: undefined,
      });
    expect(simulation.contextValue)
      .toBe(treeItemContextKey('simulation'));
  });

  it('disables the on-board row without NPU hardware', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.npuHardwareAvailable = false;
    harness.state.remoteNpuHardwareAvailable = false;

    const powerNode = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'power')!;
    const children = provider.getChildren(powerNode) as OperateNode[];

    const onboard = children.find((node) => node.nodeId === 'onboard')!;

    expect(onboard.command)
      .toBeUndefined();
    expect(onboard.tooltip)
      .toBe('web.operate.remoteToolRequired');

    // Simulation stays enabled: no NPU requirement.
    expect(children.find((node) => node.nodeId === 'simulation')!.command)
      .toBeDefined();
  });

  it('renders only the supported rows when capabilities are partial', () => {
    const provider = createProvider();

    mockGetBuildBehavior.mockReturnValue(behavior({
      supportsOnBoard: false,
      supportsSimulate: true,
    }));

    const powerNode = (provider.getChildren(undefined) as OperateNode[])
      .find((node) => node.nodeId === 'power')!;
    const children = provider.getChildren(powerNode) as OperateNode[];

    expect(children.map((node) => node.nodeId))
      .toEqual(['simulation']);
  });

  it('returns an empty power section when neither capability is supported', () => {
    const provider = createProvider();

    mockGetBuildBehavior.mockReturnValue(behavior({
      supportsOnBoard: false,
      supportsSimulate: false,
    }));

    expect((provider.getChildren(undefined) as OperateNode[])
      .map((node) => node.nodeId))
      .not
      .toContain('power');
  });
});

describe('OperateTreeProvider performance results panel', () => {
  beforeEach(() => {
    mockGetRunData.mockReset();
    mockToggleRecordMark.mockReset();
    mockCopyReport.mockReset();
    mockDownloadReport.mockReset();
    mockOpenInsight.mockReset();
    mockOpenInsight.mockResolvedValue(undefined);
    mockOpenCsvFile.mockReset();
    mockOpenCsvFile.mockResolvedValue(undefined);
  });

  const executeCommandMock = vscode.commands.executeCommand as jest.MockedFunction<typeof vscode.commands.executeCommand>;

  it('shows the no-data placeholder for an empty results list', () => {
    const provider = createProvider();
    const nodes = provider.getPerformanceResultsPanelNodes();

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].nodeId)
      .toBe('performanceReportItem');
    expect(nodes[0].label)
      .toBe('web.perf.noData');
  });

  it('builds report rows with marked context and flag icon', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [
      record('r2', 2),
      {
        ...record('r1', 1),
        marked: true,
      },
    ];

    const nodes = provider.getPerformanceResultsPanelNodes();

    expect(nodes.map((node) => node.label))
      .toEqual([
        'r2',
        'r1',
      ]);
    expect(nodes[1].contextValue)
      .toBe(treeItemContextKey('performanceReportItem.marked'));
    expect((nodes[1].iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-flag-filled');
    expect(nodes[0].contextValue)
      .toBe(treeItemContextKey('performanceReportItem.unmarked'));
  });

  it('filters to marked reports when marked-only is on', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [
      {
        ...record('r1', 1),
        marked: true,
      },
      record('r2', 2),
    ];

    provider.setPerformanceMarkedOnly(true);

    expect(provider.isPerformanceMarkedOnlyEnabled())
      .toBe(true);
    expect(provider.getPerformanceResultsPanelNodes()
      .map((node) => node.label))
      .toEqual(['r1']);
  });

  it('updates a cached report row in place', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [record('r1', 1)];
    const first = provider.getPerformanceResultsPanelNodes()[0];

    harness.state.performance.reports = [
      {
        ...record('r1', 1),
        marked: true,
        title: 'renamed',
      },
    ];
    const second = provider.getPerformanceResultsPanelNodes()[0];

    expect(second)
      .toBe(first);
    expect(second.label)
      .toBe('renamed');
    expect(second.contextValue)
      .toBe(treeItemContextKey('performanceReportItem.marked'));
  });

  it('sorts reports in place by the current sort order', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [
      record('older', 1),
      record('newer', 2),
    ];

    provider.togglePerformanceSortOrder();

    expect(harness.state.performance.sortOrder)
      .toBe('asc');
    expect(harness.state.performance.reports.map((item) => item.key))
      .toEqual([
        'older',
        'newer',
      ]);
  });

  it('breaks timestamp ties by key in ascending order', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [
      record('b', 5),
      record('a', 5),
    ];
    provider.togglePerformanceSortOrder();

    expect(harness.state.performance.reports.map((item) => item.key))
      .toEqual([
        'a',
        'b',
      ]);
  });

  it('selects a report and syncs the selection context', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [record('r1', 1)];
    executeCommandMock.mockClear();

    provider.selectPerformanceReport('r1');

    expect(provider.getSelectedPerformanceReport()?.key)
      .toBe('r1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(executeCommandMock)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.performanceReportSelected`,
        true,
      );
    expect(executeCommandMock)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.performanceSelectedReportMarked`,
        false,
      );
  });

  it('returns undefined for an unknown selected report', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.selectedReportKey = 'ghost';

    expect(provider.getSelectedPerformanceReport())
      .toBeUndefined();
  });

  it('toggles the mark of a report through the persistence layer', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [record('r1', 1)];

    await provider.togglePerformanceReportMark('r1');

    expect(harness.state.performance.reports[0].marked)
      .toBe(true);
    expect(mockToggleRecordMark)
      .toHaveBeenCalledWith({
        key: 'r1',
        marked: true,
      });
  });

  it('rolls the mark back when persistence fails', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const showError = vscode.window.showErrorMessage as jest.Mock;
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    harness.state.performance.reports = [record('r1', 1)];
    mockToggleRecordMark.mockImplementation(() => {
      throw new Error('persist failed');
    });

    await provider.togglePerformanceReportMark('r1');

    expect(harness.state.performance.reports[0].marked)
      .toBe(false);
    expect(showError)
      .toHaveBeenCalledWith('web.perf.markFailed');
    expect(consoleError)
      .toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('ignores marking a report that no longer exists', async () => {
    const provider = createProvider();

    await provider.togglePerformanceReportMark('ghost');

    expect(mockToggleRecordMark)
      .not
      .toHaveBeenCalled();
  });

  it('copies and downloads a report directory', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    harness.state.performance.reports = [record('r1', 1)];

    await provider.copyPerformanceReportPath('r1');
    expect(mockCopyReport)
      .toHaveBeenCalledWith({ dirPath: '/reports/r1' });

    await provider.downloadPerformanceReport('r1');
    expect(mockDownloadReport)
      .toHaveBeenCalledWith({ dirPath: '/reports/r1' });

    await provider.copyPerformanceReportPath('ghost');
    await provider.downloadPerformanceReport('ghost');
    expect(mockCopyReport)
      .toHaveBeenCalledTimes(1);
    expect(mockDownloadReport)
      .toHaveBeenCalledTimes(1);
    expect(consoleError)
      .not
      .toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('survives copy and download failures', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    harness.state.performance.reports = [record('r1', 1)];
    mockCopyReport.mockRejectedValueOnce(new Error('copy failed'));
    mockDownloadReport.mockRejectedValueOnce(new Error('download failed'));

    await provider.copyPerformanceReportPath('r1');
    await provider.downloadPerformanceReport('r1');

    expect(consoleError)
      .toHaveBeenCalledTimes(2);

    consoleError.mockRestore();
  });

  it('opens performance files by type', async () => {
    const provider = createProvider();

    await provider.openPerformanceFile('/r.csv', 'csv');
    await provider.openPerformanceFile('/r.bin', 'bin');
    await provider.openPerformanceFile('/r.json', 'json');
    await provider.openPerformanceFile('/r.other', 'other');

    expect(mockOpenCsvFile)
      .toHaveBeenCalledWith('/r.csv');
    expect(mockOpenInsight)
      .toHaveBeenCalledTimes(2);
    expect(mockOpenInsight)
      .toHaveBeenCalledWith('/r.bin');
    expect(mockOpenInsight)
      .toHaveBeenCalledWith('/r.json');
  });

  it('renders report children and nested folders', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [
      record('r1', 1, [
        {
          title: 'folder-a',
          children: [
            {
              key: '/reports/r1/folder-a/a.csv',
              title: 'a.csv',
              filePath: '/reports/r1/folder-a/a.csv',
              fileType: 'csv',
            },
          ],
        },
        {
          key: '/reports/r1/b.bin',
          title: 'b.bin',
          filePath: '/reports/r1/b.bin',
          fileType: 'bin',
        },
      ]),
    ];

    const reportNode = provider.getPerformanceResultsPanelNodes()[0];
    const rootChildren = provider.getChildren(reportNode) as OperateNode[];

    expect(rootChildren.map((node) => node.nodeId))
      .toEqual([
        'performanceFolder',
        'performanceFile',
      ]);

    const [
      folderNode,
      fileNode,
    ] = rootChildren;

    expect((folderNode.iconPath))
      .toBeUndefined();
    expect(folderNode.contextValue)
      .toBe(treeItemContextKey('performanceFolder'));
    expect(folderNode.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(folderNode.id)
      .toBe(`performance-folder:${encodeURIComponent('r1')}:${encodeURIComponent('folder-a')}`);

    const fileChildren = provider.getChildren(folderNode) as OperateNode[];

    expect(fileChildren)
      .toHaveLength(1);
    expect(fileChildren[0].nodeId)
      .toBe('performanceFile');
    expect(fileChildren[0].command)
      .toEqual({
        command: COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
        title: 'a.csv',
        arguments: [
          '/reports/r1/folder-a/a.csv',
          'csv',
        ],
      });
    expect(fileChildren[0].contextValue)
      .toBe(treeItemContextKey('performanceFile.csv'));

    expect(fileNode.command)
      .toEqual({
        command: COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
        title: 'b.bin',
        arguments: [
          '/reports/r1/b.bin',
          'bin',
        ],
      });
  });

  it('returns an empty list for a missing report or folder', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [record('r1', 1)];

    expect(provider.getChildren({
      nodeId: 'performanceReportItem',
      id: `performance-report:${encodeURIComponent('ghost')}`,
    } as OperateNode))
      .toEqual([]);
    expect(provider.getChildren({
      nodeId: 'performanceFolder',
      id: `performance-folder:${encodeURIComponent('ghost')}:a`,
    } as OperateNode))
      .toEqual([]);

    const reportNode = provider.getPerformanceResultsPanelNodes()[0];

    expect(provider.getChildren({
      nodeId: 'performanceFolder',
      id: `performance-folder:${encodeURIComponent('r1')}:${encodeURIComponent('missing')}`,
    } as OperateNode))
      .toEqual([]);
    expect(provider.getChildren(reportNode))
      .toEqual([]);
  });

  it('renders an empty timestamp description for an invalid timestamp', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [{ ...record('r1', Number.NaN) }];

    const node = provider.getPerformanceResultsPanelNodes()[0];

    expect(node.description)
      .toBeUndefined();
  });

  it('reports null parents only for root report rows', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [record('r1', 1)];
    const reportNode = provider.getPerformanceResultsPanelNodes()[0];

    expect(provider.getPerformanceTreeParent(reportNode))
      .toBeNull();
    expect(provider.getPerformanceTreeParent({ nodeId: 'performanceFile' } as OperateNode))
      .toBeUndefined();
    expect(provider.getSanitizerTreeParent(reportNode))
      .toBeUndefined();
  });

  it('keeps the last inventory when a superseded refresh fails', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockGetRunData
      .mockRejectedValueOnce(new Error('scan failed'))
      .mockResolvedValueOnce({ data: [record('newer', 2)] });

    const failing = provider.refreshPerformanceReports();
    const winning = provider.refreshPerformanceReports();

    await Promise.all([
      failing,
      winning,
    ]);

    expect(consoleError)
      .not
      .toHaveBeenCalled();
    expect(harness.state.performance.reports.map((item) => item.key))
      .toEqual(['newer']);

    consoleError.mockRestore();
  });

  it('reveals nothing without a tree view and syncs the context only', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const reveal = (provider as unknown as {
      revealPerformanceReport(key: string, revision?: number): Promise<void>;
    }).revealPerformanceReport;

    harness.state.performance.reports = [record('r1', 1)];
    executeCommandMock.mockClear();

    await reveal.call(provider, 'r1');

    expect(executeCommandMock)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.performanceReportSelected`,
        true,
      );
  });

  it('skips reveal when the report no longer exists', async () => {
    const provider = createProvider();
    const reveal = (provider as unknown as {
      revealPerformanceReport(key: string, revision?: number): Promise<void>;
    }).revealPerformanceReport;

    await reveal.call(provider, 'ghost');

    expect(executeCommandMock)
      .not
      .toHaveBeenCalledWith(`${TREE_VIEW_PERFORMANCE_RESULTS}.focus`);
  });

  it('warns and keeps going when reveal fails', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const consoleWarn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    harness.state.performance.reports = [record('r1', 1)];
    provider.setPerformanceResultsTreeView({
      reveal: jest.fn()
        .mockRejectedValue(new Error('reveal failed')),
    } as unknown as vscode.TreeView<OperateNode>);

    const reveal = (provider as unknown as {
      revealPerformanceReport(key: string, revision?: number): Promise<void>;
    }).revealPerformanceReport;

    await reveal.call(provider, 'r1');

    expect(consoleWarn)
      .toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('opens no file when the report has no openable data file', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const open = (provider as unknown as {
      openPrimaryPerformanceReportFile(key: string, revision: number): Promise<void>;
    }).openPrimaryPerformanceReportFile;

    harness.state.performance.reports = [
      record('r1', 1, [
        {
          key: '/reports/r1/a.txt',
          title: 'a.txt',
          filePath: '/reports/r1/a.txt',
          fileType: 'txt',
        },
      ]),
    ];

    await open.call(provider, 'r1', 0);
    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
  });

  it('skips opening a report that vanished from the inventory', async () => {
    const provider = createProvider();
    const open = (provider as unknown as {
      openPrimaryPerformanceReportFile(key: string, revision: number): Promise<void>;
    }).openPrimaryPerformanceReportFile;

    await open.call(provider, 'ghost', 0);
    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
  });

  it('refuses to open when the refresh was superseded', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const open = (provider as unknown as {
      openPrimaryPerformanceReportFile(key: string, revision: number): Promise<void>;
    }).openPrimaryPerformanceReportFile;

    harness.state.performance.reports = [
      record('r1', 1, [
        {
          key: '/reports/r1/a.bin',
          title: 'a.bin',
          filePath: '/reports/r1/a.bin',
          fileType: 'bin',
        },
      ]),
    ];

    await open.call(provider, 'r1', 1);
    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
  });

  it('dispatches performanceResultsRoot children through getChildren', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [record('r1', 1)];
    const viaRoot = provider.getChildren({ nodeId: 'performanceResultsRoot' } as OperateNode) as OperateNode[];
    const direct = provider.getPerformanceResultsPanelNodes();

    expect(viaRoot)
      .toEqual(direct);
    expect(viaRoot[0].nodeId)
      .toBe('performanceReportItem');
  });

  it('finds the newest among several freshly added reports', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const find = (provider as unknown as {
      findNewPerformanceReportKey(previousKeys: Set<string>): string | undefined;
    }).findNewPerformanceReportKey;

    harness.state.performance.reports = [
      record('old', 1),
      record('mid', 2),
      record('new', 3),
    ];

    expect(find.call(provider, new Set(['old'])))
      .toBe('new');
  });

  it('stops the reveal when the refresh is superseded after focusing', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const executeCommandMock = vscode.commands.executeCommand as jest.MockedFunction<typeof vscode.commands.executeCommand>;
    const focusGate = deferred<void>();
    const reveal = jest.fn();
    const revealPerformanceReport = (provider as unknown as {
      revealPerformanceReport(key: string, revision?: number): Promise<void>;
    }).revealPerformanceReport;

    harness.state.performance.reports = [record('r1', 1)];
    provider.setPerformanceResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    executeCommandMock.mockImplementation((command: string) => (
      command === `${TREE_VIEW_PERFORMANCE_RESULTS}.focus`
        ? focusGate.promise
        : Promise.resolve(undefined)
    ));

    const pending = revealPerformanceReport.call(provider, 'r1', 0);

    // Let the focus command start, then supersede the refresh while it is in flight.
    await new Promise((resolve) => setImmediate(resolve));
    (provider as unknown as { performanceRefreshRevision: number }).performanceRefreshRevision = 1;
    focusGate.resolve();

    await pending;

    expect(executeCommandMock)
      .toHaveBeenCalledWith(`${TREE_VIEW_PERFORMANCE_RESULTS}.focus`);
    expect(reveal)
      .not
      .toHaveBeenCalled();
  });

  it('stops the reveal when the refresh is superseded while the tree reveals', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const executeCommandMock = vscode.commands.executeCommand as jest.MockedFunction<typeof vscode.commands.executeCommand>;
    const revealGate = deferred<void>();
    const reveal = jest.fn()
      .mockReturnValue(revealGate.promise);
    const revealPerformanceReport = (provider as unknown as {
      revealPerformanceReport(key: string, revision?: number): Promise<void>;
    }).revealPerformanceReport;

    harness.state.performance.reports = [record('r1', 1)];
    provider.setPerformanceResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);

    const pending = revealPerformanceReport.call(provider, 'r1', 0);

    // Focus is done; supersede the refresh while the tree reveal is in flight.
    await new Promise((resolve) => setImmediate(resolve));
    (provider as unknown as { performanceRefreshRevision: number }).performanceRefreshRevision = 1;
    revealGate.resolve();

    await pending;

    expect(reveal)
      .toHaveBeenCalledTimes(1);
    expect(executeCommandMock)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.performanceReportSelected`,
        true,
      );
  });

  it('skips the context sync superseded by a newer sync', async () => {
    const provider = createProvider();
    const sync = (provider as unknown as {
      syncPerformanceSelectionContext(): Promise<void>;
    }).syncPerformanceSelectionContext;

    const first = sync.call(provider);
    const second = sync.call(provider);

    await Promise.all([
      first,
      second,
    ]);

    const setContextCalls = (vscode.commands.executeCommand as jest.MockedFunction<typeof vscode.commands.executeCommand>)
      .mock.calls
      .filter(([command]) => command === 'setContext');

    // Only the newer sync reaches the context writes; the older one bails out stale.
    expect(setContextCalls)
      .toHaveLength(2);
  });
});

describe('OperateTreeProvider icon theming', () => {
  beforeEach(() => {
    mockGetBuildBehavior.mockReset();
    mockGetBuildBehavior.mockReturnValue(behavior());
    mockGetStTestSelectionState.mockReset();
    mockGetStTestSelectionState.mockReturnValue('none');
    mockShouldShowStTestAction.mockReset();
    mockShouldShowStTestAction.mockReturnValue(false);
  });

  const queuedBuildIconPath = (): string => {
    const provider = createProvider();

    provider.setQueuedFlowStates({ build: 'queued' });
    const buildNode = provider.getChildren(undefined)![0];

    return (buildNode.iconPath as { fsPath: string }).fsPath;
  };

  it('picks the light hourglass asset in light theme', () => {
    (vscode.window as unknown as { activeColorTheme: { kind: number } }).activeColorTheme.kind = vscode.ColorThemeKind.Light;

    expect(queuedBuildIconPath())
      .toContain('hourglass-light.svg');
  });

  it('picks the high-contrast-light hourglass asset', () => {
    (vscode.window as unknown as { activeColorTheme: { kind: number } }).activeColorTheme.kind = vscode.ColorThemeKind.HighContrastLight;

    expect(queuedBuildIconPath())
      .toContain('hourglass-high-contrast-light.svg');
  });

  it('picks the high-contrast hourglass asset', () => {
    (vscode.window as unknown as { activeColorTheme: { kind: number } }).activeColorTheme.kind = vscode.ColorThemeKind.HighContrast;

    expect(queuedBuildIconPath())
      .toContain('hourglass-high-contrast.svg');
  });

  it('picks the dark hourglass asset in dark theme', () => {
    (vscode.window as unknown as { activeColorTheme: { kind: number } }).activeColorTheme.kind = vscode.ColorThemeKind.Dark;

    expect(queuedBuildIconPath())
      .toContain('hourglass-dark.svg');
  });
});
