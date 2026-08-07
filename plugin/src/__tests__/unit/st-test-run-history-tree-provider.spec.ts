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

import * as path from 'path';
import * as vscode from 'vscode';

import { StTestRunHistoryTreeProvider } from '@plugin/class/st-test-run-history-tree-provider';
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

    expect(roots.map((item) => provider.getRecord(item.command?.arguments?.[0] as string)?.record.runId))
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
    const selectedKey = roots[0].command?.arguments?.[0] as string;

    expect(selectedKey).not.toContain(workspaceA);
    expect(selectedKey).not.toContain('new');
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

    expect(runs.map((item) => provider.getRecord(item.command?.arguments?.[0] as string)?.record.runId))
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
    expect(runs.map((item) => provider.getRecord(item.command?.arguments?.[0] as string)?.record.runId)[0])
      .toBe('current');
    expect(runs.map((item) => provider.getRecord(item.command?.arguments?.[0] as string)?.record.runId))
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
});
