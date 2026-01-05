import path from 'node:path';

import * as vscode from 'vscode';

import {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
  PerformanceRunDataFolder,
} from 'shared:/api-types';
import { PermanentStorage } from 'plugin:/class/permanent-storage';
import { Project } from '../project/project';
import { getConfig } from '../../domain';
import { getOpByProjectIdAndOpName } from '../../domain/models/model';

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
      // 如果项目没有 build_op 配置（例如非插件创建的项目），不进行任何处理
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
   * 读取性能调优执行记录
   */
  public async queryExecutionRecords(
    sortBy: 'timestamp',
    order: 'asc' | 'desc',
  ): Promise<PerformanceExecutionRecord[]> {
    const markedKeySet = this.queryMarkedRecordKeySet();
    const records = await this.scanRunDataDirectory(markedKeySet);

    return records.sort((a, b) =>
      order === 'asc' ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy],
    );
  }

  /**
   * 标记
   */
  public markRecord(key: string): void {
    const keySet = this.queryMarkedRecordKeySet();

    keySet.add(key);
    PermanentStorage.getInstance().set<string[]>(MARKED_STORAGE_KEY, [
      ...keySet,
    ]);
  }

  /**
   * 取消标记
   */
  public unmarkRecord(key: string): void {
    const keySet = this.queryMarkedRecordKeySet();

    keySet.delete(key);
    PermanentStorage.getInstance().set<string[]>(MARKED_STORAGE_KEY, [
      ...keySet,
    ]);
  }

  /**
   * 查询已有标记
   */
  private queryMarkedRecordKeySet(): Set<string> {
    const storageValue = PermanentStorage.getInstance().get<string[]>(
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
    const executionEntries = await vscode.workspace.fs.readDirectory(
      this.rootUri,
    );

    for (const [subPath, fileType] of executionEntries) {
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

    return runData;
  }

  private async scanSubFiles(
    parentUri: vscode.Uri,
  ): Promise<(PerformanceRunDataFolder | PerformanceRunDataFile)[]> {
    const subPathEntries = await vscode.workspace.fs.readDirectory(parentUri);
    const subDirOrFiles: (PerformanceRunDataFolder | PerformanceRunDataFile)[] =
      [];

    for (const [subPath, fileType] of subPathEntries) {
      if (fileType === vscode.FileType.Directory) {
        const subUri = vscode.Uri.joinPath(parentUri, subPath);
        const children = await this.scanSubFiles(subUri);

        if (children.length > 0) {
          subDirOrFiles.push({ title: subPath, children });
        }
      } else {
        const fileType = path.extname(subPath).replace(/^\./, '');

        // 仅显示以下后缀的文件
        if (['csv', 'bin', 'json'].includes(fileType)) {
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
    } catch {
      return false;
    }
  }
}
