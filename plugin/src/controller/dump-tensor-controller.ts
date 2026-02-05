import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
} from '@shared/api-types';
import { DumpTensorData } from '@plugin/service/dump-tensor-service';

export const dumpTensorMethods = {
  /**
   * 获取DumpTensor运行结果数据
   * @param params 查询参数
   * @returns 运行数据结果
   */
  async getDumpTensorData(params: GetPerformanceRunDataParams): Promise<GetPerformanceRunDataResult> {
    const data = await DumpTensorData.getInstance()
      .queryExecutionRecords(
        params.sort.by,
        params.sort.order,
      );

    return { data };  
  },
}