import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
} from '@shared/api-types';

import { request } from '@/core/request';

export function diffFiles(params: { filePath1: string; filePath2: string }) {
  return request.post<{ filePath1: string; filePath2: string }, void>('performance/diffFiles', params);
}

export function getDumpTensorData(params: GetPerformanceRunDataParams) {
  return request.post<GetPerformanceRunDataParams, GetPerformanceRunDataResult>('webview/getDumpTensorData', params);
}

export function openFile(params: { file: string }) {
  return request.post<{ file: string }, void>('webview/openFile', params);
}
