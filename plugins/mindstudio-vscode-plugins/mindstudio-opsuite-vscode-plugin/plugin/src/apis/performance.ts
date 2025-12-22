import { ApiGroup } from 'plugin:/core/ApiServer';
import { GetPerformanceRunDataParams, GetPerformanceRunDataResult, MarkRecordParams } from 'shared:/api-types';
import { PerformanceRunData } from 'plugin:/services/performance/PerformanceRunData';

export const performanceApis: ApiGroup = {
  performance: {
    getRunData(params: GetPerformanceRunDataParams): GetPerformanceRunDataResult {
      return { data: PerformanceRunData.getInstance().queryExecutionRecords(params.sort.by, params.sort.order, params.markedOnly) };
    },
    toggleRecordMark(params: MarkRecordParams): void {
      if (params.marked) {
        PerformanceRunData.getInstance().markRecord(params.key);
      } else {
        PerformanceRunData.getInstance().unmarkRecord(params.key);
      }
    },
  },
};
