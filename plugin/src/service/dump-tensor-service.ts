/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import path from 'node:path';

import * as vscode from 'vscode';

import {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
  PerformanceRunDataFolder,
} from '@shared/api-types';
import { Project } from '@plugin/core/project/project';
import { joinIdeConfigRelative } from '@plugin/helpers/ide-config-dir';
import { PermanentStorage } from '@plugin/class/permanent-storage';

const getDumpTensorDataRoot = (): string => joinIdeConfigRelative('DumpTensor');

const MARKED_STORAGE_KEY = 'marked_dump_tensor_records';

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

    console.log('dump-tensor-service]: looking up current project', project);

    if (!project.workspaceIsProject()) {
      return;
    }

    this.rootUri = vscode.Uri.joinPath(
      vscode.Uri.file(project.projectPath),
      getDumpTensorDataRoot(),
    );
  }

  /**
   * Read dumpTensor execution record
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

    const executionEntries = await vscode.workspace.fs.readDirectory(this.rootUri);

    console.log('dump-tensor-service]: scanning dumpTensor output directory', executionEntries);

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
        if (['bin'].includes(fileType)) {
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
