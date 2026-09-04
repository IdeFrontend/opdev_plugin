import path from 'node:path';

import * as vscode from 'vscode';

import {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
  PerformanceRunDataFolder,
} from '@shared/api-types';
import { PermanentStorage } from '@plugin/class/permanent-storage';
import { Project } from '@plugin/core/project/project';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { joinIdeConfigRelative } from '@plugin/helpers/ide-config-dir';
import { readWorkspaceCache } from '@plugin/helpers/workspace-cache';

const getPerformanceRunDataRoot = (): string => joinIdeConfigRelative('opprof');

const MARKED_STORAGE_KEY = 'marked_performance_records';

export class PerformanceRunData {
  private static instance: PerformanceRunData;

  static getInstance(): PerformanceRunData {
    if (!PerformanceRunData.instance) {
      PerformanceRunData.instance = new PerformanceRunData();
    }

    return PerformanceRunData.instance;
  }

  /**
   * The single opprof root (`<root>/<ideDir>/opprof`) — every operator writes
   * its runs there, so the scan never walks per-operator directories.
   */
  private readonly rootUris: vscode.Uri[] = [];

  constructor() {
    const project = Project.getInstance();

    if (!project.workspaceIsProject()) {
      return;
    }

    const projectPath = project.projectPath;
    const record = getProjectByPath(projectPath);

    if (!record) {
      // The workspace is not a recognized operator project — no processing.
      return;
    }

    // All opprof reports live under the workspace root: the profiler writes
    // `<root>/<ideDir>/opprof/<runId>` and the scan reads only that directory.
    // A per-operator scan of a standard-custom collection walked every
    // operator's run tree over the remote FS and stalled operator actions for
    // minutes inside the post-activate bootstrap.
    this.rootUris = [
      vscode.Uri.joinPath(
        vscode.Uri.file(projectPath),
        getPerformanceRunDataRoot(),
      ),
    ];
  }

  /**
   * Read performance tuning execution records (unsorted scan order).
   * Callers sort in memory; the sort toggle must not re-hit the filesystem.
   */
  public async queryExecutionRecords(
    _sortBy: 'timestamp',
    _order: 'asc' | 'desc',
  ): Promise<PerformanceExecutionRecord[]> {
    const markedKeySet = this.queryMarkedRecordKeySet();

    return await this.scanRunDataDirectory(markedKeySet);
  }

  /**
   * mark
   */
  public markRecord(key: string): void {
    const keySet = this.queryMarkedRecordKeySet();

    keySet.add(key);
    PermanentStorage.getInstance()
      .set<string[]>(MARKED_STORAGE_KEY, [...keySet]);
  }

  /**
   * Unmark
   */
  public unmarkRecord(key: string): void {
    const keySet = this.queryMarkedRecordKeySet();

    keySet.delete(key);
    PermanentStorage.getInstance()
      .set<string[]>(MARKED_STORAGE_KEY, [...keySet]);
  }

  /**
   * Query existing tags
   */
  private queryMarkedRecordKeySet(): Set<string> {
    const storageValue = PermanentStorage.getInstance()
      .get<string[]>(
        MARKED_STORAGE_KEY,
        [],
      );

    return new Set(storageValue);
  }

  private async scanRunDataDirectory(markedKeySet: Set<string>) {
    const runData: PerformanceExecutionRecord[] = [];

    const project = Project.getInstance();

    if (!project.workspaceIsProject()) {
      return runData;
    }

    // Runs under <root>/<ideDir>/opprof/<runId>/ (optional — the folder may
    // not exist yet). Each physical report (distinct dirPath) is kept once.
    for (const rootUri of this.rootUris) {
      if (!(await this.uriExists(rootUri))) {
        continue;
      }

      const executionEntries = await this.readDirectoryIfPresent(rootUri);

      if (executionEntries) {
        const opprofDirs = executionEntries.filter(([
          , t,
        ]) => t === vscode.FileType.Directory)
          .map(([name]) => name);
        const opprofRecords = await Promise.all(opprofDirs.map(async (subPath) => {
          const recordUri = vscode.Uri.joinPath(rootUri, subPath);

          return await this.runIfPathPresent(recordUri, async () => {
            const children = await this.scanSubFiles(recordUri);
            // Re-check after traversal so a report deleted mid-scan cannot
            // survive as an empty, stale row.
            const stat = await vscode.workspace.fs.stat(recordUri);

            return {
              key: subPath,
              title: subPath,
              timestamp: stat.ctime,
              dirPath: recordUri.fsPath,
              marked: markedKeySet.has(subPath),
              children,
            } satisfies PerformanceExecutionRecord;
          });
        }));

        for (const record of opprofRecords) {
          if (record && !runData.some((existing) => existing.dirPath === record.dirPath)) {
            runData.push(record);
          }
        }
      }
    }

    // Manual / external reports from fileMapList (simulate + on_board) — must run even when opprof is absent
    const fileMapEntryTasks: Promise<PerformanceExecutionRecord | null>[] = [];

    const pushSimulateFileMapTasks = (fileMapList: Array<{ filePath: string;
      reportTime: number }>) => {
      for (const fileMap of fileMapList) {
        fileMapEntryTasks.push(this.buildFileMapExecutionRecord(fileMap, 'simulate', markedKeySet));
      }
    };

    const pushOnboardFileMapTasks = (fileMapList: Array<{ filePath: string;
      reportTime: number }>) => {
      for (const fileMap of fileMapList) {
        fileMapEntryTasks.push(this.buildFileMapExecutionRecord(fileMap, 'onboard', markedKeySet));
      }
    };

    // The workspace cache is the source of file-map lists (written by the
    // context menu addReportToFileMapList).
    const cachedFileMaps = readWorkspaceCache(project.projectPath).fileMapLists;

    if (cachedFileMaps?.simulate) {
      pushSimulateFileMapTasks(cachedFileMaps.simulate);
    }

    if (cachedFileMaps?.on_board) {
      pushOnboardFileMapTasks(cachedFileMaps.on_board);
    }

    if (fileMapEntryTasks.length > 0) {
      const fromMaps = await Promise.all(fileMapEntryTasks);

      for (const rec of fromMaps) {
        if (rec) {
          runData.push(rec);
        }
      }
    }

    return runData;
  }

  private async buildFileMapExecutionRecord(
    fileMap: { filePath: string;
      reportTime: number },
    kind: 'simulate' | 'onboard',
    markedKeySet: Set<string>,
  ): Promise<PerformanceExecutionRecord | null> {
    const uri = vscode.Uri.file(fileMap.filePath);

    if (!(await this.uriExists(uri))) {
      return null;
    }

    return await this.runIfPathPresent(uri, async () => {
      const initialStat = await vscode.workspace.fs.stat(uri);
      const isDirectory = initialStat.type === vscode.FileType.Directory;
      const keyPrefix = kind === 'simulate' ? 'simulate_' : 'onboard_';
      const key = `${keyPrefix}${fileMap.filePath}`;
      const children = isDirectory ? await this.scanSubFiles(uri) : [];

      // The path may disappear after the initial existence/type check.
      await vscode.workspace.fs.stat(uri);

      return {
        key,
        title: path.basename(fileMap.filePath),
        timestamp: fileMap.reportTime,
        dirPath: fileMap.filePath,
        marked: markedKeySet.has(key),
        children,
      };
    });
  }

  private async scanSubFiles(parentUri: vscode.Uri): Promise<(PerformanceRunDataFolder | PerformanceRunDataFile)[]> {
    const subPathEntries = await this.readDirectoryIfPresent(parentUri);

    if (!subPathEntries) {
      return [];
    }

    const mapped = await Promise.all(subPathEntries.map(async ([
      subPath,
      entryType,
    ]) => {
      if (entryType === vscode.FileType.Directory) {
        const subUri = vscode.Uri.joinPath(parentUri, subPath);

        return await this.runIfPathPresent(subUri, async () => {
          const children = await this.scanSubFiles(subUri);
          const currentStat = await vscode.workspace.fs.stat(subUri);

          if (currentStat.type !== vscode.FileType.Directory || children.length === 0) {
            return null;
          }

          return {
            kind: 'folder' as const,
            title: subPath,
            children,
          };
        });
      }

      // `.npu-rep` is a compound extension `path.extname` would collapse to
      // `rep`; detect it explicitly so new-tool reports keep the distinct type.
      const ext = /\.npu-rep$/i.test(subPath)
        ? 'npu-rep'
        : path.extname(subPath)
          .replace(/^\./, '');

      if ([
        'csv',
        'bin',
        'json',
        'rep',
        'ncrep',
        'npu-rep',
      ].includes(ext)) {
        const fileUri = vscode.Uri.joinPath(parentUri, subPath);

        return await this.runIfPathPresent(fileUri, async () => {
          // readDirectory may return an entry that is deleted before the
          // snapshot is assembled. Confirm it still exists first.
          await vscode.workspace.fs.stat(fileUri);
          const filePath = fileUri.fsPath;

          return {
            kind: 'file' as const,
            node: {
              key: filePath,
              title: subPath,
              filePath,
              fileType: ext,
            } satisfies PerformanceRunDataFile,
          };
        });
      }

      return null;
    }));

    const subDirOrFiles: (PerformanceRunDataFolder | PerformanceRunDataFile)[] = [];

    for (const item of mapped) {
      if (!item) {
        continue;
      }

      if (item.kind === 'folder') {
        subDirOrFiles.push({
          title: item.title,
          children: item.children,
        });
      }
      else {
        subDirOrFiles.push(item.node);
      }
    }

    return subDirOrFiles;
  }

  private async readDirectoryIfPresent(uri: vscode.Uri): Promise<[string, vscode.FileType][] | null> {
    return await this.runIfPathPresent(uri, async () => vscode.workspace.fs.readDirectory(uri));
  }

  private async runIfPathPresent<T>(uri: vscode.Uri, action: ()=> Promise<T>): Promise<T | null> {
    try {
      return await action();
    }
    catch (error) {
      if (await this.pathDisappearedAfterError(uri, error)) {
        return null;
      }

      throw error;
    }
  }

  private async pathDisappearedAfterError(uri: vscode.Uri, error: unknown): Promise<boolean> {
    if (!this.isFileNotFoundError(error)) {
      return false;
    }

    try {
      await vscode.workspace.fs.stat(uri);

      return false;
    }
    catch (recheckError) {
      if (this.isFileNotFoundError(recheckError)) {
        return true;
      }

      throw recheckError;
    }
  }

  private isFileNotFoundError(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;

    return code === 'FileNotFound' || code === 'ENOENT';
  }

  private async uriExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);

      return true;
    }
    catch (error) {
      if (this.isFileNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }
}
