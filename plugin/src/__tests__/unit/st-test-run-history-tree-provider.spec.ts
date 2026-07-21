const mockWorkspaceFolders: Array<{
  name: string;
  uri: { fsPath: string };
}> = [];

jest.mock('i18next', () => ({
  t: (key: string, values?: Record<string, number>) => {
    if (key === 'stTest.results.historySummary') {
      return `${values?.total} total · ${values?.failed} failed · ${values?.invalid} invalid`;
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
      runDirectory: path.join(workspaceRoot, '.vscode', 'st-results', operatorName, runId),
      runDirectoryLabel: `.vscode/st-results/${operatorName}/${runId}`,
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

  it('groups runs by workspace and operator, then orders each operator newest-first', () => {
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

    expect(roots.map((item) => [
      item.label,
      item.description,
    ]))
      .toEqual([
        [
          'add',
          'workspace-a',
        ],
        [
          'add',
          'workspace-b',
        ],
        [
          'multiply',
          'workspace-a',
        ],
      ]);

    const addRuns = provider.getChildren(roots[0]);

    expect(addRuns.map((item) => provider.getRecord(item.command?.arguments?.[0] as string)?.record.runId))
      .toEqual([
        'new',
        'old',
      ]);
    const selectedKey = addRuns[0].command?.arguments?.[0] as string;

    expect(selectedKey).not.toContain(workspaceA);
    expect(selectedKey).not.toContain('new');
    expect((addRuns[0].iconPath as vscode.ThemeIcon).id)
      .toBe('error');
  });

  it('keeps the current in-memory run, expands its operator, and reveals it natively', async () => {
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

    const operator = provider.getChildren()[0];
    const runs = provider.getChildren(operator);

    expect(operator.collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Expanded);
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

    expect(provider.getChildren())
      .toEqual([]);
  });

  it('keeps at most 50 newest runs when an in-memory run is merged', () => {
    const persisted = Array.from({ length: 50 }, (_, index) => createRecord(
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

    expect(provider.getChildren(provider.getChildren()[0]))
      .toHaveLength(50);
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
        workspaceA,
        workspaceB,
      ]);
  });
});
