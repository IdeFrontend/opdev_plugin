import { GetPerformanceRunDataParams, GetPerformanceRunDataResult } from 'shared:/api-types';

import { request } from '@/core/request';

/** 获取性能调优运行记录 */
export function getPerformanceRunData(params: GetPerformanceRunDataParams) {
  return request.post<GetPerformanceRunDataParams, GetPerformanceRunDataResult>('performance/getRunData', params);
}
