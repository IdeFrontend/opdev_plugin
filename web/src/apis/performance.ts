import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from '@shared/api-types';

import { request } from '@/core/request';

/** 获取性能调优运行记录 */
export function getPerformanceRunData(params: GetPerformanceRunDataParams) {
  return request.post<GetPerformanceRunDataParams, GetPerformanceRunDataResult>(
    'performance/getRunData',
    params,
  );
}

/** 标记/取消标记 */
export function toggleRecordMark(params: MarkRecordParams) {
  return request.post<MarkRecordParams, void>(
    'performance/toggleRecordMark',
    params,
  );
}

/** 复制报告内容到剪贴板 */
export function copyPerformanceReport(params: { dirPath: string }) {
  return request.post<{ dirPath: string }, void>('performance/copyReport', params);
}

/** 下载报告文件（目录） */
export function downloadPerformanceReport(params: { dirPath: string }) {
  return request.post<{ dirPath: string }, void>('performance/downloadReport', params);
}

export function diffFiles(params: { filePath1: string,
  filePath2: string }) {
  return request.post<{ filePath1: string,
    filePath2: string }, void>('performance/diffFiles', params);
}

export function getDumpTensorData(params: GetPerformanceRunDataParams) {
  return request.post<GetPerformanceRunDataParams, GetPerformanceRunDataResult>('webview/getDumpTensorData', params);
}

export function openFile(params: { file: string }) {
  return request.post<{ file: string }, void>('webview/openFile', params);
}
