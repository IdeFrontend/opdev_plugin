import type { PerformanceExecutionRecord } from '@shared/api-types';
import { treeItemContextKey } from '@shared/flavor';
import { COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP } from '../../constants';

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
const mockLoadSanitizerPanelData = jest.fn();
const mockGetSanitizerRunData = jest.fn();
const mockToggleSanitizerMark = jest.fn();
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

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

  class MarkdownString {
    isTrusted?: boolean;

    constructor(public value: string) {}
  }

  return {
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    EventEmitter,
    MarkdownString,
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
    // Unset language: getLocaleForSort must fall back to undefined.
    env: { language: undefined },
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
jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: { loadSanitizerPanelData: (...args: unknown[]) => mockLoadSanitizerPanelData(...args) } }));
jest.mock('@plugin/service/run-data-service', () => ({
  runDataService: {
    getSanitizerRunData: (...args: unknown[]) => mockGetSanitizerRunData(...args),
    toggleSanitizerMark: (...args: unknown[]) => mockToggleSanitizerMark(...args),
  },
}));
jest.mock('@plugin/helpers/st-test-action', () => ({
  getStTestSelectionState: (...args: unknown[]) => mockGetStTestSelectionState(...args),
  shouldShowStTestAction: (...args: unknown[]) => mockShouldShowStTestAction(...args),
}));

import * as vscode from 'vscode';
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

type SanitizerMessage = {
  title?: string;
  type: 'error' | 'warning';
  questionType?: string;
  question?: string;
  fileLink?: string;
  row?: number;
  col?: number;
  msAgentIndex?: number;
  originData?: string;
  sourceTool?: 'mssanitizer' | 'npu-check';
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
      selectedMessages: SanitizerMessage[];
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

type CacheHarness = {
  sanitizerVisibleMessagesCache: Map<string, SanitizerMessage[]>;
  sanitizerVisibleDerivedCache: Map<string, unknown[]>;
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

const reportRecord = (reportPath: string, timestamp: number, marked = false): SanitizerReportRecord => ({
  title: reportPath.split('/')
    .pop() ?? reportPath,
  timestamp,
  id: `sanitizer_${reportPath}`,
  path: reportPath,
  marked,
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

const message = (overrides: Partial<SanitizerMessage> = {}): SanitizerMessage => ({
  title: 'boom',
  type: 'error',
  questionType: 'memory',
  question: 'illegal read of size',
  originData: '',
  ...overrides,
});

const createProvider = (kind: 'flow' | 'operatorProjects' = 'flow'): OperateTreeProvider => {
  const provider = new OperateTreeProvider(vscode.Uri.file('/extension'), kind);

  (provider as unknown as StateHarness).state = createState();

  return provider;
};

const reportNode = (reportPath: string): OperateNode => ({
  nodeId: 'sanitizerReportItem',
  id: `sanitizer-report:${encodeURIComponent(reportPath)}`,
} as unknown as OperateNode);

beforeEach(() => {
  mockGetProjectType.mockReset();
  mockGetProjectType.mockResolvedValue({
    projectType: 'ascend-c',
    projectTemplateName: 'operator_template',
  });
  mockCheckMultipleOperators.mockReset();
  mockCheckMultipleOperators.mockResolvedValue({
    hasMultiple: false,
    isStandardCustom: false,
    operators: [],
  });
  mockGetSelectedOperatorIds.mockReset();
  mockSetSelectedOperators.mockReset();
  mockSettingsRead.mockReset();
  mockSettingsRead.mockReturnValue(true);
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
  mockGetRunData.mockReset();
  mockLoadSanitizerPanelData.mockReset();
  mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
  mockExistsSync.mockReset();
  mockExistsSync.mockReturnValue(true);
  mockStatSync.mockReset();
  mockStatSync.mockReturnValue({
    isFile: () => true,
    mtimeMs: 42,
  });
  (vscode.commands.executeCommand as jest.Mock)
    .mockReset();
  (vscode.commands.executeCommand as jest.Mock)
    .mockResolvedValue(undefined);
  (vscode.window as unknown as { activeColorTheme: { kind: number } }).activeColorTheme.kind = vscode.ColorThemeKind.Dark;
  (vscode.workspace as unknown as { workspaceFolders?: Array<{ uri: { fsPath: string } }> }).workspaceFolders = undefined;
});

describe('locale and queue state fallbacks', () => {
  it('getLocaleForSort falls back to undefined when env.language is unset', () => {
    const provider = createProvider();

    expect((provider as unknown as { getLocaleForSort(): string | undefined }).getLocaleForSort())
      .toBeUndefined();
  });

  it('setQueuedFlowStates(undefined) clears a previously queued state and fires', () => {
    const provider = createProvider();
    const emitter = (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter;

    provider.setQueuedFlowStates({ run: 'queued' });
    provider.setQueuedFlowStates(undefined);

    expect(emitter.fire)
      .toHaveBeenCalledTimes(2);
  });

  it('setCompileRunGateUiState(undefined) clears a previously set gate state and fires', () => {
    const provider = createProvider();
    const emitter = (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter;

    provider.setCompileRunGateUiState({ build: 'running' });
    provider.setCompileRunGateUiState(undefined);

    expect(emitter.fire)
      .toHaveBeenCalledTimes(2);
  });
});

describe('refreshState combos', () => {
  it('defaults missing multiple-result fields with a multi-operator standard-custom=false scan', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.remoteNpuHardwareAvailable = undefined as unknown as boolean;
    mockCheckMultipleOperators.mockResolvedValueOnce({
      hasMultiple: true,
      isStandardCustom: false,
    });
    mockGetProjectType.mockResolvedValueOnce({
      projectType: '',
      projectTemplateName: '',
    });

    const result = await provider.refreshState(true);

    expect(result)
      .toEqual({
        showOperatorSearch: true,
        showOperatorProjects: false,
      });
    expect(harness.state.projectType)
      .toBe('');
    expect(harness.state.projectTemplateName)
      .toBe('');
    expect(harness.state.remoteNpuHardwareAvailable)
      .toBe(false);
    expect(harness.state.supportsSanitizerAndTuning)
      .toBe(true);
    expect(harness.state.operators)
      .toEqual([]);
    expect(mockGetSelectedOperatorIds)
      .not.toHaveBeenCalled();
  });

  it('keeps the search visible for a standard-custom single-operator scan', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    mockCheckMultipleOperators.mockResolvedValueOnce({
      hasMultiple: false,
      isStandardCustom: true,
      operators: [],
    });
    mockGetProjectType.mockResolvedValueOnce({
      projectType: '',
      projectTemplateName: '',
    });
    mockGetSelectedOperatorIds.mockResolvedValue(undefined);

    const result = await provider.refreshState(true);

    expect(result)
      .toEqual({
        showOperatorSearch: true,
        showOperatorProjects: false,
      });
    expect(harness.state.isStandardCustom)
      .toBe(true);
    expect(harness.state.hasMultipleOperators)
      .toBe(false);
    expect(mockGetSelectedOperatorIds)
      .toHaveBeenCalledTimes(1);
  });
});

describe('sanitizer report root cache', () => {
  it('addSanitizerReportFromPath replaces the noReports placeholder with the new report row', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isFile: () => true,
      mtimeMs: 42,
    });
    mockLoadSanitizerPanelData.mockReturnValue({});

    expect(provider.getSanitizerReportsPanelNodes())
      .toHaveLength(1);

    await provider.addSanitizerReportFromPath('/reports/r.log');

    const nodes = provider.getSanitizerReportsPanelNodes();

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].id)
      .toBe('sanitizer-report:%2Freports%2Fr.log');
    expect(harness.state.sanitizer.reports[0].path)
      .toBe('/reports/r.log');
    expect(mockLoadSanitizerPanelData)
      .toHaveBeenCalled();
  });
});

describe('sanitizer duplicate message keys', () => {
  const dedupe = (provider: OperateTreeProvider, messages: SanitizerMessage[]): SanitizerMessage[] =>
    (provider as unknown as {
      dedupeSanitizerMessages(messages: SanitizerMessage[], reportPath?: string): SanitizerMessage[];
    }).dedupeSanitizerMessages
      .call(provider, messages);

  it('keeps messages that share a fast key but differ in details when no file fields exist', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.hideDuplicates = true;

    const result = dedupe(provider, [
      message({
        title: undefined,
        fileLink: undefined,
        row: undefined,
        col: undefined,
        originData: '',
      }),
      message({
        title: undefined,
        fileLink: undefined,
        row: undefined,
        col: undefined,
        originData: 'a real detail line',
      }),
    ]);

    expect(result)
      .toHaveLength(2);
  });

  it('collapses messages with identical file fields and stack signatures', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.hideDuplicates = true;

    const result = dedupe(provider, [
      message({
        title: 'same',
        fileLink: '/ws/src/a.cpp',
        row: 10,
        col: 5,
        originData: '#0 /ws/src/a.cpp:10:5',
      }),
      message({
        title: 'same',
        fileLink: '/ws/src/a.cpp',
        row: 10,
        col: 5,
        originData: '#0 /ws/src/a.cpp:10:5',
      }),
    ]);

    expect(result)
      .toHaveLength(1);
  });

  it('falls back to file:row:col when the origin has no stack frames', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.hideDuplicates = true;

    const result = dedupe(provider, [
      message({
        title: 'same',
        fileLink: '/ws/src/a.cpp',
        row: 10,
        col: 5,
        originData: 'plain detail without frames',
      }),
      message({
        title: 'same',
        fileLink: '/ws/src/a.cpp',
        row: 10,
        col: 5,
        originData: 'plain detail without frames',
      }),
    ]);

    expect(result)
      .toHaveLength(1);
  });
});

describe('resolveTreeItem tooltip fallbacks', () => {
  function prepopulate(provider: OperateTreeProvider, workspacePath: string | undefined, messages: SanitizerMessage[]): string {
    const cacheKey = `/reports/r.log\n${(workspacePath ?? '').toLowerCase()}\nall`;
    const caches = provider as unknown as CacheHarness;

    caches.sanitizerVisibleMessagesCache.set(cacheKey, messages);
    caches.sanitizerVisibleDerivedCache.set(cacheKey, []);

    return cacheKey;
  }

  function tooltipNode(): OperateNode {
    return {
      nodeId: 'sanitizerMessage',
      sanitizerTooltipMeta: {
        reportPath: '/reports/r.log',
        globalIndex: 0,
      },
    } as unknown as OperateNode;
  }

  it('falls back to the raw question as the problem type when derived data is absent', async () => {
    const provider = createProvider();
    const node = tooltipNode();

    prepopulate(provider, undefined, [message({ originData: '' })]);

    await provider.resolveTreeItem(node, node, {} as vscode.CancellationToken);

    expect((node.tooltip as vscode.MarkdownString).value)
      .toContain('illegal read of size');
  });

  it('strips the workspace prefix from stack frames when a workspace folder is open', async () => {
    const provider = createProvider();

    (vscode.workspace as unknown as { workspaceFolders?: Array<{ uri: { fsPath: string } }> }).workspaceFolders = [{ uri: { fsPath: '/ws' } }];
    const node = tooltipNode();

    prepopulate(provider, '/ws', [message({ originData: '#0 /ws/src/a.cpp:10:5' })]);

    await provider.resolveTreeItem(node, node, {} as vscode.CancellationToken);

    const tooltip = (node.tooltip as vscode.MarkdownString).value;

    expect(tooltip)
      .toContain('src/a.cpp:10:5');
    expect(tooltip)
      .not.toContain('/ws/src/a.cpp:10:5');
  });

  it('keeps an absolute stack frame path when it is outside the workspace', async () => {
    const provider = createProvider();

    (vscode.workspace as unknown as { workspaceFolders?: Array<{ uri: { fsPath: string } }> }).workspaceFolders = [{ uri: { fsPath: '/ws' } }];
    const node = tooltipNode();

    prepopulate(provider, '/ws', [message({ originData: '#0 /outside/x.cpp:1:2' })]);

    await provider.resolveTreeItem(node, node, {} as vscode.CancellationToken);

    expect((node.tooltip as vscode.MarkdownString).value)
      .toContain('/outside/x.cpp:1:2');
  });
});

describe('getChildren fallbacks for partial nodes', () => {
  it('resolves empty ids for report, class, and performance nodes without one', async () => {
    const provider = createProvider();

    expect(provider.getChildren({ nodeId: 'sanitizerReportItem' } as unknown as OperateNode))
      .toEqual([]);
    expect(provider.getChildren({ nodeId: 'sanitizerClass' } as unknown as OperateNode))
      .toEqual([]);
    expect(provider.getChildren({ nodeId: 'performanceReportItem' } as unknown as OperateNode))
      .toEqual([]);
    expect(provider.getChildren({ nodeId: 'performanceFolder' } as unknown as OperateNode))
      .toEqual([]);
    expect(provider.getChildren({ nodeId: 'sanitizerMessage' } as unknown as OperateNode))
      .toEqual([]);
  });

  it('maps legacy group ids against the selected messages', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    harness.state.sanitizer.selectedMessages = [
      message({
        title: 'err',
        question: 'myquestion',
        fileLink: '/ws/src/a.cpp',
        row: 10,
        col: 5,
        msAgentIndex: 2,
      }),
      message({
        title: 'err2',
        type: 'warning',
        question: 'myquestion',
      }),
    ];

    const nodes = provider.getChildren({
      nodeId: 'sanitizerClass',
      id: 'sanitizer-group:type:myquestion',
    } as unknown as OperateNode) as OperateNode[];

    expect(nodes)
      .toHaveLength(2);
    expect((nodes[0].command as { command: string }).command)
      .toBe(COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP);
    expect(nodes[0].contextValue)
      .toBe(treeItemContextKey('sanitizerMessage.aiFix'));
    expect(nodes[0].description)
      .toBe('a.cpp 10:5');
    expect(nodes[1].command)
      .toBeUndefined();
    expect(nodes[1].contextValue)
      .toBeUndefined();
    expect(nodes[1].description)
      .toBeUndefined();
  });

  it('maps a class group id without the legacy prefix', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.selectedMessages = [
      message({
        questionType: 'memory',
        question: 'q1',
      }),
      message({
        questionType: 'memory',
        question: 'q1',
      }),
    ];

    const nodes = provider.getChildren({
      nodeId: 'sanitizerClass',
      id: 'class:memory',
    } as unknown as OperateNode) as OperateNode[];

    expect(nodes)
      .toHaveLength(2);
  });

  it('maps an empty legacy group id to an empty result', async () => {
    const provider = createProvider();

    expect(provider.getChildren({
      nodeId: 'sanitizerClass',
      id: 'sanitizer-group:',
    } as unknown as OperateNode))
      .toEqual([]);
  });
});

describe('getSanitizerResultGroups', () => {
  const groups = (provider: OperateTreeProvider, mode: 'class' | 'severity' | 'type' | 'file'): Array<{ key: string;
    label: string | undefined;
    messages: SanitizerMessage[] }> =>
    (provider as unknown as {
      getSanitizerResultGroups(mode: 'class' | 'severity' | 'type' | 'file'): Array<{ key: string;
        label: string;
        messages: SanitizerMessage[] }>;
    }).getSanitizerResultGroups(mode);

  it('groups an unknown question type under other in class mode', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.selectedMessages = [message({ questionType: 'weird' })];

    expect(groups(provider, 'class'))
      .toEqual([
        {
          key: 'other',
          label: 'web.sanitizerPanel.other',
          messages: harness.state.sanitizer.selectedMessages,
        },
      ]);
  });

  it('uses the unknown bucket for a question-less message in type mode', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.selectedMessages = [message({ question: undefined })];

    expect(groups(provider, 'type'))
      .toEqual([
        {
          key: 'unknown',
          label: undefined,
          messages: harness.state.sanitizer.selectedMessages,
        },
      ]);
  });

  it('labels file groups relative to the open workspace folder', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    (vscode.workspace as unknown as { workspaceFolders?: Array<{ uri: { fsPath: string } }> }).workspaceFolders = [{ uri: { fsPath: 'C:/ws' } }];
    harness.state.sanitizer.selectedMessages = [
      message({ fileLink: 'C:/ws/src/a.cpp' }),
      message({ fileLink: 'C:/ws' }),
      message({ fileLink: 'C:/outside/x.cpp' }),
    ];

    expect(groups(provider, 'file')
      .map((group) => group.label))
      .toEqual([
        'C:/outside/x.cpp',
        'C:/ws',
        'src/a.cpp',
      ]);
  });

  it('keeps absolute file labels when no workspace folder is open', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.selectedMessages = [
      message({ fileLink: 'C:/outside/x.cpp' }),
      message({ fileLink: 'C:/ws/src/a.cpp' }),
    ];

    expect(groups(provider, 'file')
      .map((group) => group.label))
      .toEqual([
        'C:/outside/x.cpp',
        'C:/ws/src/a.cpp',
      ]);
  });
});

describe('grouped report nodes', () => {
  const reportData = async (provider: OperateTreeProvider, data: SanitizerMessage[], mode: 'class' | 'severity' | 'type' | 'file'): Promise<OperateNode[]> => {
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.resultsGroupBy = mode;
    harness.state.sanitizer.reports = [reportRecord('/reports/r.log', 100)];
    mockLoadSanitizerPanelData.mockReturnValue({ data });

    return provider.getChildren(reportNode('/reports/r.log')) as Promise<OperateNode[]>;
  };

  it('lists npu-check messages directly without the other group in class mode', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({
        title: 'redundant SET_FLAG',
        type: 'warning',
        questionType: 'other',
        question: 'redundant SET_FLAG',
        sourceTool: 'npu-check',
      }),
      message({
        title: 'Invalid GM read',
        questionType: 'other',
        question: 'Invalid GM read',
        fileLink: '/mnt/x/a.asc',
        row: 84,
        col: 9,
        sourceTool: 'npu-check',
      }),
    ], 'class');

    expect(nodes)
      .toHaveLength(2);
    expect(nodes.every((node) => node.nodeId === 'sanitizerMessage'))
      .toBe(true);
    expect(nodes.some((node) => node.nodeId === 'sanitizerClass'))
      .toBe(false);
    // Severity ordering is preserved (errors before warnings).
    expect(nodes.map((node) => node.label))
      .toEqual([
        'Invalid GM read',
        'redundant SET_FLAG',
      ]);
    expect(nodes[0].id)
      .toBe(`sanitizer-msg:${encodeURIComponent('/reports/r.log')}:class:flat:1:0`);
    expect((nodes[0].command as { arguments?: string[] }).arguments)
      .toEqual(['1']);
  });

  it('keeps the other group for mssanitizer messages in class mode', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({
        questionType: 'other',
        question: 'custom sanitizer issue',
      }),
    ], 'class');

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].nodeId)
      .toBe('sanitizerClass');
    expect(nodes[0].id)
      .toBe(`sanitizer-report-group:${encodeURIComponent('/reports/r.log')}:class:${encodeURIComponent('other')}`);
  });

  it('keeps severity groups for npu-check messages in severity mode', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({
        questionType: 'other',
        question: 'Invalid GM read',
        sourceTool: 'npu-check',
      }),
    ], 'severity');

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].nodeId)
      .toBe('sanitizerClass');
    expect(nodes[0].id)
      .toBe(`sanitizer-report-group:${encodeURIComponent('/reports/r.log')}:severity:${encodeURIComponent('error')}`);
  });

  it('groups npu-check messages again once they carry a question type', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({
        questionType: 'memory',
        question: 'Invalid GM read',
        sourceTool: 'npu-check',
      }),
    ], 'class');

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].nodeId)
      .toBe('sanitizerClass');
    expect(nodes[0].id)
      .toBe(`sanitizer-report-group:${encodeURIComponent('/reports/r.log')}:class:${encodeURIComponent('memory')}`);
  });

  it('sorts within a class group stably when severity and rank match', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({
        questionType: 'memory',
        question: 'q1',
      }),
      message({
        questionType: 'memory',
        question: 'q2',
      }),
    ], 'class');

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].id)
      .toBe(`sanitizer-report-group:${encodeURIComponent('/reports/r.log')}:class:${encodeURIComponent('memory')}`);
  });

  it('sorts within a type group stably when labels match', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({ question: 'q1' }),
      message({ question: 'q1' }),
    ], 'type');

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].description)
      .toBe('2 🔴');
  });

  it('groups a question-less message under unknown in type mode', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [message({ question: '' })], 'type');

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].id)
      .toBe(`sanitizer-report-group:${encodeURIComponent('/reports/r.log')}:type:${encodeURIComponent('unknown')}`);
  });

  it('sorts severity groups with the error group first', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({
        type: 'warning',
        question: 'q1',
      }),
      message({
        type: 'error',
        question: 'q2',
      }),
      message({
        type: 'leak',
        question: 'q3',
      }),
    ], 'severity');

    expect(nodes.map((node) => (node.iconPath as vscode.ThemeIcon).id))
      .toEqual([
        'opdevtools-group-severity-error',
        'opdevtools-group-severity-warning',
        'opdevtools-group-severity-error',
      ]);
  });

  it('renders an empty node list when the panel data has no messages array', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.reports = [reportRecord('/reports/r.log', 100)];
    mockLoadSanitizerPanelData.mockReturnValue({});

    const nodes = await provider.getChildren(reportNode('/reports/r.log')) as OperateNode[];

    expect(nodes)
      .toEqual([]);
  });

  it('sorts within a file group stably when labels match', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({ fileLink: '/ws/src/a.cpp' }),
      message({ fileLink: '/ws/src/a.cpp' }),
    ], 'file');

    expect(nodes)
      .toHaveLength(1);
  });

  it('describes severity groups with message counts and severity icons', async () => {
    const provider = createProvider();
    const nodes = await reportData(provider, [
      message({
        type: 'error',
        question: 'q1',
      }),
      message({
        type: 'warning',
        question: 'q2',
      }),
    ], 'severity');

    expect(nodes)
      .toHaveLength(2);
    expect(nodes[0].description)
      .toBe('1');
    expect((nodes[0].iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-group-severity-error');
    expect((nodes[1].iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-group-severity-warning');
  });

  it('builds file-mode message rows without a description', async () => {
    const provider = createProvider();
    const groupNodes = await reportData(provider, [
      message({ fileLink: '/ws/src/a.cpp' }),
      message({ fileLink: '/ws/src/a.cpp' }),
    ], 'file');
    const messageNodes = await provider.getChildren(groupNodes[0]) as OperateNode[];

    expect(messageNodes)
      .toHaveLength(2);
    expect(messageNodes[0].description)
      .toBeUndefined();
  });
});

describe('tree parents', () => {
  it('getPerformanceTreeParent returns null only for performance report rows', () => {
    const provider = createProvider();

    expect(provider.getPerformanceTreeParent({
      nodeId: 'performanceReportItem',
      id: 'performance-report:x',
    } as unknown as OperateNode))
      .toBeNull();
    expect(provider.getPerformanceTreeParent({ nodeId: 'performanceReportItem' } as unknown as OperateNode))
      .toBeUndefined();
  });

  it('getSanitizerTreeParent returns null only for sanitizer report rows', () => {
    const provider = createProvider();

    expect(provider.getSanitizerTreeParent({
      nodeId: 'sanitizerReportItem',
      id: 'sanitizer-report:x',
    } as unknown as OperateNode))
      .toBeNull();
    expect(provider.getSanitizerTreeParent({ nodeId: 'sanitizerReportItem' } as unknown as OperateNode))
      .toBeUndefined();
  });
});

describe('disabled flow action icons', () => {
  const withTwoSelectedOperators = (provider: OperateTreeProvider): void => {
    const harness = provider as unknown as StateHarness;

    harness.state.operators = [
      {
        id: 1,
        name: 'a',
        hasEx: false,
        isCompiled: true,
      },
      {
        id: 2,
        name: 'b',
        hasEx: false,
        isCompiled: true,
      },
    ];
    harness.state.selectedOperatorIds = [
      1,
      2,
    ];
  };

  it('shows the disabled icon on cpuDebug and npuDebug with multiple selected operators', () => {
    const provider = createProvider();

    withTwoSelectedOperators(provider);

    const nodes = provider.getChildren({ nodeId: 'debug' } as unknown as OperateNode) as OperateNode[];
    const cpuDebug = nodes.find((node) => node.nodeId === 'cpuDebug');
    const npuDebug = nodes.find((node) => node.nodeId === 'npuDebug');

    expect((cpuDebug?.iconPath as vscode.ThemeIcon).id)
      .toBe('circle-slash');
    expect((npuDebug?.iconPath as vscode.ThemeIcon).id)
      .toBe('circle-slash');
  });

  it('shows the disabled icon on simulation with multiple selected operators', () => {
    const provider = createProvider();

    withTwoSelectedOperators(provider);

    const nodes = provider.getChildren({ nodeId: 'power' } as unknown as OperateNode) as OperateNode[];
    const simulation = nodes.find((node) => node.nodeId === 'simulation');

    expect((simulation?.iconPath as vscode.ThemeIcon).id)
      .toBe('circle-slash');
  });
});

describe('performance refresh edge cases', () => {
  it('tolerates getRunData resolving without a data payload', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    mockGetRunData.mockResolvedValue(undefined);

    await provider.refreshPerformanceReports();

    expect(harness.state.performance.reports)
      .toEqual([]);
  });

  it('focuses the newest of several new reports after a refresh', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;
    const base = record('base', 1000);

    mockGetRunData.mockResolvedValueOnce({ data: [base] });
    await provider.refreshPerformanceReports();

    mockGetRunData.mockResolvedValueOnce({
      data: [
        base,
        record('n1', 2000),
        record('n2', 3000),
        record('n3', 4000),
      ],
    });
    await provider.refreshPerformanceReports({ focusIfNew: true });

    expect(harness.state.performance.selectedReportKey)
      .toBe('n3');
  });

  it('reveals the cached node when the marked-only filter hides the report', async () => {
    const provider = createProvider();
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setPerformanceResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    mockGetRunData.mockResolvedValue({
      data: [
        record('r1', 100),
        {
          ...record('r2', 200),
          marked: true,
        },
      ],
    });
    await provider.refreshPerformanceReports();
    expect(provider.getPerformanceResultsPanelNodes())
      .toHaveLength(2);

    provider.setPerformanceMarkedOnly(true);

    await (provider as unknown as {
      revealPerformanceReport(reportKey: string, refreshRevision?: number): Promise<void>;
    }).revealPerformanceReport('r1', 1);

    expect(reveal)
      .toHaveBeenCalledTimes(1);
    expect((reveal as jest.Mock).mock.calls[0][0].id)
      .toBe('performance-report:r1');
  });

  it('swallows a rejected context sync via the catch fallback', async () => {
    const provider = createProvider();
    const sync = (provider as unknown as {
      syncPerformanceSelectionContext(): Promise<void>;
    }).syncPerformanceSelectionContext;

    (vscode.commands.executeCommand as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'));

    await expect(sync.call(provider))
      .rejects
      .toThrow('boom');
    await new Promise((resolve) => setImmediate(resolve));

    // A follow-up sync still chains on the swallowed promise.
    (vscode.commands.executeCommand as jest.Mock)
      .mockResolvedValueOnce(undefined);
    await expect(sync.call(provider))
      .resolves
      .toBeUndefined();
  });
});

describe('sort order and selection', () => {
  it('togglePerformanceSortOrder flips ascending to descending', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.performance.sortOrder = 'asc';

    provider.togglePerformanceSortOrder();

    expect(harness.state.performance.sortOrder)
      .toBe('desc');
  });

  it('selectAllOperators selects every non-experimental operator when one is selected', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.operators = [
      {
        id: 1,
        name: 'ex-op',
        hasEx: true,
        isCompiled: false,
      },
      {
        id: 2,
        name: 'non-ex-1',
        hasEx: false,
        isCompiled: true,
      },
      {
        id: 3,
        name: 'non-ex-2',
        hasEx: false,
        isCompiled: true,
      },
    ];
    harness.state.selectedOperatorIds = [2];

    await provider.selectAllOperators();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({
        operatorIds: [
          2,
          3,
        ],
      });
    expect(harness.state.selectedOperatorIds)
      .toEqual([
        2,
        3,
      ]);
  });
});

describe('createItem default collapsible state', () => {
  it('uses the None default when collapsibleState is omitted', () => {
    const provider = createProvider();
    const createItem = (provider as unknown as {
      createItem(
        nodeId: unknown,
        label: string,
        commandId?: string,
        collapsibleState?: number,
      ): OperateNode;
    }).createItem;

    const node = createItem.call(provider, 'flow.run', 'Run');

    expect(node.nodeId)
      .toBe('flow.run');
    expect(node.label)
      .toBe('Run');
    expect(node.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.None);
  });
});
