/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import {
  collectSanitizerLogReports,
  parseSanitizerLogTimestamp,
} from '@plugin/helpers/sanitizer-log-reports';
import { SANITIZER_LOG_DIR_NAMES } from '@plugin/domain/services/command-strategy/sanitizer-option-guards';
import {
  FileMapEntry,
  readWorkspaceCache,
} from '@plugin/helpers/workspace-cache';

import { PermanentStorage } from '@plugin/class/permanent-storage';
import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from '@shared/api-types';
import { PerformanceRunData } from '@plugin/core/performance/performance-run-data';

const MARKED_STORAGE_KEY = 'msSanitizer_marks';

/**
 * Get marked records
 * @returns {Set<string>} Set of marked IDs
 */
function getMsSanitizerMarks() {
  const storageValue = PermanentStorage.getInstance()
    .get<string[]>(
      MARKED_STORAGE_KEY,
      [],
    );

  return new Set(storageValue);
}

/**
 * Set marked records
 * @param {string[]} vals - List of marked IDs
 */
function setMsSanitizerMarks(vals: string[]) {
  PermanentStorage.getInstance()
    .set<string[]>(MARKED_STORAGE_KEY, [...vals]);
}

export class RunDataService {
  /**
   * Get performance run data
   */
  async getPerformanceRunData(params: GetPerformanceRunDataParams): Promise<GetPerformanceRunDataResult> {
    const data = await PerformanceRunData.getInstance()
      .queryExecutionRecords(
        params.sort.by,
        params.sort.order,
      );

    return { data };
  }

  /**
   * Toggle performance record mark state
   */
  togglePerformanceRecordMark(params: MarkRecordParams): void {
    if (params.marked) {
      PerformanceRunData.getInstance()
        .markRecord(params.key);
    }
    else {
      PerformanceRunData.getInstance()
        .unmarkRecord(params.key);
    }
  }

  /**
   * Get sanitizer (anomaly detection) run data list
   */
  async getSanitizerRunData() {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const res: Array<{
      title: string;
      timestamp: number;
      id: string;
      path: string;
      marked: boolean;
    }> = [];

    const markSet = getMsSanitizerMarks();

    // Read report files from every sanitizer log directory (mssanitizer keeps
    // `mindstudio_sanitizer_log`, npu-check writes `npu-check-log`); skips empty
    // logs a failed run leaves behind. Results stay flat — the final sort below
    // orders them by run time.
    for (const dirName of SANITIZER_LOG_DIR_NAMES) {
      res.push(...collectSanitizerLogReports(joinIdeConfigPath(workspacePath, dirName), markSet));
    }

    // Read fileMapList: the workspace cache is the source (the import seeds
    // `fileMapLists` on activation, runtime writers extend it).
    const fileMapList: FileMapEntry[] = readWorkspaceCache(workspacePath).fileMapLists?.sanitizer ?? [];

    for (const fileMap of fileMapList) {
      if (fs.existsSync(fileMap.filePath)) {
        const stat = fs.statSync(fileMap.filePath);

        if (stat.isFile()) {
          // Sanitizer only handles files; the title is the file name itself.
          // `mssanitizer_<ts>.log` / `npu-check_<ts>.log` names still contribute
          // their embedded run timestamp so the list stays sorted by run time.
          const filename = path.basename(fileMap.filePath);
          const id = `sanitizer_${fileMap.filePath}`;
          const logTimestamp = parseSanitizerLogTimestamp(filename);

          res.push({
            title: filename,
            timestamp: logTimestamp ?? fileMap.reportTime,
            id,
            path: fileMap.filePath,
            marked: markSet.has(id),
          });
        }
      }
    }

    // Sort by time
    return res.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Toggle sanitizer mark state
   */
  async toggleSanitizerMark(params: { id: string }) {
    const { id } = params;
    // Update mark state
    const markSet = getMsSanitizerMarks();

    if (markSet.has(id)) {
      markSet.delete(id);
    }
    else {
      markSet.add(id);
    }

    setMsSanitizerMarks([...markSet]);

    return;
  }
}

export const runDataService = new RunDataService();
