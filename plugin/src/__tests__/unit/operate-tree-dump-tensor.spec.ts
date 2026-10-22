/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
  PerformanceRunDataFolder,
} from '@shared/api-types';
import {
  DUMP_TENSOR_SIDEBAR_VIEW_ID,
  treeItemContextKey,
} from '@shared/flavor';
import { COMMAND_SIDEBAR_DUMP_TENSOR_FILE_OPEN } from '../../constants';
import { stableCommandId } from '@plugin/domain/utils/command-utils';

const mockGetDumpTensorData = jest.fn();
const mockToggleRecordMark = jest.fn();
const mockDownloadReport = jest.fn();
const mockDiffFiles = jest.fn();
const mockGetProjectType = jest.fn();
const mockCheckMultipleOperators = jest.fn();
const mockTranslateOptions = jest.fn();

jest.mock('i18next', () => ({
  t: (key: string, options?: unknown) => {
    mockTranslateOptions(options);

    return key;
  },
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
    nodeId?: string;

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
      registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
    },
    env: {
      language: 'en',
      clipboard: { writeText: jest.fn() },
    },
    window: {
      activeColorTheme: { kind: 2 },
      onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })),
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showWarningMessage: jest.fn(),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
      fs: { stat: jest.fn() },
    },
  };
});

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    getProjectType: (...args: unknown[]) => mockGetProjectType(...args),
    checkMultipleOperators: (...args: unknown[]) => mockCheckMultipleOperators(...args),
  },
}));
jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: { read: jest.fn(() => true) } }));
jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { isProjectTypeSupported: jest.fn(() => true) } }));
jest.mock('@plugin/controller/performance-controller', () => ({ performanceDataMethods: {} }));
jest.mock('@plugin/controller/performance-data-controller', () => ({ performanceMethods: {} }));
jest.mock('@plugin/controller/dump-tensor-controller', () => ({
  dumpTensorMethods: {
    getDumpTensorData: (...args: unknown[]) => mockGetDumpTensorData(...args),
    toggleRecordMark: (...args: unknown[]) => mockToggleRecordMark(...args),
    downloadReport: (...args: unknown[]) => mockDownloadReport(...args),
    diffFiles: (...args: unknown[]) => mockDiffFiles(...args),
  },
}));
jest.mock('@plugin/service/view-service', () => ({ viewService: {} }));
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

type DumpTensorState = {
  reports: PerformanceExecutionRecord[];
  sortOrder: 'asc' | 'desc';
  markedOnly: boolean;
  selectedReportKey?: string;
  compareMode: boolean;
  compareSelectedFilePaths: string[];
};

type StateHarness = {
  state: {
    hasDevtoolConfig: boolean;
    searchKeyword: string;
    npuHardwareAvailable: boolean;
    remoteNpuHardwareAvailable: boolean;
    sanitizer: {
      reports: unknown[];
      selectedReportPath?: string;
      selectedReportTitle?: string;
      selectedMessages: unknown[];
      hideDuplicates: boolean;
    };
    performance: {
      reports: PerformanceExecutionRecord[];
      selectedReportKey?: string;
    };
    dumpTensor: DumpTensorState;
  };
};

const file = (filePath: string): PerformanceRunDataFile => {
  const title = filePath.split('/')
    .pop() ?? filePath;

  return {
    key: filePath,
    title,
    filePath,
    fileType: title.split('.')
      .pop() ?? '',
  };
};

const folder = (
  title: string,
  children: PerformanceRunDataFolder['children'],
): PerformanceRunDataFolder => ({
  title,
  children,
});

const record = (
  key: string,
  timestamp: number,
  children: PerformanceExecutionRecord['children'] = [],
  marked = false,
): PerformanceExecutionRecord => ({
  key,
  title: key,
  timestamp,
  dirPath: `/data/${key}`,
  marked,
  children,
});

const newerFilePath = '/data/newer/a.bin';
const secondFilePath = '/data/newer/b.bin';

const sampleReports = (): PerformanceExecutionRecord[] => [
  record('newer', 200, [
    folder('sub', [file('/data/newer/sub/nested.bin')]),
    file(newerFilePath),
    file(secondFilePath),
  ]),
  record('older', 100, [], true),
];

const reportNodeId = (reportKey: string): string => `dump-tensor-report:${encodeURIComponent(reportKey)}`;

const folderNodeId = (reportKey: string, ...segments: string[]): string => [
  'dump-tensor-folder',
  encodeURIComponent(reportKey),
  ...segments.map((segment) => encodeURIComponent(segment)),
].join(':');

const fileNodeId = (filePath: string): string => `dump-tensor-file:${encodeURIComponent(filePath)}`;

const createProvider = (): OperateTreeProvider => {
  const provider = new OperateTreeProvider(vscode.Uri.file('/extension'));

  (provider as unknown as StateHarness).state = {
    hasDevtoolConfig: true,
    searchKeyword: '',
    npuHardwareAvailable: true,
    remoteNpuHardwareAvailable: false,
    sanitizer: {
      reports: [],
      selectedMessages: [],
      hideDuplicates: false,
    },
    performance: { reports: [] },
    dumpTensor: {
      reports: [],
      sortOrder: 'desc',
      markedOnly: false,
      compareMode: false,
      compareSelectedFilePaths: [],
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

const labelsOf = (nodes: OperateNode[]): unknown[] => nodes.map((node) => node.label);

const reportNode = (provider: OperateTreeProvider, reportKey: string): OperateNode => provider.getDumpTensorResultsPanelNodes()
  .find((node) => node.nodeId === 'dumpTensorReportItem' && node.id === reportNodeId(reportKey))!;

describe('OperateTreeProvider dump tensor results', () => {
  const executeCommandMock = vscode.commands.executeCommand as jest.MockedFunction<typeof vscode.commands.executeCommand>;
  const showErrorMessageMock = vscode.window.showErrorMessage as jest.MockedFunction<typeof vscode.window.showErrorMessage>;
  const showWarningMessageMock = vscode.window.showWarningMessage as jest.MockedFunction<typeof vscode.window.showWarningMessage>;
  const showInformationMessageMock = vscode.window.showInformationMessage as jest.MockedFunction<typeof vscode.window.showInformationMessage>;
  const clipboardWriteTextMock = vscode.env.clipboard.writeText as jest.MockedFunction<typeof vscode.env.clipboard.writeText>;
  const fsStatMock = vscode.workspace.fs.stat as jest.MockedFunction<typeof vscode.workspace.fs.stat>;
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    jest.clearAllMocks();
    executeCommandMock.mockResolvedValue(undefined);
    clipboardWriteTextMock.mockResolvedValue(undefined);
    fsStatMock.mockResolvedValue({} as never);
    mockGetDumpTensorData.mockResolvedValue({ data: sampleReports() });
    mockGetProjectType.mockResolvedValue({
      projectType: 'ascend-c',
      projectTemplateName: 'operator_template',
    });
    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: false,
      isStandardCustom: false,
      operators: [],
    });
    provider = createProvider();
    harness = provider as unknown as StateHarness;
  });

  const loadReports = async (): Promise<void> => {
    await provider.refreshDumpTensorReports();
  };

  it('starts from the initial dump tensor state', () => {
    const fresh = new OperateTreeProvider(vscode.Uri.file('/extension'));

    expect(fresh.isDumpTensorMarkedOnlyEnabled())
      .toBe(false);
    expect(fresh.isDumpTensorCompareModeEnabled())
      .toBe(false);
    expect(fresh.getDumpTensorCompareSelectedFilePaths())
      .toEqual([]);
    expect(labelsOf(fresh.getDumpTensorResultsPanelNodes()))
      .toEqual(['web.dump.noData']);
  });

  it('clears the loaded dump tensor state when the project is not a devtool project', async () => {
    await loadReports();
    harness.state.dumpTensor.markedOnly = true;
    harness.state.dumpTensor.selectedReportKey = 'newer';
    harness.state.dumpTensor.compareMode = true;
    harness.state.dumpTensor.compareSelectedFilePaths = [newerFilePath];

    await provider.refreshState(false);

    expect(harness.state.dumpTensor.reports)
      .toEqual([]);
    expect(harness.state.dumpTensor.selectedReportKey)
      .toBeUndefined();
    expect(harness.state.dumpTensor.compareMode)
      .toBe(false);
    expect(harness.state.dumpTensor.compareSelectedFilePaths)
      .toEqual([]);
    expect(harness.state.dumpTensor.markedOnly)
      .toBe(true);
  });

  it('keeps the loaded dump tensor reports for a devtool project', async () => {
    await loadReports();

    await provider.refreshState(true);

    expect(harness.state.dumpTensor.reports.map((item) => item.key))
      .toEqual([
        'newer',
        'older',
      ]);
  });

  it('sorts reports by the current sort order and rebuilds the report rows on toggle', async () => {
    await loadReports();

    expect(labelsOf(provider.getDumpTensorResultsPanelNodes()))
      .toEqual([
        'newer',
        'older',
      ]);

    const firstNewerNode = reportNode(provider, 'newer');

    expect(reportNode(provider, 'newer'))
      .toBe(firstNewerNode);

    provider.toggleDumpTensorSortOrder();

    expect(harness.state.dumpTensor.sortOrder)
      .toBe('asc');
    expect(labelsOf(provider.getDumpTensorResultsPanelNodes()))
      .toEqual([
        'older',
        'newer',
      ]);
    expect(reportNode(provider, 'newer'))
      .not
      .toBe(firstNewerNode);
  });

  it('hides unmarked reports while the marked-only filter is on', async () => {
    await loadReports();
    provider.setDumpTensorMarkedOnly(true);

    expect(provider.isDumpTensorMarkedOnlyEnabled())
      .toBe(true);
    expect(labelsOf(provider.getDumpTensorResultsPanelNodes()))
      .toEqual(['older']);
  });

  it('notifies only the dump tensor view when the sort order or the filter changes', () => {
    const dumpTensorEmitter = (provider as unknown as { onDidChangeDumpTensorTreeDataEmitter: { fire: jest.Mock } }).onDidChangeDumpTensorTreeDataEmitter;
    const flowTreeEmitter = (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter;

    provider.toggleDumpTensorSortOrder();
    provider.setDumpTensorMarkedOnly(true);

    expect(dumpTensorEmitter.fire)
      .toHaveBeenCalledTimes(2);
    expect(flowTreeEmitter.fire)
      .not
      .toHaveBeenCalled();
  });

  it('builds report rows with mark context, timestamp description and encoded ids', async () => {
    await loadReports();

    const unmarkedNode = reportNode(provider, 'newer');
    const markedNode = reportNode(provider, 'older');

    expect(unmarkedNode.contextValue)
      .toBe(treeItemContextKey('dumpTensorReportItem.unmarked'));
    expect(unmarkedNode.description)
      .toBe(new Date(200)
        .toLocaleString());
    expect(unmarkedNode.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(unmarkedNode.iconPath)
      .toBeUndefined();
    expect(markedNode.contextValue)
      .toBe(treeItemContextKey('dumpTensorReportItem.marked'));
    expect((markedNode.iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-flag-filled');
  });

  it('builds folder and file rows with encoded ids and the open command', async () => {
    await loadReports();

    const children = provider.getChildren(reportNode(provider, 'newer')) as OperateNode[];
    const [
      folderNode,
      firstFileNode,
    ] = children;

    expect(labelsOf(children))
      .toEqual([
        'sub',
        'a.bin',
        'b.bin',
      ]);
    expect(folderNode.id)
      .toBe(folderNodeId('newer', '0'));
    expect(folderNode.contextValue)
      .toBe(treeItemContextKey('dumpTensorFolder'));
    expect(folderNode.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(firstFileNode.id)
      .toBe(fileNodeId(newerFilePath));
    expect(firstFileNode.contextValue)
      .toBe(treeItemContextKey('dumpTensorFile.bin'));
    expect(firstFileNode.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.None);
    expect(firstFileNode.command)
      .toEqual({
        command: stableCommandId(COMMAND_SIDEBAR_DUMP_TENSOR_FILE_OPEN, `${newerFilePath}\nbin`),
        title: 'a.bin',
      });

    const nestedFiles = provider.getChildren(folderNode) as OperateNode[];

    expect(nestedFiles.map((node) => node.id))
      .toEqual([fileNodeId('/data/newer/sub/nested.bin')]);
  });

  it('returns an empty child list for nodes that do not route to a folder or report', async () => {
    await loadReports();

    expect(provider.getChildren({
      nodeId: 'dumpTensorReportItem',
      id: 'not-a-report-node',
    } as unknown as OperateNode))
      .toEqual([]);
    expect(provider.getChildren({
      nodeId: 'dumpTensorFile',
      id: fileNodeId(newerFilePath),
    } as unknown as OperateNode))
      .toEqual([]);
  });

  it('returns no children for a report that is no longer loaded', async () => {
    await loadReports();

    expect(provider.getChildren({
      nodeId: 'dumpTensorReportItem',
      id: reportNodeId('removed'),
    } as unknown as OperateNode))
      .toEqual([]);
    expect(provider.getChildren({
      nodeId: 'dumpTensorFolder',
      id: folderNodeId('removed', '0'),
    } as unknown as OperateNode))
      .toEqual([]);
  });

  it('returns no children for a folder path that does not resolve to a folder', async () => {
    await loadReports();

    expect(provider.getChildren({
      nodeId: 'dumpTensorFolder',
      id: folderNodeId('newer', '9'),
    } as unknown as OperateNode))
      .toEqual([]);
    expect(provider.getChildren({
      nodeId: 'dumpTensorFolder',
      id: folderNodeId('newer', '1', '0'),
    } as unknown as OperateNode))
      .toEqual([]);
  });

  it('reports root report rows as having no tree parent for reveal support', async () => {
    await loadReports();

    const report = provider.getDumpTensorResultsPanelNodes()[0];

    expect(provider.getDumpTensorTreeParent(report))
      .toBeNull();
    expect(provider.getDumpTensorTreeParent({
      nodeId: 'dumpTensorFile',
      id: fileNodeId(newerFilePath),
    } as unknown as OperateNode))
      .toBeUndefined();
  });

  it('keeps the newest requested snapshot when an older refresh resolves last', async () => {
    const older = deferred<{ data: PerformanceExecutionRecord[] }>();

    mockGetDumpTensorData
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ data: [record('newer', 2)] });

    const olderRefresh = provider.refreshDumpTensorReports();
    const newerRefresh = provider.refreshDumpTensorReports();

    await newerRefresh;
    older.resolve({ data: [record('older', 1)] });
    await olderRefresh;

    expect(provider.getDumpTensorReportByKey('newer'))
      .toBeDefined();
    expect(provider.getDumpTensorReportByKey('older'))
      .toBeUndefined();
  });

  it('keeps the last valid report list when the scan fails', async () => {
    const scanError = new Error('scan unavailable');
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await loadReports();
    harness.state.dumpTensor.selectedReportKey = 'newer';
    mockGetDumpTensorData.mockRejectedValueOnce(scanError);

    await provider.refreshDumpTensorReports();

    expect(provider.getDumpTensorReportByKey('newer'))
      .toBeDefined();
    expect(harness.state.dumpTensor.selectedReportKey)
      .toBe('newer');
    expect(consoleError)
      .toHaveBeenCalledWith('Failed to load dump tensor reports:', scanError);
    consoleError.mockRestore();
  });

  it('reveals and expands a newly added report when focusIfNew is set', async () => {
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setDumpTensorResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    mockGetDumpTensorData.mockResolvedValueOnce({ data: [record('baseline', 1)] });
    await loadReports();

    mockGetDumpTensorData.mockResolvedValueOnce({
      data: [
        record('baseline', 1),
        record('fresh', 2),
      ],
    });
    await provider.refreshDumpTensorReports({ focusIfNew: true });

    expect(executeCommandMock)
      .toHaveBeenCalledWith(`${DUMP_TENSOR_SIDEBAR_VIEW_ID}.focus`);
    expect(reveal)
      .toHaveBeenCalledTimes(1);
    const [
      revealedNode,
      revealOptions,
    ] = reveal.mock.calls[0];

    expect(revealedNode.id)
      .toBe(reportNodeId('fresh'));
    expect(revealedNode.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Expanded);
    expect(revealOptions)
      .toEqual({
        select: true,
        focus: true,
        expand: true,
      });
    expect(harness.state.dumpTensor.selectedReportKey)
      .toBe('fresh');
  });

  it('does not reveal a batch of reports discovered by the first scan', async () => {
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setDumpTensorResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    mockGetDumpTensorData.mockResolvedValueOnce({
      data: [
        record('first', 1),
        record('second', 2),
      ],
    });

    await provider.refreshDumpTensorReports({ focusIfNew: true });

    expect(reveal)
      .not
      .toHaveBeenCalled();
    expect(executeCommandMock)
      .not
      .toHaveBeenCalled();
  });

  it('does not reveal an old report after a newer refresh started', async () => {
    const delayedFocus = deferred<unknown>();
    const reveal = jest.fn()
      .mockResolvedValue(undefined);

    provider.setDumpTensorResultsTreeView({ reveal } as unknown as vscode.TreeView<OperateNode>);
    executeCommandMock.mockImplementation(async (command) => {
      if (command === `${DUMP_TENSOR_SIDEBAR_VIEW_ID}.focus`) {
        await delayedFocus.promise;
      }

      return undefined;
    });
    mockGetDumpTensorData
      .mockResolvedValueOnce({ data: [record('baseline', 1)] })
      .mockResolvedValueOnce({
        data: [
          record('baseline', 1),
          record('fresh', 2),
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    await loadReports();

    const staleRefresh = provider.refreshDumpTensorReports({ focusIfNew: true });

    await waitFor(() => executeCommandMock.mock.calls.some(([command]) => (
      command === `${DUMP_TENSOR_SIDEBAR_VIEW_ID}.focus`
    )));
    await provider.refreshDumpTensorReports();
    delayedFocus.resolve(undefined);
    await staleRefresh;

    expect(reveal)
      .not
      .toHaveBeenCalled();
    expect(provider.getDumpTensorReportByKey('fresh'))
      .toBeUndefined();
    expect(harness.state.dumpTensor.selectedReportKey)
      .toBeUndefined();
  });

  it('marks a report optimistically and persists the new state', async () => {
    await loadReports();

    await provider.toggleDumpTensorReportMark('newer');

    expect(mockToggleRecordMark)
      .toHaveBeenCalledWith({
        key: 'newer',
        marked: true,
      });
    const markedNode = reportNode(provider, 'newer');

    expect(provider.getDumpTensorReportByKey('newer')?.marked)
      .toBe(true);
    expect(markedNode.contextValue)
      .toBe(treeItemContextKey('dumpTensorReportItem.marked'));
    expect((markedNode.iconPath as vscode.ThemeIcon).id)
      .toBe('opdevtools-flag-filled');
  });

  it('unmarks an already marked report and persists the new state', async () => {
    await loadReports();

    await provider.toggleDumpTensorReportMark('older');

    expect(mockToggleRecordMark)
      .toHaveBeenCalledWith({
        key: 'older',
        marked: false,
      });
    expect(provider.getDumpTensorReportByKey('older')?.marked)
      .toBe(false);
  });

  it('reverts the optimistic mark and warns the user when persistence fails', async () => {
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await loadReports();
    mockToggleRecordMark.mockImplementationOnce(() => {
      throw new Error('disk');
    });

    await provider.toggleDumpTensorReportMark('newer');

    expect(provider.getDumpTensorReportByKey('newer')?.marked)
      .toBe(false);
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('web.dump.markFailed');
    expect(consoleError)
      .toHaveBeenCalledWith('Failed to toggle dump tensor mark:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('ignores a mark request for a report that is not loaded', async () => {
    await loadReports();

    await provider.toggleDumpTensorReportMark('removed');

    expect(mockToggleRecordMark)
      .not
      .toHaveBeenCalled();
  });

  it('preselects one file and enables compare mode on begin', async () => {
    await loadReports();

    provider.beginDumpTensorCompareWithFile(newerFilePath);

    expect(provider.isDumpTensorCompareModeEnabled())
      .toBe(true);
    expect(provider.getDumpTensorCompareSelectedFilePaths())
      .toEqual([newerFilePath]);
  });

  it('shows the selection position of each compared file', async () => {
    await loadReports();
    provider.beginDumpTensorCompareWithFile(newerFilePath);

    await provider.openDumpTensorFile(secondFilePath, 'bin');

    expect(provider.getDumpTensorCompareSelectedFilePaths())
      .toEqual([
        newerFilePath,
        secondFilePath,
      ]);

    const comparedNodes = provider.getChildren(reportNode(provider, 'newer')) as OperateNode[];

    expect(comparedNodes.find((node) => node.id === fileNodeId(newerFilePath))?.description)
      .toBe('(1/2)');
    expect(comparedNodes.find((node) => node.id === fileNodeId(secondFilePath))?.description)
      .toBe('(2/2)');
  });

  it('diffs the txt companions and leaves compare mode after starting a compare', async () => {
    await loadReports();
    provider.beginDumpTensorCompareWithFile(newerFilePath);
    await provider.openDumpTensorFile(secondFilePath, 'bin');
    mockDiffFiles.mockResolvedValue(undefined);

    await provider.startDumpTensorCompare();

    expect(mockDiffFiles)
      .toHaveBeenCalledWith({
        filePath1: '/data/newer/a.txt',
        filePath2: '/data/newer/b.txt',
      });
    expect(provider.isDumpTensorCompareModeEnabled())
      .toBe(false);
    expect(provider.getDumpTensorCompareSelectedFilePaths())
      .toEqual([]);
  });

  it('warns with the two-file limit when a third file is selected', async () => {
    await loadReports();
    provider.setDumpTensorCompareMode(true);

    await provider.openDumpTensorFile(newerFilePath, 'bin');
    await provider.openDumpTensorFile(secondFilePath, 'bin');
    await provider.openDumpTensorFile('/data/newer/c.bin', 'bin');

    expect(showWarningMessageMock)
      .toHaveBeenCalledWith('web.dump.maxSelectCount');
    expect(mockTranslateOptions)
      .toHaveBeenCalledWith({ count: 2 });
    expect(provider.getDumpTensorCompareSelectedFilePaths())
      .toEqual([
        newerFilePath,
        secondFilePath,
      ]);
  });

  it('warns and stays in compare mode when fewer than two files are selected', async () => {
    await loadReports();
    provider.beginDumpTensorCompareWithFile(newerFilePath);

    await provider.startDumpTensorCompare();

    expect(showWarningMessageMock)
      .toHaveBeenCalledWith('web.dump.selectTwoFiles');
    expect(mockDiffFiles)
      .not
      .toHaveBeenCalled();
    expect(provider.isDumpTensorCompareModeEnabled())
      .toBe(true);
  });

  it('leaves compare mode even when the diff fails', async () => {
    await loadReports();
    provider.beginDumpTensorCompareWithFile(newerFilePath);
    await provider.openDumpTensorFile(secondFilePath, 'bin');
    mockDiffFiles.mockRejectedValueOnce(new Error('no diff provider'));

    await expect(provider.startDumpTensorCompare())
      .rejects
      .toThrow('no diff provider');
    expect(provider.isDumpTensorCompareModeEnabled())
      .toBe(false);
  });

  it('deselects a compared file when it is picked again', async () => {
    await loadReports();
    provider.beginDumpTensorCompareWithFile(newerFilePath);

    await provider.openDumpTensorFile(newerFilePath, 'bin');

    expect(provider.getDumpTensorCompareSelectedFilePaths())
      .toEqual([]);
  });

  it('copy path writes the report directory to the clipboard and confirms', async () => {
    await loadReports();

    await provider.copyDumpTensorReportPath('older');

    expect(clipboardWriteTextMock)
      .toHaveBeenCalledWith('/data/older');
    expect(showInformationMessageMock)
      .toHaveBeenCalledWith('web.perf.pathCopied');
  });

  it('copy path does nothing for a report that is not loaded', async () => {
    await loadReports();

    await provider.copyDumpTensorReportPath('removed');

    expect(clipboardWriteTextMock)
      .not
      .toHaveBeenCalled();
  });

  it('download delegates the report directory to the dump tensor methods', async () => {
    await loadReports();
    mockDownloadReport.mockResolvedValue(undefined);

    await provider.downloadDumpTensorReport('older');

    expect(mockDownloadReport)
      .toHaveBeenCalledWith({ dirPath: '/data/older' });
  });

  it('download swallows a failed report download', async () => {
    const consoleError = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await loadReports();
    mockDownloadReport.mockRejectedValueOnce(new Error('disk full'));

    await expect(provider.downloadDumpTensorReport('older'))
      .resolves
      .toBeUndefined();
    expect(consoleError)
      .toHaveBeenCalledWith('Failed to download dump tensor report:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('download does nothing for a report that is not loaded', async () => {
    await loadReports();

    await provider.downloadDumpTensorReport('removed');

    expect(mockDownloadReport)
      .not
      .toHaveBeenCalled();
  });

  it('opens the companion txt file when not comparing', async () => {
    await loadReports();

    await provider.openDumpTensorFile(newerFilePath, 'bin');

    expect(fsStatMock)
      .toHaveBeenCalledWith({ fsPath: '/data/newer/a.txt' });
    expect(executeCommandMock)
      .toHaveBeenCalledWith(
        'vscode.open',
        { fsPath: '/data/newer/a.txt' },
      );
  });

  it('opens non-bin files without rewriting their path', async () => {
    await loadReports();

    await provider.openDumpTensorFile('/data/newer/notes.txt', 'txt');

    expect(executeCommandMock)
      .toHaveBeenCalledWith(
        'vscode.open',
        { fsPath: '/data/newer/notes.txt' },
      );
  });

  it('warns when the companion txt file is missing', async () => {
    await loadReports();
    fsStatMock.mockRejectedValueOnce(new Error('missing'));

    await provider.openDumpTensorFile(newerFilePath, 'bin');

    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('web.dump.txtCompanionMissing');
    expect(mockTranslateOptions)
      .toHaveBeenCalledWith({ path: '/data/newer/a.txt' });
    expect(executeCommandMock)
      .not
      .toHaveBeenCalled();
  });
});
