import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { PermanentStorage } from '@plugin/class/permanent-storage';
import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from '@shared/api-types';
import { PerformanceRunData } from '@plugin/core/performance/performance-run-data';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { getConfig } from '@plugin/domain';

const MARKED_STORAGE_KEY = 'msSanitizer_marks';

/**
 * Format timestamp to date string
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date string (YYYYMMDD)
 */
function formatTimestampToYYYYMMDD(timestamp: number): string {
  const date = new Date(timestamp);

  // Validate date
  if (isNaN(date.getTime())) {
    throw new Error(t('runData.invalidTimestamp'));
  }

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString()
    .padStart(2, '0');
  const day = date.getDate()
    .toString()
    .padStart(2, '0');

  return `${year}${month}${day}`;
}

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

    // Get all files under .vscode/mindstudio_sanitizer_log
    const logPath = path.join(
      workspacePath,
      '.vscode/mindstudio_sanitizer_log',
    );

    const markSet = getMsSanitizerMarks();

    // Read files in the log directory
    if (fs.existsSync(logPath)) {
      const allFileNames = await fs.readdirSync(logPath);

      for (const filename of allFileNames) {
        const _filename = filename.replace('.log', '');
        const [
          title,
          timestamp,
        ] = _filename.split('_');

        res.push({
          title: `${title}-${formatTimestampToYYYYMMDD(+timestamp)}`,
          timestamp: +timestamp,
          id: filename,
          path: path.join(logPath, filename),
          marked: markSet.has(filename),
        });
      }
    }

    // Read fileMapList from config
    try {
      await ProjectManager.getInstance()
        .initProject();
      const projectId = ProjectManager.getInstance().projectId;

      if (!projectId) {
        return res;
      }

      const sanitizerConfigs = getConfig(Number(projectId), 'sanitizer');

      for (const config of sanitizerConfigs) {
        const userOptions = config.user_options as Record<string, unknown> | null;

        if (userOptions && Array.isArray(userOptions.fileMapList)) {
          const fileMapList = userOptions.fileMapList as Array<{ filePath: string;
            reportTime: number }>;

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
        }
      }
    }
    catch (error) {
      console.error('Failed to read sanitizer config fileMapList:', error);
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
