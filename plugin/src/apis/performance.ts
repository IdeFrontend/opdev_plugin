import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from 'shared:/api-types';
import { PerformanceRunData } from 'plugin:/services/performance/PerformanceRunData';

export const performanceMethods = {
  /**
   * 获取性能运行数据
   * @param params 查询参数
   * @returns 运行数据结果
   */
  async getRunData(
    params: GetPerformanceRunDataParams,
  ): Promise<GetPerformanceRunDataResult> {
    const data = await PerformanceRunData.getInstance().queryExecutionRecords(
      params.sort.by,
      params.sort.order,
    );

    return { data };
  },

  /**
   * 切换记录的标记状态
   * @param params 标记参数
   */
  toggleRecordMark(params: MarkRecordParams): void {
    if (params.marked) {
      PerformanceRunData.getInstance().markRecord(params.key);
    } else {
      PerformanceRunData.getInstance().unmarkRecord(params.key);
    }
  },
};
