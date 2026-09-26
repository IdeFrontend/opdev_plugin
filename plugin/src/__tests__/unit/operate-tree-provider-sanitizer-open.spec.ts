import {
  CONTEXT_PREFIX,
  TREE_VIEW_SANITIZER_RESULTS,
} from '@shared/flavor';

const mockGetSanitizerRunData = jest.fn();
const mockLoadSanitizerPanelData = jest.fn();

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
      registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
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
jest.mock('@plugin/controller/performance-data-controller', () => ({ performanceMethods: {} }));
jest.mock('@plugin/service/view-service', () => ({ viewService: {} }));
jest.mock('@plugin/helpers/environment-script-guard', () => ({ ensureEnvironmentScriptForOperateAction: jest.fn() }));
jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));
jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: { loadSanitizerPanelData: mockLoadSanitizerPanelData } }));
jest.mock('@plugin/service/run-data-service', () => ({ runDataService: { getSanitizerRunData: mockGetSanitizerRunData } }));
jest.mock('@plugin/helpers/st-test-action', () => ({
  getStTestSelectionState: jest.fn(() => 'none'),
  shouldShowStTestAction: jest.fn(() => false),
}));

import * as vscode from 'vscode';
import { OperateTreeProvider } from '@plugin/class/operate-tree-provider';

type SanitizerReport = {
  title: string;
  timestamp: number;
  id: string;
  path: string;
  marked: boolean;
};

type SanitizerStateHarness = {
  state: {
    sanitizer: {
      reports: SanitizerReport[];
      selectedReportPath?: string;
      selectedReportTitle?: string;
    };
  };
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

const report = (name: string, timestamp: number): SanitizerReport => ({
  title: `${name}.log`,
  timestamp,
  id: `sanitizer_/reports/${name}.log`,
  path: `/reports/${name}.log`,
  marked: false,
});

const waitFor = async (predicate: ()=> boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('Timed out waiting for asynchronous test state');
};

describe('OperateTreeProvider sanitizer report auto open', () => {
  const executeCommandMock = vscode.commands.executeCommand as jest.MockedFunction<typeof vscode.commands.executeCommand>;
  const focusCommand = `${TREE_VIEW_SANITIZER_RESULTS}.focus`;

  const createProvider = (): OperateTreeProvider => new OperateTreeProvider(vscode.Uri.file('/extension'));

  const wasFocused = (): boolean => executeCommandMock.mock.calls.some(([command]) => command === focusCommand);

  beforeEach(() => {
    mockGetSanitizerRunData.mockReset();
    mockLoadSanitizerPanelData.mockReset();
    mockLoadSanitizerPanelData.mockReturnValue({ data: [] });
    executeCommandMock.mockReset();
    executeCommandMock.mockResolvedValue(undefined);
  });

  it('switches to the newest report and focuses the tree after a finished detection', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;

    mockGetSanitizerRunData.mockResolvedValue([
      report('fresh-detection', 2),
      report('previous-detection', 1),
    ]);
    harness.state.sanitizer.selectedReportPath = '/reports/previous-detection.log';

    await provider.refreshSanitizerReports(true, true);

    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/fresh-detection.log');
    expect(harness.state.sanitizer.selectedReportTitle)
      .toBe('fresh-detection.log');
    expect(wasFocused())
      .toBe(true);
  });

  it('keeps the manual selection and the tree focus alone on a plain refresh', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;

    mockGetSanitizerRunData.mockResolvedValue([
      report('fresh-detection', 2),
      report('previous-detection', 1),
    ]);
    harness.state.sanitizer.selectedReportPath = '/reports/previous-detection.log';

    await provider.refreshSanitizerReports(true);

    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/previous-detection.log');
    expect(wasFocused())
      .toBe(false);
  });

  it('selects the newest report by timestamp when nothing is selected yet', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;

    mockGetSanitizerRunData.mockResolvedValue([
      report('older-detection', 1),
      report('newest-detection', 3),
    ]);

    await provider.refreshSanitizerReports(true);

    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/newest-detection.log');
    expect(wasFocused())
      .toBe(false);
  });

  it('does not focus anything when a detection produced no report', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;

    mockGetSanitizerRunData.mockResolvedValue([]);

    await provider.refreshSanitizerReports(true, true);

    expect(harness.state.sanitizer.selectedReportPath)
      .toBeUndefined();
    expect(wasFocused())
      .toBe(false);
  });

  it('keeps the newest detection selected when an older refresh resolves last', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;
    const older = deferred<SanitizerReport[]>();

    mockGetSanitizerRunData
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce([report('fresh-detection', 3)]);

    const olderRefresh = provider.refreshSanitizerReports(true, true);
    const newerRefresh = provider.refreshSanitizerReports(true, true);

    await newerRefresh;
    older.resolve([report('stale-detection', 1)]);
    await olderRefresh;

    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/fresh-detection.log');
    expect(harness.state.sanitizer.reports.map((item) => item.path))
      .toEqual(['/reports/fresh-detection.log']);
  });

  it('opens the fresh report only for the command payload SanitizerService sends', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;

    mockGetSanitizerRunData.mockResolvedValue([
      report('fresh-detection', 2),
      report('previous-detection', 1),
    ]);
    harness.state.sanitizer.selectedReportPath = '/reports/previous-detection.log';

    // Every other dispatcher passes no payload and must not move the selection.
    await provider.flashSanitizerRunData();

    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/previous-detection.log');
    expect(wasFocused())
      .toBe(false);

    await provider.flashSanitizerRunData({ openLatest: true });

    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/fresh-detection.log');
    expect(wasFocused())
      .toBe(true);
  });

  it('drops the marked-only filter, which would hide the report it just opened', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;

    mockGetSanitizerRunData.mockResolvedValue([report('fresh-detection', 2)]);
    provider.setSanitizerMarkedOnly(true);

    await provider.refreshSanitizerReports(true, true);

    expect(provider.isSanitizerMarkedOnlyEnabled())
      .toBe(false);
    expect(executeCommandMock)
      .toHaveBeenCalledWith('setContext', `${CONTEXT_PREFIX}.sanitizerMarkedOnly`, false);
    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/fresh-detection.log');
  });

  it('keeps the marked-only filter when the fresh report is marked anyway', async () => {
    const provider = createProvider();

    mockGetSanitizerRunData.mockResolvedValue([
      {
        ...report('fresh-detection', 2),
        marked: true,
      },
    ]);
    provider.setSanitizerMarkedOnly(true);

    await provider.refreshSanitizerReports(true, true);

    expect(provider.isSanitizerMarkedOnlyEnabled())
      .toBe(true);
  });

  it('reveals the fresh report row, not just the view holding it', async () => {
    const provider = createProvider();
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setSanitizerResultsTreeView({ reveal } as unknown as vscode.TreeView<never>);
    mockGetSanitizerRunData.mockResolvedValue([
      report('older-detection', 1),
      report('fresh-detection', 2),
    ]);

    await provider.refreshSanitizerReports(true, true);

    expect(reveal)
      .toHaveBeenCalledTimes(1);
    expect((reveal.mock.calls[0][0] as { id?: string }).id)
      .toBe(`sanitizer-report:${encodeURIComponent('/reports/fresh-detection.log')}`);
  });

  it('does not steal focus for a report a newer refresh already dropped', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;
    const delayedFocus = deferred<unknown>();
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setSanitizerResultsTreeView({ reveal } as unknown as vscode.TreeView<never>);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === focusCommand) {
        await delayedFocus.promise;
      }

      return undefined;
    });
    mockGetSanitizerRunData
      .mockResolvedValueOnce([report('deleted-before-reveal', 1)])
      .mockResolvedValueOnce([]);

    const olderRefresh = provider.refreshSanitizerReports(true, true);

    await waitFor(() => executeCommandMock.mock.calls.some(([command]) => command === focusCommand));
    await provider.refreshSanitizerReports();
    delayedFocus.resolve(undefined);
    await olderRefresh;

    expect(reveal).not.toHaveBeenCalled();
    expect(harness.state.sanitizer.reports)
      .toEqual([]);
  });

  it('reports the detection as done even when the fresh report cannot be read', async () => {
    const provider = createProvider();
    const consoleWarn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    mockGetSanitizerRunData.mockResolvedValue([report('fresh-detection', 2)]);
    mockLoadSanitizerPanelData.mockImplementation(() => {
      throw new Error('report is not readable');
    });

    await expect(provider.refreshSanitizerReports(true, true))
      .resolves
      .toBeUndefined();
    expect(wasFocused())
      .toBe(true);
    expect(consoleWarn)
      .toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('still switches to the fresh report when focusing the tree fails', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;
    const consoleWarn = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    mockGetSanitizerRunData.mockResolvedValue([report('fresh-detection', 2)]);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === focusCommand) {
        throw new Error('view not registered');
      }

      return undefined;
    });

    await expect(provider.refreshSanitizerReports(true, true))
      .resolves
      .toBeUndefined();
    expect(harness.state.sanitizer.selectedReportPath)
      .toBe('/reports/fresh-detection.log');

    consoleWarn.mockRestore();
  });

  it('does not focus the view for a refresh a newer one already superseded', async () => {
    const provider = createProvider();
    const stale = deferred<SanitizerReport[]>();

    mockGetSanitizerRunData
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([report('fresh-detection', 3)]);

    const staleRefresh = provider.refreshSanitizerReports(true, true);
    const newerRefresh = provider.refreshSanitizerReports(true);

    await newerRefresh;
    stale.resolve([report('stale-detection', 1)]);
    await staleRefresh;

    expect(wasFocused())
      .toBe(false);
  });

  it('does not reveal a stale report when a newer refresh starts while the view is focusing', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;
    const reveal = jest.fn()
      .mockResolvedValue(undefined);
    const delayedFocus = deferred<undefined>();
    let focusGateHit = false;

    provider.setSanitizerResultsTreeView({ reveal } as unknown as vscode.TreeView<never>);
    mockGetSanitizerRunData
      .mockResolvedValueOnce([report('stale-detection', 1)])
      .mockResolvedValueOnce([report('fresh-detection', 3)]);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === focusCommand && !focusGateHit) {
        focusGateHit = true;
        await delayedFocus.promise;
      }

      return undefined;
    });

    const staleRefresh = provider.refreshSanitizerReports(true, true);

    await waitFor(() => focusGateHit);

    const newerRefresh = provider.refreshSanitizerReports(true);

    delayedFocus.resolve(undefined);
    await Promise.all([
      staleRefresh,
      newerRefresh,
    ]);

    expect(reveal)
      .not
      .toHaveBeenCalled();
    expect(harness.state.sanitizer.reports.map((item) => item.path))
      .toEqual(['/reports/fresh-detection.log']);
  });

  it('does not select or focus for a refresh superseded while the marked filter is syncing', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;
    const delayedContext = deferred<undefined>();
    let contextGateHit = false;

    provider.setSanitizerMarkedOnly(true);
    mockGetSanitizerRunData
      .mockResolvedValueOnce([report('stale-detection', 1)])
      .mockResolvedValueOnce([report('fresh-detection', 3)]);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === 'setContext' && !contextGateHit) {
        contextGateHit = true;
        await delayedContext.promise;
      }

      return undefined;
    });

    const staleRefresh = provider.refreshSanitizerReports(true, true);

    await waitFor(() => contextGateHit);

    // A plain reload, so any selection left behind can only come from the superseded refresh.
    const newerRefresh = provider.refreshSanitizerReports();

    delayedContext.resolve(undefined);
    await Promise.all([
      staleRefresh,
      newerRefresh,
    ]);

    expect(harness.state.sanitizer.selectedReportPath)
      .toBeUndefined();
    expect(wasFocused())
      .toBe(false);
  });
  it('does not steal focus for a report a newer refresh already dropped', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;
    const delayedFocus = deferred<unknown>();
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setSanitizerResultsTreeView({ reveal } as unknown as vscode.TreeView<never>);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === focusCommand) {
        await delayedFocus.promise;
      }

      return undefined;
    });
    mockGetSanitizerRunData
      .mockResolvedValueOnce([report('deleted-before-reveal', 1)])
      .mockResolvedValueOnce([]);

    const olderRefresh = provider.refreshSanitizerReports(true, true);

    await waitFor(() => executeCommandMock.mock.calls.some(([command]) => command === focusCommand));
    await provider.refreshSanitizerReports();
    delayedFocus.resolve(undefined);
    await olderRefresh;

    expect(reveal).not.toHaveBeenCalled();
    expect(harness.state.sanitizer.reports)
      .toEqual([]);
  });

  it('does not focus the view for a refresh a newer one already superseded', async () => {
    const provider = createProvider();
    const stale = deferred<SanitizerReport[]>();

    mockGetSanitizerRunData
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([report('fresh-detection', 3)]);

    const staleRefresh = provider.refreshSanitizerReports(true, true);
    const newerRefresh = provider.refreshSanitizerReports(true);

    await newerRefresh;
    stale.resolve([report('stale-detection', 1)]);
    await staleRefresh;

    expect(wasFocused())
      .toBe(false);
  });

  it('does not reveal a stale report when a newer refresh starts while the view is focusing', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;
    const reveal = jest.fn()
      .mockResolvedValue(undefined);
    const delayedFocus = deferred<undefined>();
    let focusGateHit = false;

    provider.setSanitizerResultsTreeView({ reveal } as unknown as vscode.TreeView<never>);
    mockGetSanitizerRunData
      .mockResolvedValueOnce([report('stale-detection', 1)])
      .mockResolvedValueOnce([report('fresh-detection', 3)]);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === focusCommand && !focusGateHit) {
        focusGateHit = true;
        await delayedFocus.promise;
      }

      return undefined;
    });

    const staleRefresh = provider.refreshSanitizerReports(true, true);

    await waitFor(() => focusGateHit);

    const newerRefresh = provider.refreshSanitizerReports(true);

    delayedFocus.resolve(undefined);
    await Promise.all([
      staleRefresh,
      newerRefresh,
    ]);

    expect(reveal)
      .not
      .toHaveBeenCalled();
    expect(harness.state.sanitizer.reports.map((item) => item.path))
      .toEqual(['/reports/fresh-detection.log']);
  });

  it('does not select or focus for a refresh superseded while the marked filter is syncing', async () => {
    const provider = createProvider();
    const harness = provider as unknown as SanitizerStateHarness;
    const delayedContext = deferred<undefined>();
    let contextGateHit = false;

    provider.setSanitizerMarkedOnly(true);
    mockGetSanitizerRunData
      .mockResolvedValueOnce([report('stale-detection', 1)])
      .mockResolvedValueOnce([report('fresh-detection', 3)]);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === 'setContext' && !contextGateHit) {
        contextGateHit = true;
        await delayedContext.promise;
      }

      return undefined;
    });

    const staleRefresh = provider.refreshSanitizerReports(true, true);

    await waitFor(() => contextGateHit);

    // A plain reload, so any selection left behind can only come from the superseded refresh.
    const newerRefresh = provider.refreshSanitizerReports();

    delayedContext.resolve(undefined);
    await Promise.all([
      staleRefresh,
      newerRefresh,
    ]);

    expect(harness.state.sanitizer.selectedReportPath)
      .toBeUndefined();
    expect(wasFocused())
      .toBe(false);
  });
});
