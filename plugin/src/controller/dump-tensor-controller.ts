import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
} from '@shared/api-types';
import { DumpTensorData } from '@plugin/service/dump-tensor-service';

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
};
