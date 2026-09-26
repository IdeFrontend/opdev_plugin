import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  CONTEXT_PREFIX,
  TREE_VIEW_SANITIZER_RESULTS,
} from '@shared/flavor';

const mockGetSanitizerRunData = jest.fn();
const mockToggleSanitizerMark = jest.fn();
const mockLoadSanitizerPanelData = jest.fn();
const mockJumpToFile = jest.fn();

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

  class MarkdownString {
    value: string;
    isTrusted = false;

    constructor(value: string) {
      this.value = value;
    }
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
    ViewColumn: { One: 1 },
    commands: {
      executeCommand: jest.fn()
        .mockResolvedValue(undefined),
      registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
    },
    env: {
      language: 'en',
      clipboard: {
        writeText: jest.fn()
          .mockResolvedValue(undefined),
      },
    },
    window: {
      activeColorTheme: { kind: 2 },
      onDidChangeActiveColorTheme: jest.fn(),
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showTextDocument: jest.fn()
        .mockResolvedValue(undefined),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
      openTextDocument: jest.fn()
        .mockResolvedValue({}),
    },
  };
});

jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: {} }));
jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: {} }));
jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: {} }));
jest.mock('@plugin/controller/performance-controller', () => ({ performanceDataMethods: { jumpToFile: (...args: unknown[]) => mockJumpToFile(...args) } }));
jest.mock('@plugin/controller/performance-data-controller', () => ({ performanceMethods: {} }));
jest.mock('@plugin/service/view-service', () => ({ viewService: {} }));
jest.mock('@plugin/helpers/environment-script-guard', () => ({ ensureEnvironmentScriptForOperateAction: jest.fn() }));
jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));
jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: { loadSanitizerPanelData: (...args: unknown[]) => mockLoadSanitizerPanelData(...args) } }));
jest.mock('@plugin/service/run-data-service', () => ({
  runDataService: {
    getSanitizerRunData: (...args: unknown[]) => mockGetSanitizerRunData(...args),
    toggleSanitizerMark: (...args: unknown[]) => mockToggleSanitizerMark(...args),
  },
}));
jest.mock('@plugin/helpers/st-test-action', () => ({
  getStTestSelectionState: jest.fn(() => 'none'),
  shouldShowStTestAction: jest.fn(() => false),
}));

import * as vscode from 'vscode';
import type { PerformanceExecutionRecord } from '@shared/api-types';
import {
  COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP,
  COMMAND_SIDEBAR_SANITIZER_STACK_JUMP,
} from '../../constants';
import { treeItemContextKey } from '@shared/flavor';
import { stableCommandId } from '@plugin/domain/utils/command-utils';
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
  title: string;
  type: 'error' | 'warning';
  questionType: string;
  question: string;
  msAgentIndex?: number;
  fileLink?: string;
  row?: number;
  col?: number;
  originData: string;
};

type StateHarness = {
  state: {
    hasDevtoolConfig: boolean;
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

const report = (name: string, timestamp: number, marked = false): SanitizerReportRecord => ({
  title: `${name}.log`,
  timestamp,
  id: `sanitizer_${name}`,
  path: `/reports/${name}.log`,
  marked,
});

const message = (overrides: Partial<SanitizerMessage> = {}): SanitizerMessage => ({
  title: 'illegal read of size 4',
  type: 'error',
  questionType: 'memory',
  question: 'illegal read of size',
  fileLink: '/ws/src/a.cpp',
  row: 10,
  col: 5,
  originData: [
    '==42== ERROR: illegal read of size 4',
    '#0 /ws/src/a.cpp:10:5',
    '   by 0xABC: main (/ws/main.cpp:1:1)',
  ].join('\n'),
  ...overrides,
});

const createState = (): StateHarness['state'] => ({
  hasDevtoolConfig: true,
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

const createProvider = (kind: 'flow' | 'operatorProjects' = 'flow'): OperateTreeProvider => {
  const provider = new OperateTreeProvider(vscode.Uri.file('/extension'), kind);

  (provider as unknown as StateHarness).state = createState();

  return provider;
};

const tempDirs: string[] = [];

const makeTempReportFile = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-sanitizer-'));
  const filePath = path.join(dir, 'detection.log');

  fs.writeFileSync(filePath, 'sample report\n');

  tempDirs.push(dir);

  return filePath;
};

describe('OperateTreeProvider sanitizer report list state', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
      });
    }
  });

  const fire = (): jest.SpyInstance => jest.spyOn(
    (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
    'fire',
  )
    .mockClear();

  it('toggles the sort order between desc and asc', () => {
    provider.toggleSanitizerSortOrder();
    expect(harness.state.sanitizer.sortOrder)
      .toBe('asc');

    provider.toggleSanitizerSortOrder();
    expect(harness.state.sanitizer.sortOrder)
      .toBe('desc');
  });

  it('toggles the marked-only filter and reports its state', () => {
    expect(provider.isSanitizerMarkedOnlyEnabled())
      .toBe(false);
    provider.toggleSanitizerMarkedFilter();
    expect(provider.isSanitizerMarkedOnlyEnabled())
      .toBe(true);
  });

  it('sets the marked-only filter without refiring when unchanged', () => {
    const emitter = fire();

    provider.setSanitizerMarkedOnly(false);
    expect(emitter)
      .not
      .toHaveBeenCalled();

    provider.setSanitizerMarkedOnly(true);
    expect(emitter)
      .toHaveBeenCalledTimes(1);
  });

  it('sets and reads the results group-by mode', () => {
    const emitter = fire();

    provider.setSanitizerResultsGroupBy('severity');
    expect(provider.getSanitizerResultsGroupBy())
      .toBe('severity');
    expect(emitter)
      .toHaveBeenCalledTimes(1);

    provider.setSanitizerResultsGroupBy('severity');
    expect(emitter)
      .toHaveBeenCalledTimes(1);
  });

  it('toggles and sets hide-duplicates with its getter', () => {
    expect(provider.isSanitizerHideDuplicatesEnabled())
      .toBe(false);
    provider.toggleSanitizerHideDuplicates();
    expect(provider.isSanitizerHideDuplicatesEnabled())
      .toBe(true);

    const emitter = fire();

    provider.setSanitizerHideDuplicates(true);
    expect(emitter)
      .not
      .toHaveBeenCalled();
    provider.setSanitizerHideDuplicates(false);
    expect(provider.isSanitizerHideDuplicatesEnabled())
      .toBe(false);
  });
});

describe('OperateTreeProvider sanitizer report nodes', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
  });

  it('shows the no-reports placeholder for an empty list', () => {
    const nodes = provider.getSanitizerReportsPanelNodes();

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].label)
      .toBe('web.sanitizerPanel.noReports');
    expect(nodes[0].collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.None);
    expect(provider.getSanitizerResultsPanelNodes())
      .toEqual(nodes);
  });

  it('sorts report rows by timestamp descending with marked details', () => {
    harness.state.sanitizer.reports = [
      report('old', 1),
      report('fresh', 3, true),
    ];

    const nodes = provider.getSanitizerReportsPanelNodes();

    expect(nodes.map((node) => node.label))
      .toEqual([
        'fresh.log',
        'old.log',
      ]);
    expect(nodes[0].id)
      .toBe(`sanitizer-report:${encodeURIComponent('/reports/fresh.log')}`);
    expect(nodes[0].contextValue)
      .toBe(treeItemContextKey('sanitizerReportItem.marked'));
    expect((nodes[0].iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-flag-filled');
    expect(nodes[0].tooltip)
      .toBe('/reports/fresh.log');
    expect(nodes[0].collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(nodes[1].contextValue)
      .toBe(treeItemContextKey('sanitizerReportItem.unmarked'));
  });

  it('caches the report root nodes between calls', () => {
    harness.state.sanitizer.reports = [report('a', 1)];

    expect(provider.getSanitizerReportsPanelNodes())
      .toBe(provider.getSanitizerReportsPanelNodes());
  });

  it('sorts ascending when the sort order flips', () => {
    harness.state.sanitizer.reports = [
      report('old', 1),
      report('fresh', 3),
    ];
    provider.toggleSanitizerSortOrder();

    expect(provider.getSanitizerReportsPanelNodes()
      .map((node) => node.label))
      .toEqual([
        'old.log',
        'fresh.log',
      ]);
  });

  it('breaks timestamp ties by title then path', () => {
    harness.state.sanitizer.reports = [
      {
        ...report('b', 1),
        path: '/reports/b.log',
      },
      {
        ...report('a', 1),
        path: '/reports/a.log',
      },
    ];

    expect(provider.getSanitizerReportsPanelNodes()
      .map((node) => node.label))
      .toEqual([
        'a.log',
        'b.log',
      ]);
  });

  it('breaks timestamp and title ties by path', () => {
    harness.state.sanitizer.reports = [
      {
        ...report('same', 1),
        path: '/reports/same.log',
      },
      {
        ...report('same', 1),
        path: '/other/same.log',
      },
    ];

    expect(provider.getSanitizerReportsPanelNodes()
      .map((node) => node.tooltip as string))
      .toEqual([
        '/other/same.log',
        '/reports/same.log',
      ]);
  });

  it('filters to marked rows only when the marked filter is on', () => {
    harness.state.sanitizer.reports = [
      report('unmarked', 2),
      report('marked', 1, true),
    ];
    provider.setSanitizerMarkedOnly(true);

    expect(provider.getSanitizerReportsPanelNodes()
      .map((node) => node.label))
      .toEqual(['marked.log']);
  });

  it('keeps the reported root when no reports are visible', () => {
    harness.state.sanitizer.reports = [report('a', 1)];
    provider.toggleSanitizerSortOrder();
    provider.toggleSanitizerMarkedFilter();
    provider.toggleSanitizerHideDuplicates();

    expect(provider.getSanitizerReportsPanelNodes()[0].label)
      .toBe('web.sanitizerPanel.noReports');
  });
});

describe('OperateTreeProvider.addSanitizerReportFromPath', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockLoadSanitizerPanelData.mockReset();
    mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects a path that does not exist', async () => {
    await expect(provider.addSanitizerReportFromPath('/no/such/report.log'))
      .rejects
      .toThrow('link.fileNotExist');
  });

  it('rejects a path that is not a file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-sanitizer-dir-'));

    tempDirs.push(dir);

    await expect(provider.addSanitizerReportFromPath(dir))
      .rejects
      .toThrow('msSanitizer.pathNotFileOrDir');
  });

  it('selects an already-registered report without duplicating it', async () => {
    const filePath = makeTempReportFile();

    harness.state.sanitizer.reports = [
      {
        title: 'detection.log',
        timestamp: 1,
        id: `sanitizer_${filePath}`,
        path: filePath,
        marked: false,
      },
    ];
    harness.state.sanitizer.manualReports = [
      {
        title: 'detection.log',
        timestamp: 1,
        id: `sanitizer_${filePath}`,
        path: filePath,
        marked: false,
      },
    ];

    await provider.addSanitizerReportFromPath(filePath);

    expect(harness.state.sanitizer.reports)
      .toHaveLength(1);
    expect(harness.state.sanitizer.manualReports)
      .toHaveLength(1);
    expect(harness.state.sanitizer.selectedReportPath)
      .toBe(filePath);
  });

  it('registers a new manual report and selects it', async () => {
    const filePath = makeTempReportFile();

    await provider.addSanitizerReportFromPath(filePath);

    expect(harness.state.sanitizer.reports)
      .toHaveLength(1);
    expect(harness.state.sanitizer.manualReports)
      .toHaveLength(1);

    const added = harness.state.sanitizer.reports[0];

    expect(added.path)
      .toBe(filePath);
    expect(added.title)
      .toBe('detection.log');
    expect(added.marked)
      .toBe(false);
    expect(harness.state.sanitizer.selectedReportPath)
      .toBe(filePath);
  });

  it('preserves cached report rows and appends the new one', async () => {
    harness.state.sanitizer.reports = [report('existing', 1)];
    const existingNode = provider.getSanitizerReportsPanelNodes()[0];
    const filePath = makeTempReportFile();

    await provider.addSanitizerReportFromPath(filePath);

    const nodes = provider.getSanitizerReportsPanelNodes();

    expect(nodes)
      .toHaveLength(2);
    expect(nodes.find((node) => node.tooltip === '/reports/existing.log'))
      .toBe(existingNode);
    expect(nodes.map((node) => node.label))
      .toContain(path.basename(filePath));
  });

  it('drops foreign rows cached under the sanitizer root on refresh', async () => {
    harness.state.sanitizer.reports = [report('existing', 1)];
    const foreign = new vscode.TreeItem('foreign');

    foreign.id = 'sanitizerGroupItem:0';
    provider.getSanitizerReportsPanelNodes()
      .push(foreign as never);
    const filePath = makeTempReportFile();

    await provider.addSanitizerReportFromPath(filePath);

    const nodes = provider.getSanitizerReportsPanelNodes();

    expect(nodes.find((node) => node.id === 'sanitizerGroupItem:0'))
      .toBeUndefined();
  });

  it('rebuilds the cached root to the placeholder when reports disappear', () => {
    harness.state.sanitizer.reports = [report('a', 1)];
    provider.getSanitizerReportsPanelNodes();

    harness.state.sanitizer.reports = [];
    const update = (provider as unknown as {
      updateSanitizerReportRootCache(): void;
    }).updateSanitizerReportRootCache;

    update.call(provider);

    expect(provider.getSanitizerReportsPanelNodes()[0].label)
      .toBe('web.sanitizerPanel.noReports');
  });
});

describe('OperateTreeProvider sanitizer report actions', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockToggleSanitizerMark.mockReset();
    mockToggleSanitizerMark.mockResolvedValue(undefined);
    mockLoadSanitizerPanelData.mockReset();
    mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
    (vscode.env.clipboard.writeText as jest.Mock)
      .mockReset();
    (vscode.env.clipboard.writeText as jest.Mock)
      .mockResolvedValue(undefined);
    (vscode.workspace.openTextDocument as jest.Mock)
      .mockReset();
    (vscode.workspace.openTextDocument as jest.Mock)
      .mockResolvedValue({});
    (vscode.window.showTextDocument as jest.Mock)
      .mockReset();
  });

  it('toggles the mark of a report in both lists', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    harness.state.sanitizer.manualReports = [report('r', 1)];
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    await provider.toggleSanitizerReportMark('sanitizer_r');

    expect(mockToggleSanitizerMark)
      .toHaveBeenCalledWith({ id: 'sanitizer_r' });
    expect(harness.state.sanitizer.reports[0].marked)
      .toBe(true);
    expect(harness.state.sanitizer.manualReports[0].marked)
      .toBe(true);
    expect(fire)
      .toHaveBeenCalled();
  });

  it('drops the marked filter when it would hide every row', async () => {
    harness.state.sanitizer.reports = [report('r', 1, true)];
    harness.state.sanitizer.markedOnly = true;

    await provider.toggleSanitizerReportMark('sanitizer_r');

    expect(provider.isSanitizerMarkedOnlyEnabled())
      .toBe(false);
  });

  it('does not refire for an unknown report id', async () => {
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    await provider.toggleSanitizerReportMark('unknown');

    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('marks a report that lives only in the run-data list', async () => {
    harness.state.sanitizer.reports = [
      report('r', 1),
      report('other', 2),
    ];
    harness.state.sanitizer.manualReports = [report('other', 2)];

    await provider.toggleSanitizerReportMark('sanitizer_r');

    expect(harness.state.sanitizer.reports
      .find((item) => item.id === 'sanitizer_r')!.marked)
      .toBe(true);
    expect(harness.state.sanitizer.manualReports
      .find((item) => item.id === 'sanitizer_other')!.marked)
      .toBe(false);
  });

  it('toggles only the manual list when the run-data list lacks the report', async () => {
    harness.state.sanitizer.reports = [report('other', 2)];
    harness.state.sanitizer.manualReports = [
      report('r', 1),
      report('other', 2),
    ];
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    );

    await provider.toggleSanitizerReportMark('sanitizer_r');

    expect(harness.state.sanitizer.manualReports
      .find((item) => item.id === 'sanitizer_r')!.marked)
      .toBe(true);
    expect(fire)
      .not
      .toHaveBeenCalled();
  });

  it('looks a report up by path', () => {
    harness.state.sanitizer.reports = [report('r', 1)];

    expect(provider.getSanitizerReportByPath('/reports/r.log')?.title)
      .toBe('r.log');
    expect(provider.getSanitizerReportByPath('/reports/ghost.log'))
      .toBeUndefined();
  });

  it('copies the report path to the clipboard', async () => {
    const showInfo = vscode.window.showInformationMessage as jest.Mock;

    await provider.copySanitizerReportPath('/reports/r.log');

    expect(vscode.env.clipboard.writeText)
      .toHaveBeenCalledWith('/reports/r.log');
    expect(showInfo)
      .toHaveBeenCalledWith('web.perf.pathCopied');
  });

  it('ignores selecting a report on the operator-projects tree', async () => {
    const operatorProvider = createProvider('operatorProjects');

    await operatorProvider.selectSanitizerReport('/reports/r.log');

    expect(mockLoadSanitizerPanelData)
      .not
      .toHaveBeenCalled();
  });

  it('ignores selecting a report that is not registered', async () => {
    await provider.selectSanitizerReport('/reports/ghost.log');

    expect(mockLoadSanitizerPanelData)
      .not
      .toHaveBeenCalled();
  });

  it('selects a report and loads its panel data', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    mockLoadSanitizerPanelData.mockReturnValue({ data: [message()] });

    await provider.selectSanitizerReport('/reports/r.log');

    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/r.log');
    expect(harness.state.sanitizer.selectedReportTitle)
      .toBe('r.log');
    expect(harness.state.sanitizer.reportRevision)
      .toBe(1);
    expect(harness.state.sanitizer.selectedMessages)
      .toHaveLength(1);
    expect(mockLoadSanitizerPanelData)
      .toHaveBeenCalledWith({
        path: '/reports/r.log',
        title: 'r.log',
        timestamp: 1,
      });
  });

  it('opens a grouped result file with a preview', async () => {
    await provider.openSanitizerResultGroupFile('/ws/src/a.cpp');

    expect(vscode.workspace.openTextDocument)
      .toHaveBeenCalledWith({ fsPath: '/ws/src/a.cpp' });
    expect(vscode.window.showTextDocument)
      .toHaveBeenCalledWith({}, {
        viewColumn: 1,
        preview: true,
      });
  });

  it('skips opening for empty or placeholder group files', async () => {
    await provider.openSanitizerResultGroupFile('');
    await provider.openSanitizerResultGroupFile('web.sanitizerTree.group.noFile');

    expect(vscode.workspace.openTextDocument)
      .not
      .toHaveBeenCalled();
  });
});

describe('OperateTreeProvider sanitizer message jumps and ai-fix index', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockJumpToFile.mockReset();
    mockJumpToFile.mockResolvedValue(undefined);
  });

  it('skips jumping when no message sits at the index', async () => {
    await provider.jumpToSanitizerMessage('0');
    expect(mockJumpToFile)
      .not
      .toHaveBeenCalled();
  });

  it('skips jumping when the message has no file location', async () => {
    harness.state.sanitizer.selectedMessages = [message({ fileLink: undefined })];

    await provider.jumpToSanitizerMessage('0');
    expect(mockJumpToFile)
      .not
      .toHaveBeenCalled();
  });

  it('skips jumping when the row or column is missing', async () => {
    harness.state.sanitizer.selectedMessages = [message({ row: undefined })];

    await provider.jumpToSanitizerMessage('0');
    expect(mockJumpToFile)
      .not
      .toHaveBeenCalled();
  });

  it('jumps to the message file with the parsed problem type and handling', async () => {
    harness.state.sanitizer.selectedMessages = [message()];

    await provider.jumpToSanitizerMessage('0');

    expect(mockJumpToFile)
      .toHaveBeenCalledWith({
        fileLink: '/ws/src/a.cpp',
        row: 10,
        col: 5,
        errorTitle: 'illegal read of size 4',
        errorMessage: expect.stringContaining('exceptionParser.illegalRead'),
      });
  });

  it('falls back to the raw question text for unknown sanitizer questions', async () => {
    harness.state.sanitizer.selectedMessages = [
      message({
        question: 'unknown question',
        fileLink: '/ws/b.cpp',
        row: 1,
        col: 1,
      }),
    ];

    await provider.jumpToSanitizerMessage('0');

    expect(mockJumpToFile)
      .toHaveBeenCalledWith(expect.objectContaining({ errorMessage: expect.stringContaining('unknown question') }));
  });

  it('resolves the ai-fix index from an object reference', () => {
    expect(provider.getSanitizerMessageAiFixIndex({ msAgentIndex: 3 }))
      .toBe(3);
  });

  it('ignores a non-integer msAgentIndex on an object reference', () => {
    harness.state.sanitizer.selectedMessages = [message({ msAgentIndex: 2 })];

    expect(provider.getSanitizerMessageAiFixIndex({ msAgentIndex: -1 }))
      .toBeUndefined();
    expect(provider.getSanitizerMessageAiFixIndex({
      id: '0',
      msAgentIndex: 1.5,
    }))
      .toBe(2);
  });

  it('resolves the ai-fix index from a numeric string message id', () => {
    harness.state.sanitizer.selectedMessages = [
      message({ msAgentIndex: 7 }),
      message(),
    ];

    expect(provider.getSanitizerMessageAiFixIndex('1'))
      .toBeUndefined();
    expect(provider.getSanitizerMessageAiFixIndex('0'))
      .toBe(7);
  });

  it('parses the global index out of a sanitizer message id', () => {
    harness.state.sanitizer.selectedMessages = [
      message(),
      message(),
      message(),
      message(),
      message(),
      message({ msAgentIndex: 4 }),
    ];

    expect(provider.getSanitizerMessageAiFixIndex('sanitizer-msg:/reports/r.log:class:memory:5:1'))
      .toBe(4);
  });

  it('returns undefined for unparseable message ids', () => {
    harness.state.sanitizer.selectedMessages = [message({ msAgentIndex: 1 })];

    expect(provider.getSanitizerMessageAiFixIndex('sanitizer-msg:not-a-number'))
      .toBeUndefined();
    expect(provider.getSanitizerMessageAiFixIndex('abc'))
      .toBeUndefined();
    expect(provider.getSanitizerMessageAiFixIndex('5'))
      .toBeUndefined();
  });

  it('resolves the ai-fix index from command arguments', () => {
    harness.state.sanitizer.selectedMessages = [message({ msAgentIndex: 9 })];

    expect(provider.getSanitizerMessageAiFixIndex({ command: { arguments: ['0'] } }))
      .toBe(9);
  });
});

describe('OperateTreeProvider sanitizer message grouping', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockLoadSanitizerPanelData.mockReset();
    mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
  });

  const setupReportWithMessages = (messages: SanitizerMessage[]): OperateNode => {
    harness.state.sanitizer.reports = [report('r', 1)];
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    mockLoadSanitizerPanelData.mockReturnValue({ data: messages });

    return provider.getSanitizerReportsPanelNodes()[0];
  };

  it('groups messages into class buckets under a report', async () => {
    const reportNode = setupReportWithMessages([
      message(),
      message({
        type: 'warning',
        title: 'race warning',
      }),
      message({
        type: 'warning',
        questionType: 'memoryContention',
        title: 'contention warning',
      }),
      message({
        questionType: 'foo',
        title: 'unknown class message',
      }),
    ]);

    const groups = await provider.getChildren(reportNode) as OperateNode[];

    expect(groups.map((node) => node.label))
      .toEqual([
        'web.sanitizerPanel.memory',
        'web.sanitizerPanel.memoryRace',
        'web.sanitizerPanel.other',
      ]);
    expect(groups[0].id)
      .toBe(`sanitizer-report-group:${encodeURIComponent('/reports/r.log')}:class:${encodeURIComponent('memory')}`);
    expect(groups[0].description)
      .toBe('1 🔴, 1 🟡');
    expect(groups[1].description)
      .toBe('1 🟡');
    expect(groups[2].description)
      .toBe('1 🔴');
  });

  it('groups by severity with dedicated icons and counts', async () => {
    const reportNode = setupReportWithMessages([
      message(),
      message({
        type: 'warning',
        title: 'warning message',
      }),
    ]);

    harness.state.sanitizer.resultsGroupBy = 'severity';

    const groups = await provider.getChildren(reportNode) as OperateNode[];

    expect(groups.map((node) => node.label))
      .toEqual([
        'web.sanitizerTree.group.error',
        'web.sanitizerTree.group.warning',
      ]);
    expect((groups[0].iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-group-severity-error');
    expect((groups[1].iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-group-severity-warning');
    expect(groups[0].description)
      .toBe('1');
  });

  it('groups by type using the label map', async () => {
    const reportNode = setupReportWithMessages([
      message(),
      message({
        question: 'unknown question',
        title: 'custom',
      }),
    ]);

    harness.state.sanitizer.resultsGroupBy = 'type';

    const groups = await provider.getChildren(reportNode) as OperateNode[];

    expect(groups.map((node) => node.label))
      .toEqual([
        'exceptionParser.illegalRead',
        'unknown question',
      ]);
  });

  it('groups by file with workspace-relative labels', async () => {
    (vscode.workspace as unknown as { workspaceFolders?: Array<{ uri: { fsPath: string } }> }).workspaceFolders = [{ uri: { fsPath: '/ws' } }];
    const reportNode = setupReportWithMessages([
      message(),
      message({
        fileLink: undefined,
        title: 'no file message',
      }),
    ]);

    harness.state.sanitizer.resultsGroupBy = 'file';

    const groups = await provider.getChildren(reportNode) as OperateNode[];

    expect(groups.map((node) => node.label))
      .toEqual([
        'src/a.cpp',
        'web.sanitizerTree.group.noFile',
      ]);
    expect(groups[0].contextValue)
      .toBe(treeItemContextKey('sanitizerPathGroupItem'));
    expect(groups[1].contextValue)
      .toBeUndefined();
  });

  it('renders message rows with command, icon and tooltip metadata', async () => {
    const reportNode = setupReportWithMessages([
      message(),
      message({
        type: 'warning',
        msAgentIndex: 2,
      }),
      message({
        fileLink: undefined,
        title: 'no location',
      }),
    ]);

    const groups = await provider.getChildren(reportNode) as OperateNode[];
    const messages = await provider.getChildren(groups[0]) as OperateNode[];

    expect(messages)
      .toHaveLength(3);
    expect(messages[0].nodeId)
      .toBe('sanitizerMessage');
    // Message identity lives in the command id, not in `command.arguments`.
    expect(messages[0].command)
      .toEqual({
        command: stableCommandId(COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP, '0'),
        title: 'illegal read of size 4',
      });
    expect(messages[0].command?.arguments)
      .toBeUndefined();
    expect((messages[0].iconPath as vscode.ThemeIcon).id)
      .toBe('error');
    expect(messages[0].description)
      .toBe('a.cpp 10:5');
    expect(messages[0].id)
      .toBe(`sanitizer-msg:${encodeURIComponent('/reports/r.log')}:class:${encodeURIComponent('memory')}:0:0`);
    expect(messages[2].contextValue)
      .toBe(treeItemContextKey('sanitizerMessage.aiFix'));
    expect((messages[2].iconPath as vscode.ThemeIcon).id)
      .toBe('warning');
    expect(messages[1].command)
      .toBeUndefined();
    expect(messages[1].description)
      .toBeUndefined();
    expect((messages[0] as { sanitizerTooltipMeta?: { reportPath: string;
      globalIndex: number } }).sanitizerTooltipMeta)
      .toEqual({
        reportPath: '/reports/r.log',
        globalIndex: 0,
      });
  });

  it('returns an empty list for an unknown group key', async () => {
    const reportNode = setupReportWithMessages([message()]);
    const groups = await provider.getChildren(reportNode) as OperateNode[];

    const unknownGroup = {
      nodeId: 'sanitizerClass',
      id: `sanitizer-report-group:${encodeURIComponent('/reports/r.log')}:class:${encodeURIComponent('ghost')}`,
    } as OperateNode;

    expect(await provider.getChildren(unknownGroup))
      .toEqual([]);
    expect(groups[0])
      .toBeDefined();
  });

  it('caches severity group nodes between calls', async () => {
    const reportNode = setupReportWithMessages([message()]);

    const first = await provider.getChildren(reportNode);
    const second = await provider.getChildren(reportNode);

    expect(first)
      .toBe(second);
  });

  it('renders legacy group ids through the message-node path', async () => {
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    harness.state.sanitizer.selectedMessages = [
      message(),
      message({
        questionType: 'memory',
        type: 'warning',
        title: 'warn',
      }),
    ];

    const legacyGroup = {
      nodeId: 'sanitizerClass',
      id: 'sanitizer-group:class:memory',
    } as OperateNode;
    const nodes = provider.getChildren(legacyGroup) as OperateNode[];

    expect(nodes)
      .toHaveLength(2);
    expect(nodes[0].id)
      .toBe('sanitizer-msg:legacy:class:memory:0:0');
    expect((nodes[0] as { sanitizerTooltipMeta?: unknown }).sanitizerTooltipMeta)
      .toBeDefined();
  });

  it('groups legacy type ids with duplicate questions pushed together', () => {
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    harness.state.sanitizer.selectedMessages = [
      message(),
      message({
        question: 'illegal read of size',
        title: 'second read',
      }),
      message({
        question: 'new-delete-type-mismatch',
        title: 'custom',
      }),
    ];

    const legacyGroup = {
      nodeId: 'sanitizerClass',
      id: 'sanitizer-group:type:illegal read of size',
    } as OperateNode;
    const nodes = provider.getChildren(legacyGroup) as OperateNode[];

    expect(nodes)
      .toHaveLength(2);
    expect(nodes.map((node) => node.label))
      .toEqual([
        'illegal read of size 4',
        'second read',
      ]);
  });

  it('pushes same-file messages into one legacy file group', () => {
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    harness.state.sanitizer.selectedMessages = [
      message(),
      message({ title: 'second in same file' }),
    ];

    const legacyGroup = {
      nodeId: 'sanitizerClass',
      id: 'sanitizer-group:file:/ws/src/a.cpp',
    } as OperateNode;
    const nodes = provider.getChildren(legacyGroup) as OperateNode[];

    expect(nodes)
      .toHaveLength(2);
  });

  it('caches message rows per report group between calls', async () => {
    const reportNode = setupReportWithMessages([
      message(),
      message({
        type: 'warning',
        title: 'warn',
      }),
    ]);

    const groups = await provider.getChildren(reportNode) as OperateNode[];
    const first = await provider.getChildren(groups[0]);
    const second = await provider.getChildren(groups[0]);

    expect(first)
      .toBe(second);
  });

  it('shows the file name as description when the row is unknown', async () => {
    const reportNode = setupReportWithMessages([
      message({
        row: undefined,
        col: undefined,
      }),
    ]);

    const groups = await provider.getChildren(reportNode) as OperateNode[];
    const messages = await provider.getChildren(groups[0]) as OperateNode[];

    expect(messages[0].description)
      .toBe('a.cpp');
  });

  it('uses the current group-by mode when the legacy id has none', () => {
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    harness.state.sanitizer.resultsGroupBy = 'severity';
    harness.state.sanitizer.selectedMessages = [
      message(),
      message({
        type: 'warning',
        title: 'warn',
      }),
    ];

    const legacyGroup = {
      nodeId: 'sanitizerClass',
      id: 'sanitizer-group::error',
    } as OperateNode;
    const nodes = provider.getChildren(legacyGroup) as OperateNode[];

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].label)
      .toBe('illegal read of size 4');
    expect((nodes[0].iconPath as vscode.ThemeIcon).id)
      .toBe('error');
  });

  it('returns the select-report hint before any report is chosen', async () => {
    const reportNode = setupReportWithMessages([message()]);
    const groups = await provider.getChildren(reportNode) as OperateNode[];

    expect(groups[0].label)
      .toBe('web.sanitizerPanel.memory');
  });
});

describe('OperateTreeProvider sanitizer deduplication', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockLoadSanitizerPanelData.mockReset();
    mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
  });

  const setupReportWithMessages = (messages: SanitizerMessage[]): OperateNode => {
    harness.state.sanitizer.reports = [report('r', 1)];
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    mockLoadSanitizerPanelData.mockReturnValue({ data: messages });

    return provider.getSanitizerReportsPanelNodes()[0];
  };

  it('keeps every message when duplicates are not hidden', async () => {
    const reportNode = setupReportWithMessages([
      message(),
      message(),
      message(),
    ]);

    const groups = await provider.getChildren(reportNode) as OperateNode[];
    const messages = await provider.getChildren(groups[0]) as OperateNode[];

    expect(messages)
      .toHaveLength(3);
  });

  it('drops exact duplicates when hide-duplicates is on', async () => {
    const reportNode = setupReportWithMessages([
      message(),
      message(),
      message({ title: 'different title' }),
    ]);

    provider.setSanitizerHideDuplicates(true);

    const groups = await provider.getChildren(reportNode) as OperateNode[];
    const messages = await provider.getChildren(groups[0]) as OperateNode[];

    expect(messages)
      .toHaveLength(2);
  });

  it('keeps messages with equal fast keys but different stack details', async () => {
    const reportNode = setupReportWithMessages([
      message(),
      message({
        originData: [
          '==42== ERROR: illegal read of size 4',
          '#0 /ws/src/b.cpp:1:1',
          '   by 0xABC: main (/ws/main.cpp:1:1)',
        ].join('\n'),
      }),
    ]);

    provider.setSanitizerHideDuplicates(true);

    const groups = await provider.getChildren(reportNode) as OperateNode[];
    const messages = await provider.getChildren(groups[0]) as OperateNode[];

    expect(messages)
      .toHaveLength(2);
  });

  it('deduplicates the selected messages view with a cached result', async () => {
    harness.state.sanitizer.selectedMessages = [
      message(),
      message(),
    ];
    harness.state.sanitizer.hideDuplicates = true;

    const getVisible = (provider as unknown as {
      getVisibleSanitizerSelectedMessages(): SanitizerMessage[];
    }).getVisibleSanitizerSelectedMessages;

    const first = getVisible.call(provider);

    expect(first)
      .toHaveLength(1);
    expect(getVisible.call(provider))
      .toBe(first);
  });

  it('deduplicates without a report path via the local cache', async () => {
    harness.state.sanitizer.selectedMessages = [
      message(),
      message(),
    ];
    harness.state.sanitizer.hideDuplicates = true;

    const dedupe = (provider as unknown as {
      dedupeSanitizerMessages(
        messages: SanitizerMessage[],
        reportPath?: string,
      ): SanitizerMessage[];
    }).dedupeSanitizerMessages;

    const result = dedupe.call(provider, harness.state.sanitizer.selectedMessages);

    expect(result)
      .toHaveLength(1);
    expect(dedupe.call(provider, harness.state.sanitizer.selectedMessages))
      .toBe(result);
  });
});

describe('OperateTreeProvider.resolveTreeItem', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockLoadSanitizerPanelData.mockReset();
    mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
  });

  it('passes through non-message nodes', async () => {
    const item = { nodeId: 'run' } as OperateNode;

    await expect(provider.resolveTreeItem(item, item, {} as vscode.CancellationToken))
      .resolves
      .toBe(item);
  });

  it('passes through nodes that already carry a tooltip', async () => {
    const item = {
      nodeId: 'sanitizerMessage',
      tooltip: 'ready',
      sanitizerTooltipMeta: {
        reportPath: '/reports/r.log',
        globalIndex: 0,
      },
    } as unknown as OperateNode;

    await expect(provider.resolveTreeItem(item, item, {} as vscode.CancellationToken))
      .resolves
      .toBe(item);
  });

  it('passes through nodes without tooltip metadata', async () => {
    const item = { nodeId: 'sanitizerMessage' } as OperateNode;

    await expect(provider.resolveTreeItem(item, item, {} as vscode.CancellationToken))
      .resolves
      .toBe(item);
  });

  it('passes through when the message index is out of range', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    mockLoadSanitizerPanelData.mockReturnValue({ data: [message()] });

    const item = {
      nodeId: 'sanitizerMessage',
      sanitizerTooltipMeta: {
        reportPath: '/reports/r.log',
        globalIndex: 9,
      },
    } as unknown as OperateNode;

    await expect(provider.resolveTreeItem(item, item, {} as vscode.CancellationToken))
      .resolves
      .toBe(item);
  });

  it('builds and caches a tooltip with problem type, handling and stack link', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    mockLoadSanitizerPanelData.mockReturnValue({ data: [message()] });

    const meta = {
      reportPath: '/reports/r.log',
      globalIndex: 0,
    };
    const first = {
      nodeId: 'sanitizerMessage',
      sanitizerTooltipMeta: meta,
    } as unknown as OperateNode;
    const second = {
      nodeId: 'sanitizerMessage',
      sanitizerTooltipMeta: meta,
    } as unknown as OperateNode;

    const resolved = await provider.resolveTreeItem(first, first, {} as vscode.CancellationToken);
    const tooltip = resolved.tooltip as { value: string;
      isTrusted: boolean };

    expect(tooltip.value)
      .toContain('exceptionParser.illegalRead');
    expect(tooltip.value)
      .toContain('web.sanitizerPanel.handler.illegalRead');
    expect(tooltip.value)
      .toContain(COMMAND_SIDEBAR_SANITIZER_STACK_JUMP);
    expect(tooltip.isTrusted)
      .toBe(true);

    // The second node reuses the cached derived tooltip.
    await provider.resolveTreeItem(second, second, {} as vscode.CancellationToken);
    expect(second.tooltip)
      .toEqual(tooltip);
  });

  it('falls back to the raw question as problem type', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    mockLoadSanitizerPanelData.mockReturnValue({ data: [message({ question: 'unknown question' })] });

    const item = {
      nodeId: 'sanitizerMessage',
      sanitizerTooltipMeta: {
        reportPath: '/reports/r.log',
        globalIndex: 0,
      },
    } as unknown as OperateNode;

    await provider.resolveTreeItem(item, item, {} as vscode.CancellationToken);

    expect((item.tooltip as { value: string }).value)
      .toContain('unknown question');
  });

  it('skips plain error header lines in the tooltip details', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    mockLoadSanitizerPanelData.mockReturnValue({
      data: [
        message({
          originData: [
            'ERROR: plain error line',
            '==42== WARNING: header',
            '#0 /ws/src/a.cpp:10:5',
          ].join('\n'),
        }),
      ],
    });

    const item = {
      nodeId: 'sanitizerMessage',
      sanitizerTooltipMeta: {
        reportPath: '/reports/r.log',
        globalIndex: 0,
      },
    } as unknown as OperateNode;

    await provider.resolveTreeItem(item, item, {} as vscode.CancellationToken);

    const value = (item.tooltip as { value: string }).value;

    expect(value)
      .not
      .toContain('plain error line');
    expect(value)
      .toContain('- [src/a.cpp:10:5]');
  });

  it('renders raw stack frames that lack file positions', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    mockLoadSanitizerPanelData.mockReturnValue({
      data: [
        message({
          originData: [
            '==42== ERROR: illegal read of size 4',
            '#0 0x00ff00 in main',
            '#1 /ws/src/a.cpp:10:5',
          ].join('\n'),
        }),
      ],
    });

    const item = {
      nodeId: 'sanitizerMessage',
      sanitizerTooltipMeta: {
        reportPath: '/reports/r.log',
        globalIndex: 0,
      },
    } as unknown as OperateNode;

    await provider.resolveTreeItem(item, item, {} as vscode.CancellationToken);

    expect((item.tooltip as { value: string }).value)
      .toContain('- 0x00ff00 in main');
  });
});

describe('OperateTreeProvider sanitizer path normalization and keys', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;
  let normalize: (raw: string, workspacePath: string)=> string;
  let strip: (filePath: string, workspacePath: string)=> string | undefined;
  let fastKey: (msg: SanitizerMessage, workspacePath: string)=> string;
  let fullKey: (msg: SanitizerMessage, workspacePath: string)=> string;
  let detailsText: (msg: SanitizerMessage)=> string;
  let fullDuplicateKey: (
    reportPath: string | undefined,
    messages: SanitizerMessage[],
    index: number,
    workspacePath: string,
    localCache?: Map<number, string>,
  )=> string;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    normalize = (provider as unknown as {
      normalizeSanitizerPath(raw: string, workspacePath: string): string;
    }).normalizeSanitizerPath;
    strip = (provider as unknown as {
      stripWorkspacePrefix(filePath: string, workspacePath: string): string | undefined;
    }).stripWorkspacePrefix;
    fastKey = (provider as unknown as {
      buildSanitizerFastDuplicateMessageKey(msg: SanitizerMessage, workspacePath: string): string;
    }).buildSanitizerFastDuplicateMessageKey;
    fullKey = (provider as unknown as {
      buildSanitizerFullDuplicateMessageKey(msg: SanitizerMessage, workspacePath: string): string;
    }).buildSanitizerFullDuplicateMessageKey;
    detailsText = (provider as unknown as {
      getSanitizerMessageDetailsText(msg: SanitizerMessage): string;
    }).getSanitizerMessageDetailsText;
    fullDuplicateKey = (provider as unknown as {
      getSanitizerFullDuplicateKey(
        reportPath: string | undefined,
        messages: SanitizerMessage[],
        index: number,
        workspacePath: string,
        localCache?: Map<number, string>,
      ): string;
    }).getSanitizerFullDuplicateKey;
  });

  it('normalizes windows paths case-insensitively', () => {
    expect(normalize.call(provider, 'C:\\WS\\SRC\\A.CPP', 'C:\\ws'))
      .toBe('src/a.cpp');
  });

  it('returns the empty string for the workspace root itself', () => {
    expect(normalize.call(provider, '/ws', '/ws'))
      .toBe('');
  });

  it('returns the raw path when it is outside the workspace', () => {
    expect(normalize.call(provider, '/outside/a.cpp', '/ws'))
      .toBe('/outside/a.cpp');
  });

  it('returns an empty string for an empty path', () => {
    expect(normalize.call(provider, '   ', '/ws'))
      .toBe('');
  });

  it('strips the workspace prefix with windows-aware comparison', () => {
    expect(strip.call(provider, 'C:/WS/src/a.cpp', 'c:\\ws'))
      .toBe('src/a.cpp');
    expect(strip.call(provider, '/ws', '/ws'))
      .toBe('');
    expect(strip.call(provider, '/ws/a.cpp', '/ws'))
      .toBe('a.cpp');
    expect(strip.call(provider, '/other/a.cpp', '/ws'))
      .toBeUndefined();
    expect(strip.call(provider, '/a.cpp', ''))
      .toBeUndefined();
  });

  it('builds a fast duplicate key from type, title, file and position', () => {
    const msg = message();

    expect(fastKey.call(provider, msg, '/ws'))
      .toBe('error\nillegal read of size 4\nsrc/a.cpp:10:5');
  });

  it('collapses whitespace in the title for the fast key', () => {
    const msg = message({ title: 'illegal   read   of  size 4' });

    expect(fastKey.call(provider, msg, '/ws'))
      .toBe('error\nillegal read of size 4\nsrc/a.cpp:10:5');
  });

  it('builds a full duplicate key from details when the file is unknown', () => {
    const msg = message({
      fileLink: undefined,
      originData: '==42== ERROR: illegal read\nsome detail line',
    });

    expect(fullKey.call(provider, msg, '/ws'))
      .toBe('illegal read of size 4\n42== ERROR: illegal read\nsome detail line');
  });

  it('builds a full duplicate key with normalized stack frames', () => {
    const msg = message({
      originData: [
        '==42== ERROR: illegal read of size 4',
        '#0 /ws/src/a.cpp:10:5',
        '#1 /ws/lib/b.cpp:2:1 (inline)',
        'extra details here',
      ].join('\n'),
    });

    expect(fullKey.call(provider, msg, '/ws'))
      .toBe('error\nillegal read of size 4\nsrc/a.cpp:10:5\nlib/b.cpp:2:1');
  });

  it('keeps raw stack lines that do not match the frame pattern', () => {
    const msg = message({
      originData: [
        '==42== ERROR: illegal read of size 4',
        '#0 0x00ff in main',
        '#1 /ws/lib/b.cpp:2:1',
      ].join('\n'),
    });

    expect(fullKey.call(provider, msg, '/ws'))
      .toBe('error\nillegal read of size 4\n#0 0x00ff in main\nlib/b.cpp:2:1');
  });

  it('extracts details text and skips error headers and stack frames', () => {
    const msg = message({
      originData: [
        '==42== ERROR: illegal read of size 4',
        'first detail line',
        'WARNING: noisy header',
        '#0 /ws/src/a.cpp:10:5',
        '#1 /ws/lib/b.cpp:2:1',
        'ignored after stack',
      ].join('\n'),
    });

    expect(detailsText.call(provider, msg))
      .toBe('42== ERROR: illegal read of size 4\nfirst detail line');
  });

  it('reads the full duplicate key through per-index caches', () => {
    const messages = [
      message(),
      message(),
    ];
    const localCache = new Map<number, string>();
    const first = fullDuplicateKey.call(provider, undefined, messages, 0, '/ws', localCache);
    const second = fullDuplicateKey.call(provider, undefined, messages, 0, '/ws', localCache);

    expect(second)
      .toBe(first);

    const withReport = fullDuplicateKey.call(provider, '/reports/r.log', messages, 1, '/ws');
    const withReportCached = fullDuplicateKey.call(provider, '/reports/r.log', messages, 1, '/ws');

    expect(withReportCached)
      .toBe(withReport);
  });

  it('builds the full duplicate key without any cache', () => {
    const key = fullDuplicateKey.call(provider, undefined, [message()], 0, '/ws');

    expect(key)
      .toContain('src/a.cpp:10:5');
  });

  it('derives message metadata for class, type and file labels', () => {
    const derive = (provider as unknown as {
      buildSanitizerMessageDerived(msg: SanitizerMessage): unknown;
    }).buildSanitizerMessageDerived;

    const derived = derive.call(provider, message()) as {
      classKey: string;
      classLabel: string;
      typeKey: string;
      typeLabel: string;
      fileKey: string;
      fileLabel: string;
      severityRank: number;
    };

    expect(derived.classKey)
      .toBe('memory');
    expect(derived.classLabel)
      .toBe('web.sanitizerPanel.memory');
    expect(derived.typeKey)
      .toBe('illegal read of size');
    expect(derived.typeLabel)
      .toBe('exceptionParser.illegalRead');
    expect(derived.fileKey)
      .toBe('/ws/src/a.cpp');
    expect(derived.severityRank)
      .toBe(0);

    const warning = derive.call(provider, message({
      type: 'warning',
      questionType: 'unknown',
    })) as {
      classKey: string;
      severityRank: number;
      fileLabel: string;
    };

    expect(warning.classKey)
      .toBe('other');
    expect(warning.severityRank)
      .toBe(1);
    expect(warning.fileLabel)
      .toBe('src/a.cpp');
  });
});

describe('OperateTreeProvider grouped node construction', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockLoadSanitizerPanelData.mockReset();
    mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
  });

  let groupedNodes: (
    mode: 'class' | 'severity' | 'type' | 'file',
    messages: SanitizerMessage[],
    derived: unknown[],
  )=> Array<{ key: string;
    label: string;
    description: string;
    messageIndices: number[] }>;
  const derivedFor = (messages: SanitizerMessage[]): unknown[] => (
    messages.map((msg) => (provider as unknown as {
      buildSanitizerMessageDerived(m: SanitizerMessage): unknown;
    }).buildSanitizerMessageDerived.call(provider, msg))
  );

  beforeEach(() => {
    groupedNodes = (provider as unknown as {
      buildGroupedReportNodes(
        mode: 'class' | 'severity' | 'type' | 'file',
        messages: SanitizerMessage[],
        derived: unknown[],
      ): Array<{ key: string;
        label: string;
        description: string;
        messageIndices: number[] }>;
    }).buildGroupedReportNodes;
  });

  it('counts errors and warnings per severity group', () => {
    const messages = [
      message(),
      message({
        type: 'warning',
        title: 'w1',
      }),
      message({
        type: 'warning',
        title: 'w2',
      }),
    ];
    const groups = groupedNodes.call(provider, 'severity', messages, derivedFor(messages));

    expect(groups.map((group) => group.key))
      .toEqual([
        'error',
        'warning',
      ]);
    expect(groups[0].description)
      .toBe('1');
    expect(groups[1].description)
      .toBe('2');
  });

  it('sorts type groups by error-first rank then label', () => {
    const messages = [
      message({
        question: 'zzz',
        title: 'only warnings type',
        type: 'warning',
      }),
      message({
        question: 'aaa',
        title: 'mixed type',
      }),
    ];
    const groups = groupedNodes.call(provider, 'type', messages, derivedFor(messages));

    expect(groups.map((group) => group.key))
      .toEqual([
        'aaa',
        'zzz',
      ]);
  });

  it('ranks mixed type groups between error-only and warning-only', () => {
    const messages = [
      message({
        question: 'mixed',
        title: 'mixed error',
      }),
      message({
        question: 'mixed',
        title: 'mixed warning',
        type: 'warning',
      }),
      message({
        question: 'error-only',
        title: 'errors only',
      }),
      message({
        question: 'warn-only',
        title: 'warnings only',
        type: 'warning',
      }),
    ];
    const groups = groupedNodes.call(provider, 'type', messages, derivedFor(messages));

    expect(groups.map((group) => group.key))
      .toEqual([
        'error-only',
        'mixed',
        'warn-only',
      ]);
    expect(groups[1].messageIndices)
      .toEqual([
        0,
        1,
      ]);
  });

  it('sorts class groups by class rank and compares message indices', () => {
    const messages = [
      message({
        questionType: 'memoryContention',
        title: 'race',
      }),
      message({
        questionType: 'memory',
        title: 'leak',
      }),
    ];
    const groups = groupedNodes.call(provider, 'class', messages, derivedFor(messages));

    expect(groups[0].key)
      .toBe('memory');
    expect(groups[1].key)
      .toBe('memoryContention');
    expect(groups[0].messageIndices)
      .toEqual([1]);
  });

  it('sorts file groups by label', () => {
    const messages = [
      message({ fileLink: '/ws/b.cpp' }),
      message({ fileLink: '/ws/a.cpp' }),
    ];
    const groups = groupedNodes.call(provider, 'file', messages, derivedFor(messages));

    expect(groups.map((group) => group.label))
      .toEqual([
        'a.cpp',
        'b.cpp',
      ]);
  });

  it('returns the select-report hint group list before a report is chosen', () => {
    const hint = (provider as unknown as {
      getSanitizerResultGroupNodes(): OperateNode[];
    }).getSanitizerResultGroupNodes;

    const nodes = hint.call(provider);

    expect(nodes)
      .toHaveLength(1);
    expect(nodes[0].label)
      .toBe('web.sanitizerPanel.selectReportHint');
  });

  it('builds severity group rows with counts and icons for the selected report', () => {
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    harness.state.sanitizer.selectedMessages = [
      message(),
      message({
        type: 'warning',
        title: 'warn',
      }),
    ];
    harness.state.sanitizer.resultsGroupBy = 'severity';

    const groupNodes = (provider as unknown as {
      getSanitizerResultGroupNodes(): OperateNode[];
    }).getSanitizerResultGroupNodes.call(provider);

    expect(groupNodes.map((node) => node.label))
      .toEqual([
        'web.sanitizerTree.group.error',
        'web.sanitizerTree.group.warning',
      ]);
    expect(groupNodes[0].description)
      .toBe('1 🔴');
    expect(groupNodes[1].description)
      .toBe('1 🟡');
  });

  it('builds file group rows with the path context value', () => {
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    harness.state.sanitizer.selectedMessages = [
      message(),
      message({
        fileLink: undefined,
        title: 'no file',
      }),
    ];
    harness.state.sanitizer.resultsGroupBy = 'file';

    const groupNodes = (provider as unknown as {
      getSanitizerResultGroupNodes(): OperateNode[];
    }).getSanitizerResultGroupNodes.call(provider);
    const fileGroup = groupNodes.find((node) => node.label === 'src/a.cpp')!;

    expect(fileGroup.contextValue)
      .toBe(treeItemContextKey('sanitizerPathGroupItem'));
    expect(groupNodes.find((node) => node.label === 'web.sanitizerTree.group.noFile')!.contextValue)
      .toBeUndefined();
  });

  it('loads and caches visible report data per view cache key', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    mockLoadSanitizerPanelData.mockReturnValue({ data: [message()] });

    const getData = (provider as unknown as {
      getVisibleSanitizerReportData(reportPath: string): Promise<{
        messages: SanitizerMessage[];
        derived: unknown[];
      }>;
    }).getVisibleSanitizerReportData;

    const first = await getData.call(provider, '/reports/r.log');
    const second = await getData.call(provider, '/reports/r.log');

    expect(second.messages)
      .toBe(first.messages);
    expect(second.derived)
      .toBe(first.derived);
    expect(second.messages)
      .toHaveLength(1);
  });

  it('returns an empty message list for an unknown report path', async () => {
    const getMessages = (provider as unknown as {
      getSanitizerMessagesForReport(reportPath: string): Promise<SanitizerMessage[]>;
    }).getSanitizerMessagesForReport;

    await expect(getMessages.call(provider, '/reports/ghost.log'))
      .resolves
      .toEqual([]);
  });

  it('caches messages per report and reuses the cache', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    mockLoadSanitizerPanelData.mockReturnValue({ data: [message()] });

    const getMessages = (provider as unknown as {
      getSanitizerMessagesForReport(reportPath: string): Promise<SanitizerMessage[]>;
    }).getSanitizerMessagesForReport;

    const first = await getMessages.call(provider, '/reports/r.log');

    expect(first)
      .toHaveLength(1);
    expect(mockLoadSanitizerPanelData)
      .toHaveBeenCalledTimes(1);

    await getMessages.call(provider, '/reports/r.log');
    expect(mockLoadSanitizerPanelData)
      .toHaveBeenCalledTimes(1);
  });

  it('reports the sanitizer tree parent only for root report rows', () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    const reportNode = provider.getSanitizerReportsPanelNodes()[0];

    expect(provider.getSanitizerTreeParent(reportNode))
      .toBeNull();
    expect(provider.getSanitizerTreeParent({ nodeId: 'sanitizerMessage' } as OperateNode))
      .toBeUndefined();
  });

  it('returns empty children for unrecognized nodes', async () => {
    const reportNode = {
      nodeId: 'sanitizerReportItem',
      id: 'not-a-report',
    } as OperateNode;

    expect(provider.getChildren(reportNode))
      .toEqual([]);
    expect(provider.getChildren({ nodeId: 'operatorItem' } as OperateNode))
      .toEqual([]);
  });
});

describe('OperateTreeProvider sanitizer refresh from run data', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockGetSanitizerRunData.mockReset();
    mockGetSanitizerRunData.mockResolvedValue([]);
    mockLoadSanitizerPanelData.mockReset();
    mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
    (vscode.commands.executeCommand as jest.Mock)
      .mockReset();
    (vscode.commands.executeCommand as jest.Mock)
      .mockResolvedValue(undefined);
  });

  it('does nothing on the operator-projects tree', async () => {
    const operatorProvider = createProvider('operatorProjects');

    await operatorProvider.refreshSanitizerReports(true, true);

    expect(mockGetSanitizerRunData)
      .not
      .toHaveBeenCalled();
  });

  it('keeps manual reports that still exist and merges new ones', async () => {
    const existing = makeTempReportFile();

    harness.state.sanitizer.manualReports = [
      {
        title: 'kept.log',
        timestamp: 5,
        id: 'sanitizer_kept',
        path: existing,
        marked: false,
      },
      {
        title: 'gone.log',
        timestamp: 6,
        id: 'sanitizer_gone',
        path: '/gone/gone.log',
        marked: false,
      },
    ];
    mockGetSanitizerRunData.mockResolvedValue([report('fresh', 9)]);

    await provider.refreshSanitizerReports();

    expect(harness.state.sanitizer.manualReports
      .map((item) => item.path))
      .toEqual([existing]);
    expect(harness.state.sanitizer.reports
      .map((item) => item.path))
      .toContain(existing);
    expect(harness.state.sanitizer.reports
      .map((item) => item.path))
      .toContain('/reports/fresh.log');
  });

  it('drops the selection of a report that disappeared', async () => {
    harness.state.sanitizer.selectedReportPath = '/reports/gone.log';
    harness.state.sanitizer.selectedReportTitle = 'gone.log';
    mockGetSanitizerRunData.mockResolvedValue([report('fresh', 1)]);

    await provider.refreshSanitizerReports();

    expect(harness.state.sanitizer.selectedReportPath)
      .toBeUndefined();
    expect(harness.state.sanitizer.selectedReportTitle)
      .toBeUndefined();
    expect(harness.state.sanitizer.selectedMessages)
      .toEqual([]);
  });

  it('clears the report list when reading run data fails', async () => {
    harness.state.sanitizer.reports = [report('old', 1)];
    mockGetSanitizerRunData.mockRejectedValue(new Error('read failed'));

    await provider.refreshSanitizerReports();

    expect(harness.state.sanitizer.reports)
      .toEqual([]);
  });

  it('ignores a failing read superseded by a newer refresh', async () => {
    const consoleWarn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    mockGetSanitizerRunData
      .mockRejectedValueOnce(new Error('stale failure'))
      .mockResolvedValueOnce([report('fresh', 1)]);

    const stale = provider.refreshSanitizerReports();
    const fresh = provider.refreshSanitizerReports();

    await Promise.all([
      stale,
      fresh,
    ]);

    expect(harness.state.sanitizer.reports
      .map((item) => item.path))
      .toEqual(['/reports/fresh.log']);
    expect(consoleWarn)
      .not
      .toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('reveals the fresh report row when a results tree view is attached', async () => {
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setSanitizerResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    mockGetSanitizerRunData.mockResolvedValue([
      report('fresh', 2),
      report('old', 1),
    ]);

    await provider.refreshSanitizerReports(true, true);

    expect(reveal)
      .toHaveBeenCalledTimes(1);
    expect((reveal.mock.calls[0][0] as { id?: string }).id)
      .toBe(`sanitizer-report:${encodeURIComponent('/reports/fresh.log')}`);
  });

  it('skips the reveal when the report is no longer listed', async () => {
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setSanitizerResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    harness.state.sanitizer.reports = [report('r', 1)];

    await (provider as unknown as {
      revealSanitizerReport(reportPath: string, refreshRevision?: number): Promise<void>;
    }).revealSanitizerReport.call(provider, '/reports/ghost.log');

    expect(reveal)
      .not
      .toHaveBeenCalled();
  });

  it('drops the vanished selection without revealing when neither flag is set', async () => {
    harness.state.sanitizer.selectedReportPath = '/reports/old.log';
    harness.state.sanitizer.selectedReportTitle = 'old.log';
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setSanitizerResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    mockGetSanitizerRunData.mockResolvedValue([report('fresh', 2)]);

    await provider.refreshSanitizerReports();

    expect(reveal)
      .not
      .toHaveBeenCalled();
    expect(harness.state.sanitizer.selectedReportPath)
      .toBeUndefined();
    expect(harness.state.sanitizer.selectedReportTitle)
      .toBeUndefined();
    expect(harness.state.sanitizer.selectedMessages)
      .toEqual([]);
  });

  it('keeps the view focus even when the reveal command fails', async () => {
    const consoleWarn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    mockGetSanitizerRunData.mockResolvedValue([report('fresh', 2)]);
    (vscode.commands.executeCommand as jest.Mock)
      .mockImplementationOnce(async (command: string) => {
        if (command === `${TREE_VIEW_SANITIZER_RESULTS}.focus`) {
          throw new Error('view missing');
        }

        return undefined;
      });

    await provider.refreshSanitizerReports(true, true);

    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/fresh.log');
    expect(consoleWarn)
      .toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('warns when syncing the marked-filter context fails', async () => {
    const consoleWarn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    harness.state.sanitizer.markedOnly = true;
    mockGetSanitizerRunData.mockResolvedValue([report('fresh', 2)]);
    (vscode.commands.executeCommand as jest.Mock)
      .mockRejectedValue(new Error('context failed'));

    await provider.refreshSanitizerReports(true, true);

    expect(consoleWarn)
      .toHaveBeenCalledWith(
        '[OperateTreeProvider.refreshSanitizerReports] marked filter context sync failed:',
        expect.any(Error),
      );
    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/fresh.log');

    consoleWarn.mockRestore();
  });

  it('lets a newer refresh supersede the selection of an older one', async () => {
    mockGetSanitizerRunData.mockResolvedValue([report('fresh', 2)]);
    let startedSecond = false;

    mockLoadSanitizerPanelData.mockImplementation(() => {
      if (!startedSecond) {
        startedSecond = true;
        // A newer refresh starts while the older one is still selecting its report.
        void provider.refreshSanitizerReports(true, true);
      }

      return { data: [message()] };
    });

    await provider.refreshSanitizerReports(true, true);

    expect(harness.state.sanitizer.reportRevision)
      .toBe(2);
    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/fresh.log');
    expect(harness.state.sanitizer.selectedMessages)
      .toHaveLength(1);
  });

  it('keeps the selection of a reentrant select over the outer one', async () => {
    harness.state.sanitizer.reports = [report('r', 1)];
    let nested = false;

    mockLoadSanitizerPanelData.mockImplementation(() => {
      if (!nested) {
        nested = true;
        void provider.selectSanitizerReport('/reports/r.log');
      }

      return { data: [message()] };
    });

    await provider.selectSanitizerReport('/reports/r.log');

    expect(mockLoadSanitizerPanelData)
      .toHaveBeenCalledTimes(2);
    expect(harness.state.sanitizer.reportRevision)
      .toBe(2);
  });
});
