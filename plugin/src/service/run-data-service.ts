import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { collectSanitizerLogReports } from '@plugin/helpers/sanitizer-log-reports';
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

    const logPath = joinIdeConfigPath(workspacePath, 'mindstudio_sanitizer_log');

    const markSet = getMsSanitizerMarks();

    // Read report files in the log directory; skips empty logs a failed run leaves behind.
    res.push(...collectSanitizerLogReports(logPath, markSet));

    // Read fileMapList: the workspace cache is the source (the import seeds
    // `fileMapLists` on activation, runtime writers extend it).
    const fileMapList: FileMapEntry[] = readWorkspaceCache(workspacePath).fileMapLists?.sanitizer ?? [];

    for (const fileMap of fileMapList) {
      if (fs.existsSync(fileMap.filePath)) {
        const stat = fs.statSync(fileMap.filePath);

        if (stat.isFile()) {
          // Sanitizer only handles files
          const filename = path.basename(fileMap.filePath);
          const id = `sanitizer_${fileMap.filePath}`;

          res.push({
            title: filename,
            timestamp: fileMap.reportTime,
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
