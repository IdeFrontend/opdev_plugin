import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from 'shared:/api-types';
import { runDataService } from '../service/run-data-service';

export const performanceMethods = {
  /**
   * 获取性能运行数据
   * @param params 查询参数
   * @returns 运行数据结果
   */
  async getRunData(
    params: GetPerformanceRunDataParams,
  ): Promise<GetPerformanceRunDataResult> {
    return await runDataService.getPerformanceRunData(params);
  },

  /**
   * 切换记录的标记状态
   * @param params 标记参数
   */
  toggleRecordMark(params: MarkRecordParams): void {
    runDataService.togglePerformanceRecordMark(params);
  },
};
