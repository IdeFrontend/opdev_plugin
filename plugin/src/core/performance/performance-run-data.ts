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
   * Read performance tuning execution records
   */
  public async queryExecutionRecords(
    sortBy: 'timestamp',
    order: 'asc' | 'desc',
  ): Promise<PerformanceExecutionRecord[]> {
    const markedKeySet = this.queryMarkedRecordKeySet();
    const records = await this.scanRunDataDirectory(markedKeySet);

    return records.sort((a, b) =>
      order === 'asc' ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy]);
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

    if (!this.rootUri || !(await this.uriExists(this.rootUri))) {
      return runData;
    }

    const project = Project.getInstance();
    if (!project.workspaceIsProject()) {
      return runData;
    }

    // Read the execution record in the directory
    const executionEntries = await vscode.workspace.fs.readDirectory(this.rootUri);

    for (const [
      subPath,
      fileType,
    ] of executionEntries) {
      if (fileType !== vscode.FileType.Directory) {
        continue;
      }

      const recordUri = vscode.Uri.joinPath(this.rootUri, subPath);
      const stat = await vscode.workspace.fs.stat(recordUri);
      const executionRecord: PerformanceExecutionRecord = {
        key: subPath,
        title: subPath,
        timestamp: stat.ctime,
        dirPath: recordUri.fsPath,
        marked: markedKeySet.has(subPath),
        children: await this.scanSubFiles(recordUri),
      };

      runData.push(executionRecord);
    }

    // Read fileMapList in configuration
    const simulateConfigs = getConfig(project.projectId, 'simulate');
    const onBoardConfigs = getConfig(project.projectId, 'on_board');

    // FileMapList that handles simulation configuration
    for (const config of simulateConfigs) {
      const userOptions = config.user_options as Record<string, unknown> | null;
      if (userOptions && Array.isArray(userOptions.fileMapList)) {
        const fileMapList = userOptions.fileMapList as Array<{ filePath: string; reportTime: number }>;
        for (const fileMap of fileMapList) {
          if (await this.uriExists(vscode.Uri.file(fileMap.filePath))) {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fileMap.filePath));
            const isDirectory = stat.type === vscode.FileType.Directory;
            const key = `simulate_${fileMap.filePath}`;
            const executionRecord: PerformanceExecutionRecord = {
              key,
              title: path.basename(fileMap.filePath),
              timestamp: fileMap.reportTime,
              dirPath: fileMap.filePath,
              marked: markedKeySet.has(key),
              children: isDirectory ? await this.scanSubFiles(vscode.Uri.file(fileMap.filePath)) : [],
            };
            runData.push(executionRecord);
          }
        }
      }
    }

    // Process fileMapList configured on the board
    for (const config of onBoardConfigs) {
      const userOptions = config.user_options as Record<string, unknown> | null;
      if (userOptions && Array.isArray(userOptions.fileMapList)) {
        const fileMapList = userOptions.fileMapList as Array<{ filePath: string; reportTime: number }>;
        for (const fileMap of fileMapList) {
          if (await this.uriExists(vscode.Uri.file(fileMap.filePath))) {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fileMap.filePath));
            const isDirectory = stat.type === vscode.FileType.Directory;
            const key = `onboard_${fileMap.filePath}`;
            const executionRecord: PerformanceExecutionRecord = {
              key,
              title: path.basename(fileMap.filePath),
              timestamp: fileMap.reportTime,
              dirPath: fileMap.filePath,
              marked: markedKeySet.has(key),
              children: isDirectory ? await this.scanSubFiles(vscode.Uri.file(fileMap.filePath)) : [],
            };
            runData.push(executionRecord);
          }
        }
      }
    }

    return runData;
  }

  private async scanSubFiles(parentUri: vscode.Uri): Promise<(PerformanceRunDataFolder | PerformanceRunDataFile)[]> {
    const subPathEntries = await vscode.workspace.fs.readDirectory(parentUri);
    const subDirOrFiles: (PerformanceRunDataFolder | PerformanceRunDataFile)[] =
      [];

    for (const [
      subPath,
      fileType,
    ] of subPathEntries) {
      if (fileType === vscode.FileType.Directory) {
        const subUri = vscode.Uri.joinPath(parentUri, subPath);
        const children = await this.scanSubFiles(subUri);

        if (children.length > 0) {
          subDirOrFiles.push({
            title: subPath,
            children,
          });
        }
      }
      else {
        const fileType = path.extname(subPath)
          .replace(/^\./, '');

        // Show only files with the following suffixes
        if ([
          'csv',
          'bin',
          'json',
        ].includes(fileType)) {
          const filePath = path.join(parentUri.fsPath, subPath);

          subDirOrFiles.push({
            key: filePath,
            title: subPath,
            filePath,
            fileType,
          });
        }
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
