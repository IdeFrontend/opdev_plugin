import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from 'shared:/api-types';

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
