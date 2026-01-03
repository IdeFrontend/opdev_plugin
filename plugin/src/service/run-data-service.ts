import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { PermanentStorage } from 'plugin:/class/permanent-storage';
import { GetPerformanceRunDataParams, GetPerformanceRunDataResult, MarkRecordParams } from 'shared:/api-types';
import { PerformanceRunData } from '../core/performance/performance-run-data';

const MARKED_STORAGE_KEY = 'msSanitizer_marks';

/**
 * 格式化时间戳
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的日期字符串 (YYYYMMDD)
 */
function formatTimestampToYYYYMMDD(timestamp: number): string {
  const date = new Date(timestamp);

  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    throw new Error('无效的时间戳');
  }

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * 获取标记的记录
 * @returns {Set<string>} 标记集合
 */
function getMsSanitizerMarks() {
  const storageValue = PermanentStorage.getInstance().get<string[]>(
    MARKED_STORAGE_KEY,
    [],
  );

  return new Set(storageValue);
}

/**
 * 设置标记记录
 * @param {string[]} vals - 标记列表
 */
function setMsSanitizerMarks(vals: string[]) {
  PermanentStorage.getInstance().set<string[]>(MARKED_STORAGE_KEY, [...vals]);
}

export class RunDataService {
  /**
   * 获取性能运行数据
   */
  async getPerformanceRunData(
    params: GetPerformanceRunDataParams,
  ): Promise<GetPerformanceRunDataResult> {
    const data = await PerformanceRunData.getInstance().queryExecutionRecords(
      params.sort.by,
      params.sort.order,
    );

    return { data };
  }

  /**
   * 切换性能记录的标记状态
   */
  togglePerformanceRecordMark(params: MarkRecordParams): void {
    if (params.marked) {
      PerformanceRunData.getInstance().markRecord(params.key);
    } else {
      PerformanceRunData.getInstance().unmarkRecord(params.key);
    }
  }

  /**
   * 获取异常检测运行数据列表
   */
  async getSanitizerRunData() {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    // 获取目录下.vscode/mindstudio_sanitizer_log文件夹中的所有文件
    const logPath = path.join(
      workspacePath,
      '.vscode/mindstudio_sanitizer_log',
    );

    // 文件夹不存在
    if (!fs.existsSync(logPath)) {
      return [];
    }

    const allFileNames = await fs.readdirSync(logPath);

    const markSet = getMsSanitizerMarks();
    const res = allFileNames.map((filename) => {
      const _filename = filename.replace('.log', '');
      const [title, timestamp] = _filename.split('_');

      return {
        title: `${title}-${formatTimestampToYYYYMMDD(+timestamp)}`,
        timestamp: +timestamp,
        id: filename,
        path: path.join(logPath, filename),
        marked: markSet.has(filename),
      };
    });

    return res;
  }

  /**
   * 切换异常检测标记状态
   */
  async toggleSanitizerMark(params: { id: string }) {
    const { id } = params;
    // 修改mark标记状态
    const markSet = getMsSanitizerMarks();

    if (markSet.has(id)) {
      markSet.delete(id);
    } else {
      markSet.add(id);
    }
    setMsSanitizerMarks([...markSet]);

    return;
  }
}

export const runDataService = new RunDataService();
