import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from '@shared/api-types';
import { DumpTensorData } from '@plugin/service/dump-tensor-service';
import { performanceMethods } from '@plugin/controller/performance-data-controller';

export const dumpTensorMethods = {
  /**
   * Get DumpTensor operation result data
   * @param params query parameters
   * @returns running data results
   */
  async getDumpTensorData(params: GetPerformanceRunDataParams): Promise<GetPerformanceRunDataResult> {
    const data = await DumpTensorData.getInstance()
      .queryExecutionRecords(
        params.sort.by,
        params.sort.order,
      );

    return { data };
  },

  /**
   * Toggle the marking status of a record
   * @param params mark parameters
   */
  toggleRecordMark(params: MarkRecordParams): void {
    if (params.marked) {
      DumpTensorData.getInstance()
        .markRecord(params.key);
    }
    else {
      DumpTensorData.getInstance()
        .unmarkRecord(params.key);
    }
  },

  downloadReport: performanceMethods.downloadReport,
  diffFiles: performanceMethods.diffFiles,
};
