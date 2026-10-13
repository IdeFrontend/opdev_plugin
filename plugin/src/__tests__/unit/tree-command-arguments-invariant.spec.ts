/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Regression guard for the rapid-click bug on the operator selection tree.
 *
 * A `TreeItem` whose command carries `arguments` is converted by VS Code into a
 * synthetic `<command> /NN` id cached in the TREE NODE's disposable store. Every
 * tree refresh disposes the node, deletes that cache entry, and a click that was
 * already in flight then fails with
 *   "command '<command> /NN' not found".
 *
 * Row identity therefore lives in the command id (one command per row, see
 * `stableCommandId`), which means two invariants must hold for EVERY row of
 * every tree this extension renders:
 *
 *   1. `item.command.arguments` is undefined;
 *   2. the id a row points at is actually registered.
 */
import { createHash } from 'crypto';

const mockLoadSanitizerPanelData = jest.fn();

const registeredCommands = new Map<string, (...args: unknown[])=> unknown>();
const disposedCommands: string[] = [];

const mockRegisterCommand = jest.fn((
  id: string,
  handler: (...args: unknown[])=> unknown,
) => {
  registeredCommands.set(id, handler);

  return {
    dispose: jest.fn(() => {
      disposedCommands.push(id);
      registeredCommands.delete(id);
    }),
  };
});

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => {
  class EventEmitter<T> {
    readonly event = jest.fn();
    readonly fire = jest.fn((_value?: T) => undefined);
    readonly dispose = jest.fn();
  }

  class TreeItem {
    id?: string;
    command?: {
      command: string;
      title: string;
      arguments?: unknown[];
    };

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
      registerCommand: (id: string, handler: (...args: unknown[])=> unknown) => mockRegisterCommand(id, handler),
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
      showWarningMessage: jest.fn(async () => undefined),
      showTextDocument: jest.fn()
        .mockResolvedValue(undefined),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/ws' } }],
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
      openTextDocument: jest.fn()
        .mockResolvedValue({}),
    },
  };
});

jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: { setSelectedOperators: jest.fn(async () => undefined) } }));
jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: {} }));
jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({
  OperatorPluginRegistry: {
    getBuildBehaviorByProjectType: () => ({
      requiresBuildBeforeAnalysis: true,
      supportsSanitizer: true,
      supportsOnBoard: true,
      supportsSimulate: true,
      supportsCpuDebug: true,
      supportsNpuDebug: true,
    }),
    isProjectTypeSupported: () => true,
  },
}));
jest.mock('@plugin/controller/performance-controller', () => ({ performanceDataMethods: { jumpToFile: jest.fn(async () => undefined) } }));
jest.mock('@plugin/controller/performance-data-controller', () => ({ performanceMethods: {} }));
jest.mock('@plugin/service/view-service', () => ({ viewService: {} }));
jest.mock('@plugin/helpers/environment-script-guard', () => ({ ensureEnvironmentScriptForOperateAction: jest.fn() }));
jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));
jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: { loadSanitizerPanelData: (...args: unknown[]) => mockLoadSanitizerPanelData(...args) } }));
jest.mock('@plugin/service/run-data-service', () => ({ runDataService: {} }));
jest.mock('@plugin/helpers/st-test-action', () => ({
  getStTestSelectionState: jest.fn(() => 'none'),
  shouldShowStTestAction: jest.fn(() => false),
}));

import * as vscode from 'vscode';
import type { PerformanceExecutionRecord } from '@shared/api-types';

import {
  OperateNode, OperateTreeProvider,
} from '@plugin/class/operate-tree-provider';
import { StTestRunHistoryTreeProvider } from '@plugin/class/st-test-run-history-tree-provider';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import { stableCommandId } from '@plugin/domain/utils/command-utils';
import {
  COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
  COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP,
  COMMAND_SIDEBAR_TOGGLE_OPERATOR,
  COMMAND_ST_TEST_HISTORY_OPEN,
} from '../../constants';

/**
 * Command families whose ids are minted per row: `<prefix>.<hash of the row key>`.
 * Rows of the other families point at ids registered once by `extension.ts`.
 */
const ROW_COMMAND_PREFIXES: string[] = [
  COMMAND_SIDEBAR_TOGGLE_OPERATOR,
  COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN,
  COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP,
  COMMAND_ST_TEST_HISTORY_OPEN,
];

type OperatorRecord = {
  id: number;
  name: string;
  path: string;
  hasEx: boolean;
  isCompiled: boolean;
};

type SanitizerMessage = {
  title: string;
  type: 'error' | 'warning';
  questionType: string;
  question: string;
  fileLink?: string;
  row?: number;
  col?: number;
  originData: string;
};

type StateHarness = {
  state: {
    hasDevtoolConfig: boolean;
    debugModeEnabled: boolean;
    npuHardwareAvailable: boolean;
    remoteNpuHardwareAvailable: boolean;
    hasMultipleOperators: boolean;
    isStandardCustom: boolean;
    supportsSanitizerAndTuning: boolean;
    operators: OperatorRecord[];
    searchKeyword: string;
    selectedOperatorIds: number[];
    projectType: string;
    projectTemplateName: string;
    sanitizer: {
      reports: Array<{ title: string;
        timestamp: number;
        id: string;
        path: string;
        marked: boolean }>;
      sortOrder: 'asc' | 'desc';
      markedOnly: boolean;
      selectedReportPath?: string;
      selectedReportTitle?: string;
      selectedMessages: SanitizerMessage[];
      resultsGroupBy: 'class' | 'severity' | 'type' | 'file';
      hideDuplicates: boolean;
      reportRevision: number;
      manualReports: unknown[];
    };
    performance: {
      reports: PerformanceExecutionRecord[];
      sortOrder: 'asc' | 'desc';
      markedOnly: boolean;
      selectedReportKey?: string;
    };
  };
};

const createState = (): StateHarness['state'] => ({
  hasDevtoolConfig: true,
  debugModeEnabled: true,
  npuHardwareAvailable: true,
  remoteNpuHardwareAvailable: false,
  hasMultipleOperators: true,
  isStandardCustom: true,
  supportsSanitizerAndTuning: true,
  operators: [],
  searchKeyword: '',
  selectedOperatorIds: [],
  projectType: 'ascend-c',
  projectTemplateName: 'operator_template',
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

const createProvider = (kind: 'flow' | 'operatorProjects' = 'operatorProjects'): OperateTreeProvider => {
  const provider = new OperateTreeProvider(vscode.Uri.file('/extension'), kind);

  (provider as unknown as StateHarness).state = createState();

  return provider;
};

const operator = (id: number, name: string, path: string, options: Partial<OperatorRecord> = {}): OperatorRecord => ({
  id,
  name,
  path,
  hasEx: false,
  isCompiled: true,
  ...options,
});

/** Every row of `provider`, depth-first, resolving `getChildren` for each node. */
const collectRows = async <T>(
  provider: {
    getChildren: (element?: T)=> vscode.ProviderResult<T[]>;
  },
  roots: T[],
): Promise<T[]> => {
  const rows: T[] = [];

  const visit = async (nodes: T[]): Promise<void> => {
    for (const node of nodes) {
      rows.push(node);

      const children = await provider.getChildren(node);

      if (children && children.length > 0) {
        await visit(children as T[]);
      }
    }
  };

  await visit(roots);

  return rows;
};

type WalkedRow = vscode.TreeItem & {
  nodeId?: string;
};

/** The regression itself, asserted for every row of every tree. */
const expectNoArguments = (rows: WalkedRow[]): void => {
  expect(rows.length)
    .toBeGreaterThan(0);

  let rowsWithCommand = 0;

  for (const row of rows) {
    // A row command carrying `arguments` gets a synthetic `/NN` id cached in
    // the tree node's disposable store and dies on the next refresh.
    expect(row.command?.arguments)
      .toBeUndefined();

    if (!row.command) {
      continue;
    }

    rowsWithCommand += 1;
    // Synthetic argument ids are `<command> /<index>`; nothing here may take
    // that shape.
    expect(row.command.command)
      .not.toContain(' ');
  }

  // Guards against the walk silently degrading into "nothing to check".
  expect(rowsWithCommand)
    .toBeGreaterThan(0);
};

/**
 * Rows of a per-row command family must point at an id the provider registered
 * before rendering the row: the id is the row identity, there is no fallback.
 */
const expectRowCommandsRegistered = (rows: WalkedRow[]): void => {
  let dynamicRows = 0;

  for (const row of rows) {
    if (!row.command || !ROW_COMMAND_PREFIXES.some((prefix) => row.command?.command.startsWith(prefix))) {
      continue;
    }

    expect(registeredCommands.has(row.command.command))
      .toBe(true);
    dynamicRows += 1;
  }

  expect(dynamicRows)
    .toBeGreaterThan(0);
};

describe('tree row commands never carry arguments', () => {
  beforeEach(() => {
    registeredCommands.clear();
    disposedCommands.length = 0;
    mockRegisterCommand.mockClear();
    mockLoadSanitizerPanelData.mockReset();
  });

  it('renders every row of the flow tree without argument commands', async () => {
    const provider = createProvider('flow');
    const harness = provider as unknown as StateHarness;

    harness.state.operators = [
      operator(1, 'alpha', '/ws/alpha'),
      operator(2, 'beta', '/ws/beta'),
    ];
    harness.state.selectedOperatorIds = [2];

    const rows = await collectRows<OperateNode>(provider, provider.getChildren() as OperateNode[]);

    expectNoArguments(rows as WalkedRow[]);
    expect(rows.map((row) => row.nodeId))
      .toContain('run');
  });

  it('renders every row of the operator projects tree without argument commands', async () => {
    const provider = createProvider('operatorProjects');
    const harness = provider as unknown as StateHarness;

    harness.state.operators = [
      operator(1, 'alpha', '/ws/alpha'),
      operator(2, 'beta', '/ws/beta'),
    ];
    harness.state.selectedOperatorIds = [2];

    const rows = await collectRows<OperateNode>(provider, provider.getChildren() as OperateNode[]);

    expectNoArguments(rows as WalkedRow[]);
    expectRowCommandsRegistered(rows as WalkedRow[]);
    expect(rows.map((row) => row.id))
      .toEqual(expect.arrayContaining([
        'operator-projects-selected',
        'selected-operator-2',
        'operator-1',
        'operator-2',
      ]));
  });

  it('renders selected-operator children without argument commands', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.operators = [
      operator(1, 'alpha', '/ws/alpha'),
      operator(2, 'beta', '/ws/beta'),
    ];
    harness.state.selectedOperatorIds = [
      1,
      2,
    ];

    const header = (provider.getChildren() as OperateNode[])
      .find((node) => node.nodeId === 'selectedOperators') as OperateNode;
    const rows = await collectRows<OperateNode>(provider, [header]);

    expectNoArguments(rows as WalkedRow[]);
    expectRowCommandsRegistered(rows as WalkedRow[]);
    expect(rows.map((row) => row.id))
      .toEqual([
        'operator-projects-selected',
        'selected-operator-1',
        'selected-operator-2',
      ]);
  });

  it('bakes the operator path into the toggle command id', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.operators = [operator(7, 'alpha', '/ws/alpha')];
    harness.state.selectedOperatorIds = [7];

    const rows = provider.getChildren() as OperateNode[];
    const operatorRow = rows.find((row) => row.nodeId === 'operatorItem') as OperateNode;
    const expectedHash = createHash('sha256')
      .update(normalizeProjectPath('/ws/alpha'))
      .digest('hex')
      .slice(0, 16);

    expect(operatorRow.command?.command)
      .toBe(`${COMMAND_SIDEBAR_TOGGLE_OPERATOR}.${expectedHash}`);
    expect(operatorRow.command?.command)
      .toMatch(new RegExp(`^${COMMAND_SIDEBAR_TOGGLE_OPERATOR.replace(/\./gu, '\\.')}\\.`));
    expect(operatorRow.command?.command)
      .toMatch(new RegExp(`${expectedHash}$`));
    expect(operatorRow.command?.command)
      .toBe(stableCommandId(COMMAND_SIDEBAR_TOGGLE_OPERATOR, normalizeProjectPath('/ws/alpha')));
  });

  it('keeps a disabled operator row without a command at all', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    // An ex operator selected first disables every non-ex row.
    harness.state.operators = [
      operator(1, 'ex-op', '/ws/ex', { hasEx: true }),
      operator(2, 'plain', '/ws/plain'),
    ];
    harness.state.selectedOperatorIds = [1];

    const disabledRow = (provider.getChildren() as OperateNode[])
      .find((row) => row.nodeId === 'operatorItem' && row.label === 'plain') as OperateNode;

    expect(disabledRow.command)
      .toBeUndefined();
  });

  it('renders performance file rows without argument commands', async () => {
    const provider = createProvider('flow');
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [
      {
        key: 'r1',
        title: 'r1',
        timestamp: 1,
        dirPath: '/reports/r1',
        children: [
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
        ],
      },
    ];

    const rows = await collectRows<OperateNode>(provider, provider.getPerformanceResultsPanelNodes());

    expectNoArguments(rows as WalkedRow[]);
    expectRowCommandsRegistered(rows as WalkedRow[]);
    expect(provider.getPerformanceResultsPanelNodes()
      .length)
      .toBe(1);
  });

  it('bakes the file path into the performance file command id', () => {
    const provider = createProvider('flow');
    const harness = provider as unknown as StateHarness;

    harness.state.performance.reports = [
      {
        key: 'r1',
        title: 'r1',
        timestamp: 1,
        dirPath: '/reports/r1',
        children: [
          {
            key: '/reports/r1/b.bin',
            title: 'b.bin',
            filePath: '/reports/r1/b.bin',
            fileType: 'bin',
          },
        ],
      },
    ];

    const fileRow = (provider.getChildren(provider.getPerformanceResultsPanelNodes()[0]) as OperateNode[])[0];

    expect(fileRow.command?.command)
      .toBe(stableCommandId(COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN, '/reports/r1/b.bin\nbin'));
    expect(fileRow.command?.arguments)
      .toBeUndefined();
  });

  it('renders sanitizer message rows without argument commands', async () => {
    const provider = createProvider('flow');
    const harness = provider as unknown as StateHarness;
    const messages: SanitizerMessage[] = [
      {
        title: 'illegal read of size 4',
        type: 'error',
        questionType: 'memory',
        question: 'illegal read of size',
        fileLink: '/ws/src/a.cpp',
        row: 10,
        col: 5,
        originData: '==42== ERROR: illegal read of size 4',
      },
      {
        title: 'no location',
        type: 'warning',
        questionType: 'memory',
        question: 'illegal read of size',
        originData: '==42== WARNING',
      },
    ];

    harness.state.sanitizer.reports = [
      {
        title: 'r.log',
        timestamp: 1,
        id: 'sanitizer_r',
        path: '/reports/r.log',
        marked: false,
      },
    ];
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    mockLoadSanitizerPanelData.mockReturnValue({ data: messages });

    const rows = await collectRows<OperateNode>(provider, [provider.getSanitizerReportsPanelNodes()[0]]);

    expectNoArguments(rows as WalkedRow[]);
    expectRowCommandsRegistered(rows as WalkedRow[]);
  });

  it('bakes the message index into the sanitizer jump command id', async () => {
    const provider = createProvider('flow');
    const harness = provider as unknown as StateHarness;

    harness.state.sanitizer.reports = [
      {
        title: 'r.log',
        timestamp: 1,
        id: 'sanitizer_r',
        path: '/reports/r.log',
        marked: false,
      },
    ];
    harness.state.sanitizer.selectedReportPath = '/reports/r.log';
    mockLoadSanitizerPanelData.mockReturnValue({
      data: [
        {
          title: 'illegal read of size 4',
          type: 'error',
          questionType: 'memory',
          question: 'illegal read of size',
          fileLink: '/ws/src/a.cpp',
          row: 10,
          col: 5,
          originData: '==42== ERROR: illegal read of size 4',
        },
      ],
    });

    const reportNode = provider.getSanitizerReportsPanelNodes()[0];
    const groups = await provider.getChildren(reportNode) as OperateNode[];
    const messageRows = await provider.getChildren(groups[0]) as OperateNode[];

    expect(messageRows[0].command?.command)
      .toBe(stableCommandId(COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP, '0'));
    expect(messageRows[0].command?.arguments)
      .toBeUndefined();
  });

  it('renders st test history rows without argument commands', async () => {
    const workspaceRoot = '/ws';
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceRoot,
          name: 'ws',
        },
      ],
      loadWorkspaceHistory: () => [
        {
          workspaceRoot,
          record: {
            runId: 'run-1',
            runDirectory: '/ws/out/run-1',
            operatorName: 'add',
            completedAt: '2026-07-21T10:00:00.000Z',
            outcome: 'passed',
            summary: {
              total: 2,
              failed: 0,
              invalid: 0,
            },
            artifacts: [],
            display: {},
          },
        },
      ],
      openRecord: jest.fn(async () => undefined),
    });

    provider.refresh();

    const rows = provider.getChildren() as Array<vscode.TreeItem & { recordKey: string }>;

    expectNoArguments(rows as WalkedRow[]);
    expectRowCommandsRegistered(rows as WalkedRow[]);
    expect(rows[0].command?.command)
      .toBe(stableCommandId(COMMAND_ST_TEST_HISTORY_OPEN, rows[0].recordKey));
  });

  it('resolves the st test history record from the command id and no-ops when it is gone', async () => {
    const workspaceRoot = '/ws';
    const openRecord = jest.fn(async () => undefined);
    const entry = {
      workspaceRoot,
      record: {
        runId: 'run-1',
        runDirectory: '/ws/out/run-1',
        operatorName: 'add',
        completedAt: '2026-07-21T10:00:00.000Z',
        outcome: 'passed' as const,
        summary: {
          total: 2,
          failed: 0,
          invalid: 0,
        },
        artifacts: [],
        display: {},
      },
    };
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceRoot,
          name: 'ws',
        },
      ],
      loadWorkspaceHistory: () => [entry],
      openRecord,
    });

    provider.refresh();
    const row = (provider.getChildren() as Array<vscode.TreeItem & { recordKey: string }>)[0];
    const handler = registeredCommands.get(row.command?.command as string);

    expect(handler)
      .toBeDefined();

    await handler?.();
    expect(openRecord)
      .toHaveBeenCalledWith(entry);

    // The record left the history: the same command must stay silent.
    provider.clear();
    await handler?.();
    expect(openRecord)
      .toHaveBeenCalledTimes(1);
  });

  it('reuses the same command id and registration across refreshes', () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.operators = [
      operator(1, 'alpha', '/ws/alpha'),
      operator(2, 'beta', '/ws/beta'),
    ];

    const firstIds = (provider.getChildren() as OperateNode[])
      .map((row) => row.command?.command);
    const registrationsAfterFirstRender = mockRegisterCommand.mock.calls.length;

    const secondIds = (provider.getChildren() as OperateNode[])
      .map((row) => row.command?.command);

    expect(secondIds)
      .toEqual(firstIds);
    expect(mockRegisterCommand.mock.calls.length)
      .toBe(registrationsAfterFirstRender);
    expect(mockRegisterCommand.mock.calls.map((call) => call[0]))
      .toEqual(firstIds);
  });

  it('disposes the toggle command of an operator that left the list', async () => {
    const provider = createProvider();
    const harness = provider as unknown as StateHarness;

    harness.state.operators = [operator(1, 'alpha', '/ws/alpha')];
    const staleCommandId = (provider.getChildren() as OperateNode[])
      .find((row) => row.nodeId === 'operatorItem')?.command?.command as string;

    expect(registeredCommands.has(staleCommandId))
      .toBe(true);

    harness.state.operators = [operator(2, 'beta', '/ws/beta')];
    provider.registerOperatorToggleCommands(async () => undefined);

    expect(disposedCommands)
      .toContain(staleCommandId);
    expect(registeredCommands.has(staleCommandId))
      .toBe(false);

    const row = (provider.getChildren() as OperateNode[])
      .find((node) => node.nodeId === 'operatorItem') as OperateNode;

    expect(registeredCommands.has(row.command?.command as string))
      .toBe(true);
  });
});
