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

type StTestHistoryTreeNode = StTestRunHistoryTreeItem | StTestEmptyHistoryTreeItem;

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

class StTestRunHistoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly recordKey: string,
    record: StTestRunHistoryRecord,
    workspaceName: string,
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
    this.description = `${record.operatorName} - ${workspaceName} - ${outcome} - ${summary}`;
    this.tooltip = `${record.operatorName}\n${workspaceName}\n${record.runId}\n${this.description}`;
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

class StTestEmptyHistoryTreeItem extends vscode.TreeItem {
  constructor() {
    super(t('stTest.results.noHistory'), vscode.TreeItemCollapsibleState.None);
    this.id = 'st-test-history-empty';
    this.contextValue = 'stTestHistoryEmpty';
  }
}

export class StTestRunHistoryTreeProvider implements vscode.TreeDataProvider<StTestHistoryTreeNode>, vscode.Disposable {
  private readonly dependencies: StTestRunHistoryTreeDependencies;

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<StTestHistoryTreeNode | undefined>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private runNodes: StTestRunHistoryTreeItem[] = [];

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
    this.runNodes = [];
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
      return this.runNodes.length > 0
        ? this.runNodes
        : [new StTestEmptyHistoryTreeItem()];
    }

    return [];
  }

  public getParent(_element: StTestHistoryTreeNode): StTestHistoryTreeNode | undefined {
    return undefined;
  }

  public dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
    this.runNodes = [];
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
    const sortedRecords: Array<{
      recordKey: string;
      entry: StTestWorkspaceRunHistoryRecord;
      workspaceName: string;
    }> = [];

    for (const [
      recordKey,
      entry,
    ] of records) {
      const workspacePathKey = normalizePathKey(entry.workspaceRoot);
      const workspaceName = workspaceNames.get(workspacePathKey) ?? path.basename(entry.workspaceRoot);

      sortedRecords.push({
        recordKey,
        entry,
        workspaceName: (workspaceNameCounts.get(workspaceName) ?? 0) > 1
          ? entry.workspaceRoot
          : workspaceName,
      });
    }

    this.runNodes = sortedRecords
      .sort((left, right) => Date.parse(right.entry.record.completedAt) - Date.parse(left.entry.record.completedAt)
        || right.entry.record.runId.localeCompare(left.entry.record.runId, 'en')
        || left.entry.record.operatorName.localeCompare(right.entry.record.operatorName, 'en')
        || left.workspaceName.localeCompare(right.workspaceName, 'en'))
      .slice(0, MAX_ST_TEST_HISTORY_RUNS)
      .map(({
        recordKey,
        entry,
        workspaceName,
      }) => {
        const runNode = new StTestRunHistoryTreeItem(
          recordKey,
          entry.record,
          workspaceName,
          recordKey === this.currentRecordKey,
        );

        this.recordsByKey.set(recordKey, entry);
        this.runNodesByKey.set(recordKey, runNode);

        return runNode;
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
