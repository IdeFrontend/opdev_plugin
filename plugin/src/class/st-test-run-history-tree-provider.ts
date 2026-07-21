import { createHash } from 'crypto';
import * as path from 'path';
import { t } from 'i18next';
import * as vscode from 'vscode';

import { COMMAND_ST_TEST_HISTORY_OPEN } from '@plugin/constants';
import {
  loadStTestRunHistoryFromWorkspace,
  MAX_ST_TEST_HISTORY_RUNS,
  type StTestRunHistoryRecord,
  type StTestWorkspaceRunHistoryRecord,
} from '@plugin/domain/services/st-test-run-history';
import type { StTestReportOutcome } from '@shared/st-test-results';

type WorkspaceHistorySource = {
  root: string;
  name: string;
};

type StTestRunHistoryTreeDependencies = {
  getWorkspaces: ()=> readonly WorkspaceHistorySource[];
  loadWorkspaceHistory: (workspaceRoot: string)=> StTestWorkspaceRunHistoryRecord[];
};

type StTestHistoryTreeNode = StTestOperatorHistoryTreeItem | StTestRunHistoryTreeItem;

const OUTCOME_ICON: Record<StTestReportOutcome, string> = {
  passed: 'pass',
  failed: 'error',
  invalid: 'warning',
};

function stableKey(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256')
    .update(parts.join('\0'))
    .digest('hex');

  return `${prefix}:${digest}`;
}

function normalizePathKey(value: string): string {
  const normalized = path.resolve(value);

  return process.platform === 'win32'
    ? normalized.toLowerCase()
    : normalized;
}

function formatCompletedAt(completedAt: string): string {
  const timestamp = Date.parse(completedAt);

  if (!Number.isFinite(timestamp)) {
    return completedAt;
  }

  return new Intl.DateTimeFormat(vscode.env.language, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
    .format(timestamp);
}

class StTestOperatorHistoryTreeItem extends vscode.TreeItem {
  public readonly children: StTestRunHistoryTreeItem[] = [];

  constructor(
    public readonly operatorKey: string,
    operatorName: string,
    workspaceName: string,
    expanded: boolean,
  ) {
    super(
      operatorName,
      expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.id = operatorKey;
    this.description = workspaceName;
    this.tooltip = `${operatorName} — ${workspaceName}`;
    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    this.contextValue = 'stTestHistoryOperator';
  }
}

class StTestRunHistoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly recordKey: string,
    public readonly parent: StTestOperatorHistoryTreeItem,
    record: StTestRunHistoryRecord,
    selected: boolean,
  ) {
    super(formatCompletedAt(record.completedAt), vscode.TreeItemCollapsibleState.None);
    const outcome = t(`stTest.results.outcome.${record.outcome}`);
    const summary = t('stTest.results.historySummary', {
      total: record.summary.total,
      failed: record.summary.failed,
      invalid: record.summary.invalid,
    });

    this.id = recordKey;
    this.description = `${outcome} · ${summary}`;
    this.tooltip = `${record.operatorName}\n${record.runId}\n${this.description}`;
    this.iconPath = new vscode.ThemeIcon(OUTCOME_ICON[record.outcome]);
    this.contextValue = selected
      ? 'stTestHistoryRun.selected'
      : 'stTestHistoryRun';
    this.command = {
      command: COMMAND_ST_TEST_HISTORY_OPEN,
      title: t('stTest.results.history'),
      arguments: [recordKey],
    };
  }
}

export class StTestRunHistoryTreeProvider implements vscode.TreeDataProvider<StTestHistoryTreeNode>, vscode.Disposable {
  private readonly dependencies: StTestRunHistoryTreeDependencies;

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<StTestHistoryTreeNode | undefined>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private operatorNodes: StTestOperatorHistoryTreeItem[] = [];

  private readonly recordsByKey = new Map<string, StTestWorkspaceRunHistoryRecord>();

  private readonly runNodesByKey = new Map<string, StTestRunHistoryTreeItem>();

  private treeView: vscode.TreeView<StTestHistoryTreeNode> | undefined;

  private currentRecord: StTestWorkspaceRunHistoryRecord | undefined;

  private currentRecordKey: string | undefined;

  constructor(dependencies: Partial<StTestRunHistoryTreeDependencies> = {}) {
    this.dependencies = {
      getWorkspaces: dependencies.getWorkspaces ?? (() => (vscode.workspace.workspaceFolders ?? [])
        .map((folder) => ({
          root: folder.uri.fsPath,
          name: folder.name,
        }))),
      loadWorkspaceHistory: dependencies.loadWorkspaceHistory ?? loadStTestRunHistoryFromWorkspace,
    };
  }

  public setTreeView(treeView: vscode.TreeView<StTestHistoryTreeNode>): void {
    this.treeView = treeView;
  }

  public refresh(): void {
    this.rebuildTree();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public clear(): void {
    this.operatorNodes = [];
    this.recordsByKey.clear();
    this.runNodesByKey.clear();
    this.currentRecord = undefined;
    this.currentRecordKey = undefined;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public setCurrentRun(workspaceRoot: string, record: StTestRunHistoryRecord): void {
    this.currentRecord = {
      workspaceRoot,
      record,
    };
    this.currentRecordKey = this.toRecordKey(workspaceRoot, record);
    this.refresh();
    void this.revealCurrentRun();
  }

  public getRecord(recordKey: string): StTestWorkspaceRunHistoryRecord | undefined {
    return this.recordsByKey.get(recordKey);
  }

  public getTreeItem(element: StTestHistoryTreeNode): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: StTestHistoryTreeNode): StTestHistoryTreeNode[] {
    if (!element) {
      return this.operatorNodes;
    }

    return element instanceof StTestOperatorHistoryTreeItem
      ? element.children
      : [];
  }

  public getParent(element: StTestHistoryTreeNode): StTestHistoryTreeNode | undefined {
    return element instanceof StTestRunHistoryTreeItem
      ? element.parent
      : undefined;
  }

  public dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
    this.operatorNodes = [];
    this.recordsByKey.clear();
    this.runNodesByKey.clear();
    this.treeView = undefined;
    this.currentRecord = undefined;
    this.currentRecordKey = undefined;
  }

  private rebuildTree(): void {
    const workspaces = this.dependencies.getWorkspaces();
    const workspaceNames = new Map(workspaces.map((workspace) => [
      normalizePathKey(workspace.root),
      workspace.name,
    ]));
    const workspaceNameCounts = new Map<string, number>();

    workspaces.forEach((workspace) => {
      workspaceNameCounts.set(
        workspace.name,
        (workspaceNameCounts.get(workspace.name) ?? 0) + 1,
      );
    });
    const records = new Map<string, StTestWorkspaceRunHistoryRecord>();

    for (const workspace of workspaces) {
      try {
        for (const entry of this.dependencies.loadWorkspaceHistory(workspace.root)) {
          records.set(this.toRecordKey(entry.workspaceRoot, entry.record), entry);
        }
      }
      catch (error) {
        console.error(`[ST test] Could not load run history for workspace ${workspace.name}:`, error);
      }
    }

    if (this.currentRecord) {
      if (workspaceNames.has(normalizePathKey(this.currentRecord.workspaceRoot))) {
        records.set(
          this.toRecordKey(this.currentRecord.workspaceRoot, this.currentRecord.record),
          this.currentRecord,
        );
      }
      else {
        this.currentRecord = undefined;
        this.currentRecordKey = undefined;
      }
    }

    this.recordsByKey.clear();
    this.runNodesByKey.clear();
    const grouped = new Map<string, {
      workspaceRoot: string;
      workspaceName: string;
      operatorName: string;
      records: Array<{
        recordKey: string;
        record: StTestRunHistoryRecord;
      }>;
    }>();

    for (const [
      recordKey,
      entry,
    ] of records) {
      this.recordsByKey.set(recordKey, entry);
      const workspacePathKey = normalizePathKey(entry.workspaceRoot);
      const operatorKey = stableKey('st-test-operator', workspacePathKey, entry.record.operatorName);
      const workspaceName = workspaceNames.get(workspacePathKey) ?? path.basename(entry.workspaceRoot);
      const group = grouped.get(operatorKey) ?? {
        workspaceRoot: entry.workspaceRoot,
        workspaceName: (workspaceNameCounts.get(workspaceName) ?? 0) > 1
          ? entry.workspaceRoot
          : workspaceName,
        operatorName: entry.record.operatorName,
        records: [],
      };

      group.records.push({
        recordKey,
        record: entry.record,
      });
      grouped.set(operatorKey, group);
    }

    this.operatorNodes = [...grouped.entries()]
      .sort(([
        , left,
      ], [
        , right,
      ]) => left.operatorName.localeCompare(right.operatorName, 'en')
        || left.workspaceName.localeCompare(right.workspaceName, 'en'))
      .map(([
        operatorKey,
        group,
      ]) => {
        const containsCurrent = group.records.some(({ recordKey }) => recordKey === this.currentRecordKey);
        const operatorNode = new StTestOperatorHistoryTreeItem(
          operatorKey,
          group.operatorName,
          group.workspaceName,
          containsCurrent,
        );

        group.records
          .sort((left, right) => Date.parse(right.record.completedAt) - Date.parse(left.record.completedAt)
            || right.record.runId.localeCompare(left.record.runId, 'en'))
          .slice(0, MAX_ST_TEST_HISTORY_RUNS)
          .forEach(({
            recordKey, record,
          }) => {
            const runNode = new StTestRunHistoryTreeItem(
              recordKey,
              operatorNode,
              record,
              recordKey === this.currentRecordKey,
            );

            operatorNode.children.push(runNode);
            this.runNodesByKey.set(recordKey, runNode);
          });

        return operatorNode;
      });
  }

  private toRecordKey(workspaceRoot: string, record: StTestRunHistoryRecord): string {
    return stableKey(
      'st-test-run',
      normalizePathKey(workspaceRoot),
      normalizePathKey(record.runDirectory),
      record.runId,
    );
  }

  private async revealCurrentRun(): Promise<void> {
    const treeView = this.treeView;
    const currentRecordKey = this.currentRecordKey;

    if (!treeView || !currentRecordKey) {
      return;
    }

    const node = this.runNodesByKey.get(currentRecordKey);

    if (!node) {
      return;
    }

    try {
      await treeView.reveal(node, {
        select: true,
        focus: false,
        expand: true,
      });
    }
    catch (error) {
      console.error('[ST test] Could not reveal the current run in Test History:', error);
    }
  }
}
