import type {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
  PerformanceRunDataFolder,
} from '@shared/api-types';
import {
  CONTEXT_PREFIX,
  TREE_VIEW_PERFORMANCE_RESULTS,
} from '@shared/flavor';

const mockGetRunData = jest.fn();
const mockOpenInsight = jest.fn();
const mockOpenCsvFile = jest.fn();
const mockExistsSync = jest.fn();

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
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

  return {
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    EventEmitter,
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
      onDidChangeActiveColorTheme: jest.fn(),
      showErrorMessage: jest.fn(),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
    },
  };
});

jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: {} }));
jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: {} }));
jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: {} }));
jest.mock('@plugin/controller/performance-controller', () => ({ performanceDataMethods: {} }));
jest.mock('@plugin/controller/performance-data-controller', () => ({
  performanceMethods: {
    getRunData: mockGetRunData,
    toggleRecordMark: jest.fn(),
    copyReport: jest.fn(),
    downloadReport: jest.fn(),
  },
}));
jest.mock('@plugin/service/view-service', () => ({
  viewService: {
    openInsight: (...args: unknown[]) => mockOpenInsight(...args),
    openCsvFile: (...args: unknown[]) => mockOpenCsvFile(...args),
  },
}));
jest.mock('@plugin/helpers/environment-script-guard', () => ({ ensureEnvironmentScriptForOperateAction: jest.fn() }));
jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));
jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: {} }));
jest.mock('@plugin/service/run-data-service', () => ({ runDataService: {} }));
jest.mock('@plugin/helpers/st-test-action', () => ({
  getStTestSelectionState: jest.fn(() => 'none'),
  shouldShowStTestAction: jest.fn(() => false),
}));

import * as vscode from 'vscode';
import {
  OperateNode,
  OperateTreeProvider,
} from '@plugin/class/operate-tree-provider';

type PerformanceStateHarness = {
  state: {
    hasDevtoolConfig: boolean;
    performance: {
      reports: PerformanceExecutionRecord[];
      sortOrder: 'asc' | 'desc';
      markedOnly: boolean;
      selectedReportKey?: string;
    };
  };
};

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

const folder = (
  title: string,
  children: PerformanceRunDataFolder['children'],
): PerformanceRunDataFolder => ({
  title,
  children,
});

const reportFile = (
  recordKey: string,
  name: string,
  fileType: string,
): PerformanceRunDataFile => ({
  key: `${recordKey}/${name}`,
  title: name,
  filePath: `/reports/${recordKey}/${name}`,
  fileType,
});

const createProvider = (): OperateTreeProvider => {
  const provider = new OperateTreeProvider(vscode.Uri.file('/extension'));

  (provider as unknown as PerformanceStateHarness).state = {
    hasDevtoolConfig: true,
    performance: {
      reports: [],
      sortOrder: 'desc',
      markedOnly: false,
    },
  };

  return provider;
};

const deferred = <T>() => {
  let resolve!: (value: T)=> void;
  let reject!: (reason?: unknown)=> void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

const waitFor = async (predicate: ()=> boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('Timed out waiting for asynchronous test state');
};

describe('OperateTreeProvider performance refresh reconciliation', () => {
  const executeCommandMock = vscode.commands.executeCommand as jest.MockedFunction<typeof vscode.commands.executeCommand>;
  const showErrorMessageMock = vscode.window.showErrorMessage as jest.MockedFunction<typeof vscode.window.showErrorMessage>;

  beforeEach(() => {
    mockGetRunData.mockReset();
    mockOpenInsight.mockReset();
    mockOpenInsight.mockResolvedValue(undefined);
    mockOpenCsvFile.mockReset();
    mockOpenCsvFile.mockResolvedValue(undefined);
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(true);
    executeCommandMock.mockReset();
    executeCommandMock.mockResolvedValue(undefined);
    showErrorMessageMock.mockReset();
  });

  it('clears deleted selection and does not resurrect it when the same key returns', async () => {
    const provider = createProvider();
    const harness = provider as unknown as PerformanceStateHarness;

    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('deleted', 1),
        record('survivor', 2),
      ],
    });
    await provider.refreshPerformanceReports();
    harness.state.performance.selectedReportKey = 'deleted';
    executeCommandMock.mockClear();

    mockGetRunData.mockResolvedValueOnce({ data: [record('survivor', 2)] });
    await provider.refreshPerformanceReports();

    expect(provider.getSelectedPerformanceReport())
      .toBeUndefined();
    expect(harness.state.performance.selectedReportKey)
      .toBeUndefined();
    expect(executeCommandMock)
      .toHaveBeenNthCalledWith(
        1,
        'setContext',
        `${CONTEXT_PREFIX}.performanceReportSelected`,
        false,
      );
    expect(executeCommandMock)
      .toHaveBeenNthCalledWith(
        2,
        'setContext',
        `${CONTEXT_PREFIX}.performanceSelectedReportMarked`,
        false,
      );

    executeCommandMock.mockClear();
    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('deleted', 3),
        record('survivor', 2),
      ],
    });
    await provider.refreshPerformanceReports();

    expect(provider.getSelectedPerformanceReport())
      .toBeUndefined();
    expect(harness.state.performance.selectedReportKey)
      .toBeUndefined();
    expect(executeCommandMock)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.performanceReportSelected`,
        false,
      );
  });

  it('keeps the newest requested snapshot when an older refresh resolves last', async () => {
    const provider = createProvider();
    const older = deferred<{ data: PerformanceExecutionRecord[] }>();

    mockGetRunData
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ data: [record('newer', 2)] });

    const olderRefresh = provider.refreshPerformanceReports();
    const newerRefresh = provider.refreshPerformanceReports();

    await newerRefresh;
    older.resolve({ data: [record('older', 1)] });
    await olderRefresh;

    expect(provider.getPerformanceReportByKey('newer'))
      .toBeDefined();
    expect(provider.getPerformanceReportByKey('older'))
      .toBeUndefined();
    expect(executeCommandMock)
      .toHaveBeenCalledTimes(2);
  });

  it('serializes context updates so an older refresh cannot overwrite deletion state', async () => {
    const provider = createProvider();
    const harness = provider as unknown as PerformanceStateHarness;
    const selected = {
      ...record('selected', 1),
      marked: true,
    };
    const delayedSelectedContext = deferred<unknown>();

    harness.state.performance.reports = [selected];
    harness.state.performance.selectedReportKey = selected.key;
    executeCommandMock.mockImplementation(async (_command, key, value) => {
      if (
        key === `${CONTEXT_PREFIX}.performanceReportSelected`
        && value === true
        && executeCommandMock.mock.calls.length === 1
      ) {
        await delayedSelectedContext.promise;
      }

      return undefined;
    });
    mockGetRunData
      .mockResolvedValueOnce({ data: [selected] })
      .mockResolvedValueOnce({ data: [] });

    const olderRefresh = provider.refreshPerformanceReports();

    await waitFor(() => executeCommandMock.mock.calls.length === 1);
    const newerRefresh = provider.refreshPerformanceReports();

    await waitFor(() => provider.getPerformanceReportByKey(selected.key) === undefined);
    delayedSelectedContext.resolve(undefined);
    await Promise.all([
      olderRefresh,
      newerRefresh,
    ]);

    expect(executeCommandMock.mock.calls.map((call) => call.slice(1)))
      .toEqual([
        [
          `${CONTEXT_PREFIX}.performanceReportSelected`,
          true,
        ],
        [
          `${CONTEXT_PREFIX}.performanceReportSelected`,
          false,
        ],
        [
          `${CONTEXT_PREFIX}.performanceSelectedReportMarked`,
          false,
        ],
      ]);
  });

  it('does not reveal an old report after a newer deletion refresh starts', async () => {
    const provider = createProvider();
    const delayedFocus = deferred<unknown>();
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setPerformanceResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === `${TREE_VIEW_PERFORMANCE_RESULTS}.focus`) {
        await delayedFocus.promise;
      }

      return undefined;
    });
    mockGetRunData
      .mockResolvedValueOnce({ data: [record('deleted-before-reveal', 1)] })
      .mockResolvedValueOnce({ data: [] });

    const olderRefresh = provider.refreshPerformanceReports({ focusIfNew: true });

    await waitFor(() => executeCommandMock.mock.calls.some(([command]) => (
      command === `${TREE_VIEW_PERFORMANCE_RESULTS}.focus`
    )));
    await provider.refreshPerformanceReports();
    delayedFocus.resolve(undefined);
    await olderRefresh;

    expect(reveal).not.toHaveBeenCalled();
    expect(provider.getPerformanceReportByKey('deleted-before-reveal'))
      .toBeUndefined();
    expect(provider.getSelectedPerformanceReport())
      .toBeUndefined();
  });

  it('preserves the last valid inventory on a scan failure', async () => {
    const provider = createProvider();
    const scanError = new Error('scan unavailable');
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockGetRunData.mockResolvedValueOnce({ data: [record('last-valid', 1)] });
    await provider.refreshPerformanceReports();
    (provider as unknown as PerformanceStateHarness).state.performance.selectedReportKey = 'last-valid';
    executeCommandMock.mockClear();
    mockGetRunData.mockRejectedValueOnce(scanError);

    await provider.refreshPerformanceReports();

    expect(provider.getPerformanceReportByKey('last-valid'))
      .toBeDefined();
    expect(provider.getSelectedPerformanceReport()?.key)
      .toBe('last-valid');
    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(consoleError)
      .toHaveBeenCalledWith('Failed to load performance reports:', scanError);
    consoleError.mockRestore();
  });

  it('does not apply an older success after a newer refresh fails', async () => {
    const provider = createProvider();
    const older = deferred<{ data: PerformanceExecutionRecord[] }>();
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1)] });
    await provider.refreshPerformanceReports();
    mockGetRunData
      .mockReturnValueOnce(older.promise)
      .mockRejectedValueOnce(new Error('newest failed'));

    const olderRefresh = provider.refreshPerformanceReports();

    await provider.refreshPerformanceReports();
    older.resolve({ data: [record('stale', 2)] });
    await olderRefresh;

    expect(provider.getPerformanceReportByKey('baseline'))
      .toBeDefined();
    expect(provider.getPerformanceReportByKey('stale'))
      .toBeUndefined();
    consoleError.mockRestore();
  });

  it('keeps folder identity stable when a preceding sibling is deleted', async () => {
    const provider = createProvider();
    const fileA = {
      key: '/reports/report/folder-a/a.csv',
      title: 'a.csv',
      filePath: '/reports/report/folder-a/a.csv',
      fileType: 'csv',
    };
    const fileB = {
      key: '/reports/report/folder-b/b.json',
      title: 'b.json',
      filePath: '/reports/report/folder-b/b.json',
      fileType: 'json',
    };

    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('report', 1, [
          folder('folder-a', [fileA]),
          folder('folder-b', [fileB]),
        ]),
      ],
    });
    await provider.refreshPerformanceReports();

    const reportNode = provider.getPerformanceResultsPanelNodes()[0];
    const originalFolders = provider.getChildren(reportNode) as OperateNode[];
    const deletedFolderNode = originalFolders.find((node) => node.label === 'folder-a')!;
    const survivingFolderNode = originalFolders.find((node) => node.label === 'folder-b')!;

    mockGetRunData.mockResolvedValueOnce({ data: [record('report', 1, [folder('folder-b', [fileB])])] });
    await provider.refreshPerformanceReports();

    const refreshedReportNode = provider.getPerformanceResultsPanelNodes()[0];
    const refreshedFolders = provider.getChildren(refreshedReportNode) as OperateNode[];
    const refreshedSurvivor = refreshedFolders[0];

    expect(refreshedSurvivor.id)
      .toBe(survivingFolderNode.id);
    expect((provider.getChildren(survivingFolderNode) as OperateNode[]).map((node) => node.label))
      .toEqual(['b.json']);
    expect(provider.getChildren(deletedFolderNode))
      .toEqual([]);
  });

  it('opens the insight data file of the report a finished run produced', async () => {
    const provider = createProvider();

    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1)] });
    await provider.refreshPerformanceReports();

    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('baseline', 1),
        record('fresh', 2, [
          folder('table', [reportFile('fresh', 'summary.csv', 'csv')]),
          reportFile('fresh', 'profiling.json', 'json'),
          reportFile('fresh', 'profiling.bin', 'bin'),
        ]),
      ],
    });
    await provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    });

    expect(mockOpenInsight)
      .toHaveBeenCalledTimes(1);
    expect(mockOpenInsight)
      .toHaveBeenCalledWith('/reports/fresh/profiling.bin');
    expect(mockOpenCsvFile)
      .not
      .toHaveBeenCalled();
  });

  it('falls back to the csv table when the new report has no insight data file', async () => {
    const provider = createProvider();

    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1)] });
    await provider.refreshPerformanceReports();

    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('baseline', 1),
        record('fresh', 2, [folder('table', [reportFile('fresh', 'summary.csv', 'csv')])]),
      ],
    });
    await provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    });

    expect(mockOpenCsvFile)
      .toHaveBeenCalledWith('/reports/fresh/summary.csv');
    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
  });

  it('opens nothing when a run produced no new report or no openable file', async () => {
    const provider = createProvider();

    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1, [reportFile('baseline', 'a.bin', 'bin')])] });
    await provider.refreshPerformanceReports();

    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1, [reportFile('baseline', 'a.bin', 'bin')])] });
    await provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    });

    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('baseline', 1, [reportFile('baseline', 'a.bin', 'bin')]),
        record('empty', 2, [folder('logs', [])]),
      ],
    });
    await provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    });

    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
    expect(mockOpenCsvFile)
      .not
      .toHaveBeenCalled();
  });

  it('does not open a report when the refresh was not triggered by a finished run', async () => {
    const provider = createProvider();

    mockGetRunData.mockResolvedValueOnce({ data: [record('fresh', 2, [reportFile('fresh', 'profiling.bin', 'bin')])] });
    await provider.refreshPerformanceReports();

    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
  });

  it('reveals but does not open for a run that only reported it finished', async () => {
    const provider = createProvider();

    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1)] });
    await provider.refreshPerformanceReports();

    // The post-action hook runs from a finally, so a stopped run gets here too and its
    // report directory holds a half-written csv.
    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('baseline', 1),
        record('partial', 2, [reportFile('partial', 'summary.csv', 'csv')]),
      ],
    });
    await provider.refreshPerformanceReports({ focusIfNew: true });

    expect(mockOpenCsvFile)
      .not
      .toHaveBeenCalled();
    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
  });

  it('prefers the json data file over a csv table', async () => {
    const provider = createProvider();

    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1)] });
    await provider.refreshPerformanceReports();

    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('baseline', 1),
        record('fresh', 2, [
          folder('table', [reportFile('fresh', 'summary.csv', 'csv')]),
          reportFile('fresh', 'profiling.json', 'json'),
        ]),
      ],
    });
    await provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    });

    expect(mockOpenInsight)
      .toHaveBeenCalledWith('/reports/fresh/profiling.json');
    expect(mockOpenCsvFile)
      .not
      .toHaveBeenCalled();
  });

  it('does not open a batch of reports discovered by the very first scan', async () => {
    const provider = createProvider();

    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('first', 1, [reportFile('first', 'a.bin', 'bin')]),
        record('second', 2, [reportFile('second', 'b.bin', 'bin')]),
      ],
    });
    await provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    });

    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
  });

  it('does not open a stale report after a newer refresh started', async () => {
    const provider = createProvider();
    const delayedContext = deferred<unknown>();
    let contextGateHit = false;

    mockGetRunData
      .mockResolvedValueOnce({ data: [record('baseline', 1)] })
      .mockResolvedValueOnce({
        data: [
          record('baseline', 1),
          record('gone', 2, [reportFile('gone', 'profiling.bin', 'bin')]),
        ],
      })
      .mockResolvedValueOnce({ data: [record('baseline', 1)] });

    await provider.refreshPerformanceReports();

    executeCommandMock.mockImplementation(async () => {
      if (!contextGateHit) {
        contextGateHit = true;
        await delayedContext.promise;
      }

      return undefined;
    });

    const staleRefresh = provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    });

    await waitFor(() => contextGateHit);

    const newerRefresh = provider.refreshPerformanceReports();

    delayedContext.resolve(undefined);
    await Promise.all([
      staleRefresh,
      newerRefresh,
    ]);

    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
  });

  it('tells the user when the produced report is gone before it can be opened', async () => {
    const provider = createProvider();
    const consoleWarn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1)] });
    await provider.refreshPerformanceReports();

    mockExistsSync.mockReturnValue(false);
    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('baseline', 1),
        record('fresh', 2, [reportFile('fresh', 'profiling.bin', 'bin')]),
      ],
    });
    await provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    });

    expect(mockExistsSync)
      .toHaveBeenCalledWith('/reports/fresh/profiling.bin');
    expect(mockOpenInsight)
      .not
      .toHaveBeenCalled();
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('performance.openReportFailed');
    expect(consoleWarn)
      .toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('survives a failing report open', async () => {
    const provider = createProvider();
    const consoleWarn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    mockOpenInsight.mockRejectedValueOnce(new Error('viewer unavailable'));
    mockGetRunData.mockResolvedValueOnce({ data: [record('baseline', 1)] });
    await provider.refreshPerformanceReports();

    mockGetRunData.mockResolvedValueOnce({
      data: [
        record('baseline', 1),
        record('fresh', 2, [reportFile('fresh', 'profiling.bin', 'bin')]),
      ],
    });

    await expect(provider.refreshPerformanceReports({
      focusIfNew: true,
      openIfNew: true,
    }))
      .resolves
      .toBeUndefined();
    expect((provider as unknown as PerformanceStateHarness).state.performance.reports.map((item) => item.key))
      .toEqual([
        'fresh',
        'baseline',
      ]);
    expect(consoleWarn)
      .toHaveBeenCalled();
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('performance.openReportFailed');
    consoleWarn.mockRestore();
  });
});
