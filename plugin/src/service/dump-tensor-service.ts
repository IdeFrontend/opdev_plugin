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

// DumpTensor产物存放位置
const DUMP_TENSOR_DATA_ROOT = '.vscode/DumpTensor';

export class DumpTensorData {
  private static instance: DumpTensorData;

  static getInstance(): DumpTensorData {
    if (!DumpTensorData.instance) {
      DumpTensorData.instance = new DumpTensorData();
    }

    return DumpTensorData.instance;
  }

  private readonly rootUri?: vscode.Uri;

  constructor() {
    const project = Project.getInstance();
    console.log('dump-tensor-service]: 查找当前项目', project)

    if (!project.workspaceIsProject()) {
      return;
    }

    this.rootUri = vscode.Uri.joinPath(
      vscode.Uri.file(project.projectPath),
      DUMP_TENSOR_DATA_ROOT,
    );
  }

  /**
   * 读取dumpTensor执行记录
   */
  public async queryExecutionRecords(
    sortBy: 'timestamp',
    order: 'asc' | 'desc',
  ): Promise<PerformanceExecutionRecord[]> {
    const records = await this.scanRunDataDirectory();

    return records.sort((a, b) =>
      order === 'asc' ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy]);
  }


  private async scanRunDataDirectory() {
    const runData: PerformanceExecutionRecord[] = [];

    if (!this.rootUri || !(await this.uriExists(this.rootUri))) {
      return runData;
    }

    const executionEntries = await vscode.workspace.fs.readDirectory(this.rootUri);
    console.log('dump-tensor-service]: 扫描dumpTensor产物目录', executionEntries)

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
        marked: false,
        children: await this.scanSubFiles(recordUri),
      };

      runData.push(executionRecord);
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

        // 仅显示以下后缀的文件
        if ([
          'txt',
          'bin',
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
