import path from 'node:path';

import * as vscode from 'vscode';

import {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
  PerformanceRunDataFolder,
} from '@shared/api-types';
import { PermanentStorage } from '@plugin/class/permanent-storage';
import { Project } from '@plugin/core/project/project';
import { getConfig } from '@plugin/domain';
import { getOpByProjectIdAndOpName } from '@plugin/domain/models/model';

const PERFORMANCE_RUN_DATA_ROOT = '.vscode/opprof';

const MARKED_STORAGE_KEY = 'marked_performance_records';

export class PerformanceRunData {
  private static instance: PerformanceRunData;

  static getInstance(): PerformanceRunData {
    if (!PerformanceRunData.instance) {
      PerformanceRunData.instance = new PerformanceRunData();
    }

    return PerformanceRunData.instance;
  }

  private readonly rootUri?: vscode.Uri;

  constructor() {
    const project = Project.getInstance();

    if (!project.workspaceIsProject()) {
      return;
    }

    const [performanceConfig] = getConfig(project.projectId, 'build_op');

    if (!performanceConfig) {
      // If the project does not have a build_op configuration (such as a project created by a non-plugin), no processing will be done
      return;
    }

    const op = getOpByProjectIdAndOpName(
      project.projectId,
      performanceConfig.op,
    );

    this.rootUri = vscode.Uri.joinPath(
      vscode.Uri.file(op?.op_path || project.projectPath),
      PERFORMANCE_RUN_DATA_ROOT,
    );
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

    // Runs under <op>/.vscode/opprof/<runId>/ (optional — folder may not exist yet)
    if (this.rootUri && (await this.uriExists(this.rootUri))) {
      const executionEntries = await vscode.workspace.fs.readDirectory(this.rootUri);
      const opprofDirs = executionEntries.filter(([, t]) => t === vscode.FileType.Directory)
        .map(([name]) => name);
      const opprofRecords = await Promise.all(
        opprofDirs.map(async (subPath) => {
          const recordUri = vscode.Uri.joinPath(this.rootUri!, subPath);
          const [
            stat,
            children,
          ] = await Promise.all([
            vscode.workspace.fs.stat(recordUri),
            this.scanSubFiles(recordUri),
          ]);
          return {
            key: subPath,
            title: subPath,
            timestamp: stat.ctime,
            dirPath: recordUri.fsPath,
            marked: markedKeySet.has(subPath),
            children,
          } satisfies PerformanceExecutionRecord;
        }),
      );
      runData.push(...opprofRecords);
    }

    // Manual / external reports from fileMapList (simulate + on_board) — must run even when opprof is absent
    const simulateConfigs = getConfig(project.projectId, 'simulate');
    const onBoardConfigs = getConfig(project.projectId, 'on_board');

    const fileMapEntryTasks: Promise<PerformanceExecutionRecord | null>[] = [];

    const pushSimulateFileMapTasks = (fileMapList: Array<{ filePath: string; reportTime: number }>) => {
      for (const fileMap of fileMapList) {
        fileMapEntryTasks.push(this.buildFileMapExecutionRecord(fileMap, 'simulate', markedKeySet));
      }
    };

    const pushOnboardFileMapTasks = (fileMapList: Array<{ filePath: string; reportTime: number }>) => {
      for (const fileMap of fileMapList) {
        fileMapEntryTasks.push(this.buildFileMapExecutionRecord(fileMap, 'onboard', markedKeySet));
      }
    };

    for (const config of simulateConfigs) {
      const userOptions = config.user_options as Record<string, unknown> | null;
      if (userOptions && Array.isArray(userOptions.fileMapList)) {
        pushSimulateFileMapTasks(userOptions.fileMapList as Array<{ filePath: string; reportTime: number }>);
      }
    }

    for (const config of onBoardConfigs) {
      const userOptions = config.user_options as Record<string, unknown> | null;
      if (userOptions && Array.isArray(userOptions.fileMapList)) {
        pushOnboardFileMapTasks(userOptions.fileMapList as Array<{ filePath: string; reportTime: number }>);
      }
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
    fileMap: { filePath: string; reportTime: number },
    kind: 'simulate' | 'onboard',
    markedKeySet: Set<string>,
  ): Promise<PerformanceExecutionRecord | null> {
    const uri = vscode.Uri.file(fileMap.filePath);
    if (!(await this.uriExists(uri))) {
      return null;
    }
    const stat = await vscode.workspace.fs.stat(uri);
    const isDirectory = stat.type === vscode.FileType.Directory;
    const keyPrefix = kind === 'simulate' ? 'simulate_' : 'onboard_';
    const key = `${keyPrefix}${fileMap.filePath}`;
    const children = isDirectory ? await this.scanSubFiles(uri) : [];
    return {
      key,
      title: path.basename(fileMap.filePath),
      timestamp: fileMap.reportTime,
      dirPath: fileMap.filePath,
      marked: markedKeySet.has(key),
      children,
    };
  }

  private async scanSubFiles(parentUri: vscode.Uri): Promise<(PerformanceRunDataFolder | PerformanceRunDataFile)[]> {
    const subPathEntries = await vscode.workspace.fs.readDirectory(parentUri);
    const mapped = await Promise.all(
      subPathEntries.map(async ([
        subPath,
        entryType,
      ]) => {
        if (entryType === vscode.FileType.Directory) {
          const subUri = vscode.Uri.joinPath(parentUri, subPath);
          const children = await this.scanSubFiles(subUri);
          if (children.length > 0) {
            return { kind: 'folder' as const, title: subPath, children };
          }
          return null;
        }
        const ext = path.extname(subPath)
          .replace(/^\./, '');

        if ([
          'csv',
          'bin',
          'json',
        ].includes(ext)) {
          const filePath = path.join(parentUri.fsPath, subPath);
          return {
            kind: 'file' as const,
            node: {
              key: filePath,
              title: subPath,
              filePath,
              fileType: ext,
            } satisfies PerformanceRunDataFile,
          };
        }
        return null;
      }),
    );

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

  private async uriExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);

      return true;
    }
    catch {
      return false;
    }
  }
}
