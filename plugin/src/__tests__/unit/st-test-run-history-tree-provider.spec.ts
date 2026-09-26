const mockWorkspaceFolders: Array<{
  name: string;
  uri: { fsPath: string };
}> = [];

jest.mock('i18next', () => ({
  t: (key: string, values?: Record<string, number>) => {
    if (key === 'stTest.results.historySummary') {
      return `${values?.total} total - ${values?.failed} failed - ${values?.invalid} invalid`;
    }

    return key;
  },
}));

jest.mock('vscode', () => {
  class EventEmitter<T> {
    public readonly event = jest.fn();

    public fire = jest.fn((_value?: T) => undefined);

    public dispose = jest.fn();
  }

  class TreeItem {
    public id?: string;
    public description?: string;
    public tooltip?: string;
    public iconPath?: unknown;
    public contextValue?: string;
    public command?: {
      command: string;
      title: string;
      arguments?: unknown[];
    };

    constructor(
      public label: string,
      public collapsibleState: number,
    ) {}
  }

  class ThemeIcon {
    constructor(public id: string) {}
  }

  return {
    env: { language: 'en' },
    workspace: { workspaceFolders: mockWorkspaceFolders },
    commands: {
      registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
      executeCommand: jest.fn()
        .mockResolvedValue(undefined),
    },
    EventEmitter,
    TreeItem,
    ThemeIcon,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
  };
}, { virtual: true });

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { COMMAND_ST_TEST_HISTORY_OPEN } from '@plugin/constants';
import { StTestRunHistoryTreeProvider } from '@plugin/class/st-test-run-history-tree-provider';
import { stableCommandId } from '@plugin/domain/utils/command-utils';
import { MAX_ST_TEST_HISTORY_RUNS } from '@plugin/domain/services/st-test-run-history';
import type {
  StTestRunHistoryRecord,
  StTestWorkspaceRunHistoryRecord,
} from '@plugin/domain/services/st-test-run-history';

function createRecord(
  workspaceRoot: string,
  operatorName: string,
  runId: string,
  completedAt: string,
  outcome: StTestRunHistoryRecord['outcome'] = 'passed',
): StTestWorkspaceRunHistoryRecord {
  return {
    workspaceRoot,
    record: {
      runId,
      operatorName,
      completedAt,
      runDirectory: path.join(workspaceRoot, '.vscode', 'st-results', runId),
      runDirectoryLabel: `.vscode/st-results/${runId}`,
      outcome,
      summary: {
        total: 2,
        passed: outcome === 'passed' ? 2 : 1,
        failed: outcome === 'failed' ? 1 : 0,
        invalid: outcome === 'invalid' ? 1 : 0,
        files: 0,
        invalidFiles: 0,
      },
      artifacts: [],
      display: {},
    },
  };
}

describe('StTestRunHistoryTreeProvider', () => {
  const workspaceA = path.resolve('workspace-a');
  const workspaceB = path.resolve('workspace-b');

  it('lists runs directly, ordered newest-first across operators and workspaces', () => {
    const entries = [
      createRecord(workspaceA, 'add', 'old', '2026-07-20T10:00:00.000Z'),
      createRecord(workspaceA, 'add', 'new', '2026-07-21T10:00:00.000Z', 'failed'),
      createRecord(workspaceA, 'multiply', 'mul', '2026-07-19T10:00:00.000Z'),
      createRecord(workspaceB, 'add', 'other-workspace', '2026-07-18T10:00:00.000Z'),
    ];
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
        {
          root: workspaceB,
          name: 'workspace-b',
        },
      ],
      loadWorkspaceHistory: (workspaceRoot) => entries.filter((entry) => entry.workspaceRoot === workspaceRoot),
    });

    provider.refresh();
    const roots = provider.getChildren();

    expect(roots.map((item) => provider.getRecord(item.id as string)?.record.runId))
      .toEqual([
        'new',
        'old',
        'mul',
        'other-workspace',
      ]);
    expect(roots.map((item) => item.description))
      .toEqual([
        'add - workspace-a - stTest.results.outcome.failed - 2 total - 1 failed - 0 invalid',
        'add - workspace-a - stTest.results.outcome.passed - 2 total - 0 failed - 0 invalid',
        'multiply - workspace-a - stTest.results.outcome.passed - 2 total - 0 failed - 0 invalid',
        'add - workspace-b - stTest.results.outcome.passed - 2 total - 0 failed - 0 invalid',
      ]);
    // The record identity lives in the command id (a digest), so neither the
    // workspace path nor the run id is readable from the row command.
    const rowCommandId = roots[0].command?.command as string;

    expect(rowCommandId)
      .toBe(stableCommandId(COMMAND_ST_TEST_HISTORY_OPEN, roots[0].id as string));
    expect(rowCommandId).not.toContain(workspaceA);
    expect(rowCommandId).not.toContain('new');
    expect(roots[0].command?.arguments)
      .toBeUndefined();
    expect((roots[0].iconPath as vscode.ThemeIcon).id)
      .toBe('error');
    expect(provider.getChildren(roots[0]))
      .toEqual([]);
  });

  it('keeps the current in-memory run and reveals it natively', async () => {
    const persisted = createRecord(workspaceA, 'add', 'persisted', '2026-07-20T10:00:00.000Z');
    const current = createRecord(workspaceA, 'add', 'current', '2026-07-21T10:00:00.000Z');
    const reveal = jest.fn(async () => undefined);
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => [persisted],
    });

    provider.setTreeView({ reveal } as unknown as vscode.TreeView<never>);
    provider.setCurrentRun(workspaceA, current.record);
    await Promise.resolve();

    const runs = provider.getChildren();

    expect(runs.map((item) => provider.getRecord(item.id as string)?.record.runId))
      .toEqual([
        'current',
        'persisted',
      ]);
    expect(runs[0].contextValue)
      .toBe('stTestHistoryRun.selected');
    expect(reveal)
      .toHaveBeenCalledWith(runs[0], {
        select: true,
        focus: false,
        expand: true,
      });
  });

  it('drops the in-memory current run after its workspace is closed', () => {
    let workspaces = [
      {
        root: workspaceA,
        name: 'workspace-a',
      },
    ];
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => workspaces,
      loadWorkspaceHistory: () => [],
    });
    const current = createRecord(workspaceA, 'add', 'current', '2026-07-21T10:00:00.000Z');

    provider.setCurrentRun(workspaceA, current.record);
    expect(provider.getChildren())
      .toHaveLength(1);

    workspaces = [];
    provider.refresh();

    expect(provider.getChildren()
      .map((item) => [
        item.label,
        item.contextValue,
      ]))
      .toEqual([
        [
          'stTest.results.noHistory',
          'stTestHistoryEmpty',
        ],
      ]);
  });

  it('returns an empty state node when no ST history exists', () => {
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => [],
    });

    provider.refresh();

    const roots = provider.getChildren();

    expect(roots)
      .toHaveLength(1);
    expect(roots[0].label)
      .toBe('stTest.results.noHistory');
    expect(roots[0].contextValue)
      .toBe('stTestHistoryEmpty');
    expect(roots[0].collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.None);
    expect(roots[0].iconPath)
      .toBeUndefined();
  });

  it('keeps only the newest 50 runs when an in-memory run is merged', () => {
    const persisted = Array.from({ length: MAX_ST_TEST_HISTORY_RUNS }, (_, index) => createRecord(
      workspaceA,
      'add',
      `persisted-${index}`,
      new Date(Date.UTC(2026, 6, 20, 0, index))
        .toISOString(),
    ));
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => persisted,
    });

    provider.setCurrentRun(
      workspaceA,
      createRecord(workspaceA, 'add', 'current', '2026-07-21T10:00:00.000Z').record,
    );

    const runs = provider.getChildren();

    expect(runs)
      .toHaveLength(MAX_ST_TEST_HISTORY_RUNS);
    expect(runs.map((item) => provider.getRecord(item.id as string)?.record.runId)[0])
      .toBe('current');
    expect(runs.map((item) => provider.getRecord(item.id as string)?.record.runId))
      .not.toContain('persisted-0');
  });

  it('uses workspace paths to distinguish duplicate workspace names', () => {
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'operators',
        },
        {
          root: workspaceB,
          name: 'operators',
        },
      ],
      loadWorkspaceHistory: (workspaceRoot) => [
        createRecord(
          workspaceRoot,
          'add',
          `run-${path.basename(workspaceRoot)}`,
          '2026-07-21T10:00:00.000Z',
        ),
      ],
    });

    provider.refresh();

    expect(provider.getChildren()
      .map((item) => item.description))
      .toEqual([
        `add - ${workspaceB} - stTest.results.outcome.passed - 2 total - 0 failed - 0 invalid`,
        `add - ${workspaceA} - stTest.results.outcome.passed - 2 total - 0 failed - 0 invalid`,
      ]);
  });

  it('keeps an unparseable completion time as the item label', () => {
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => [createRecord(workspaceA, 'add', 'odd-run', 'not-a-date')],
    });

    provider.refresh();

    expect(provider.getChildren()[0].label)
      .toBe('not-a-date');
  });

  it('falls back to an empty tree when no workspace folders are exposed', () => {
    const originalFolders = (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders;

    try {
      (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

      const provider = new StTestRunHistoryTreeProvider();

      provider.refresh();

      expect(provider.getChildren())
        .toHaveLength(1);
      expect(provider.getChildren()[0].id)
        .toBe('st-test-history-empty');
    }
    finally {
      (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = originalFolders;
    }
  });

  it('maps the exposed workspace folders when no custom source is given', () => {
    const workspaceFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-tree-folder-'));

    try {
      mockWorkspaceFolders.push({
        name: 'ws-folder',
        uri: { fsPath: workspaceFolder },
      });

      const provider = new StTestRunHistoryTreeProvider();

      provider.refresh();

      expect(provider.getChildren())
        .toHaveLength(1);
      expect(provider.getChildren()[0].id)
        .toBe('st-test-history-empty');
    }
    finally {
      mockWorkspaceFolders.length = 0;
      fs.rmSync(workspaceFolder, {
        recursive: true,
        force: true,
      });
    }
  });

  it('clears the tree and fires a change event', () => {
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => [createRecord(workspaceA, 'add', 'clear-me', '2026-07-21T10:00:00.000Z')],
    });
    const emitter = provider as unknown as {
      onDidChangeTreeDataEmitter: { fire: jest.Mock };
    };

    provider.refresh();
    expect(provider.getChildren())
      .toHaveLength(1);

    provider.clear();

    expect(provider.getChildren()
      .map((item) => [
        item.label,
        item.contextValue,
      ]))
      .toEqual([
        [
          'stTest.results.noHistory',
          'stTestHistoryEmpty',
        ],
      ]);
    expect(emitter.onDidChangeTreeDataEmitter.fire)
      .toHaveBeenCalledTimes(2);
  });

  it('returns the element unchanged from getTreeItem and has no parent', () => {
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => [createRecord(workspaceA, 'add', 'parentless', '2026-07-21T10:00:00.000Z')],
    });

    provider.refresh();
    const node = provider.getChildren()[0];

    expect(provider.getTreeItem(node))
      .toBe(node);
    expect(provider.getParent(node))
      .toBeUndefined();
  });

  it('clears all state and disposes the change emitter', () => {
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => [createRecord(workspaceA, 'add', 'disposed', '2026-07-21T10:00:00.000Z')],
    });
    const emitter = provider as unknown as {
      onDidChangeTreeDataEmitter: { dispose: jest.Mock };
    };

    provider.refresh();
    provider.dispose();

    expect(emitter.onDidChangeTreeDataEmitter.dispose)
      .toHaveBeenCalled();
    expect(provider.getChildren()
      .map((item) => item.id))
      .toEqual(['st-test-history-empty']);
  });

  it('keeps loading other workspaces when one workspace history load fails', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      const provider = new StTestRunHistoryTreeProvider({
        getWorkspaces: () => [
          {
            root: workspaceA,
            name: 'workspace-a',
          },
          {
            root: workspaceB,
            name: 'workspace-b',
          },
        ],
        loadWorkspaceHistory: (workspaceRoot) => {
          if (workspaceRoot === workspaceA) {
            throw new Error('corrupt history');
          }

          return [createRecord(workspaceB, 'add', 'b-run', '2026-07-21T10:00:00.000Z')];
        },
      });

      provider.refresh();

      expect(consoleErrorSpy)
        .toHaveBeenCalledWith(
          '[ST test] Could not load run history for workspace workspace-a:',
          expect.any(Error),
        );
      expect(provider.getChildren())
        .toHaveLength(1);
    }
    finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('logs when the native reveal of the current run fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      const provider = new StTestRunHistoryTreeProvider({
        getWorkspaces: () => [
          {
            root: workspaceA,
            name: 'workspace-a',
          },
        ],
        loadWorkspaceHistory: () => [],
      });

      provider.setTreeView({
        reveal: jest.fn(async () => {
          throw new Error('reveal failed');
        }),
      } as unknown as vscode.TreeView<never>);
      provider.setCurrentRun(
        workspaceA,
        createRecord(workspaceA, 'add', 'current', '2026-07-21T10:00:00.000Z').record,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(consoleErrorSpy)
        .toHaveBeenCalledWith(
          '[ST test] Could not reveal the current run in Test History:',
          expect.any(Error),
        );
    }
    finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('falls back to the record workspace basename when its root is not exposed', () => {
    const elsewhere = path.resolve('elsewhere-x');
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => [createRecord(elsewhere, 'add', 'stray', '2026-07-21T10:00:00.000Z')],
    });

    provider.refresh();

    expect(provider.getChildren()[0].description)
      .toContain(`add - ${path.basename(elsewhere)} - `);
  });

  it('orders equal runs by operator name and then workspace name', () => {
    const workspaceC = path.resolve('workspace-c');
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
        {
          root: workspaceB,
          name: 'workspace-b',
        },
        {
          root: workspaceC,
          name: 'workspace-c',
        },
      ],
      loadWorkspaceHistory: (workspaceRoot) => {
        const operatorName = workspaceRoot === workspaceB ? 'add' : workspaceRoot === workspaceC ? 'multiply' : 'add';

        return [createRecord(workspaceRoot, operatorName, 'tie', '2026-07-21T10:00:00.000Z')];
      },
    });

    provider.refresh();

    expect(provider.getChildren()
      .map((item) => item.description))
      .toEqual([
        'add - workspace-a - stTest.results.outcome.passed - 2 total - 0 failed - 0 invalid',
        'add - workspace-b - stTest.results.outcome.passed - 2 total - 0 failed - 0 invalid',
        'multiply - workspace-c - stTest.results.outcome.passed - 2 total - 0 failed - 0 invalid',
      ]);
  });

  it('does not fold record keys to lower case on non-Windows platforms', () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

    try {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      const provider = new StTestRunHistoryTreeProvider({
        getWorkspaces: () => [
          {
            root: workspaceA,
            name: 'workspace-a',
          },
        ],
        loadWorkspaceHistory: () => [createRecord(workspaceA, 'add', 'linux-run', '2026-07-21T10:00:00.000Z')],
      });

      provider.refresh();

      const roots = provider.getChildren();

      expect(provider.getRecord(roots[0].id as string)?.record.runId)
        .toBe('linux-run');
    }
    finally {
      if (platformDescriptor) {
        Object.defineProperty(process, 'platform', platformDescriptor);
      }
    }
  });

  it('skips revealing a current run that was trimmed out of the view', () => {
    const persisted = Array.from({ length: MAX_ST_TEST_HISTORY_RUNS }, (_, index) => createRecord(
      workspaceA,
      'add',
      `persisted-${index}`,
      new Date(Date.UTC(2026, 6, 20, 0, index))
        .toISOString(),
    ));
    const reveal = jest.fn(async () => undefined);
    const provider = new StTestRunHistoryTreeProvider({
      getWorkspaces: () => [
        {
          root: workspaceA,
          name: 'workspace-a',
        },
      ],
      loadWorkspaceHistory: () => persisted,
    });

    provider.setTreeView({ reveal } as unknown as vscode.TreeView<never>);
    provider.setCurrentRun(
      workspaceA,
      createRecord(workspaceA, 'add', 'stale-current', '2026-07-19T10:00:00.000Z').record,
    );

    expect(reveal)
      .not
      .toHaveBeenCalled();
    expect(provider.getChildren())
      .toHaveLength(MAX_ST_TEST_HISTORY_RUNS);
  });
});
