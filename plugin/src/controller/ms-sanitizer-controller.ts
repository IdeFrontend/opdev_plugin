import { runDataService } from '../service/run-data-service';
import { viewService } from '../service/view-service';

export const msSanitizerMethods = {
  /**
   * 获取异常检测运行数据列表
   * @returns {Promise<any[]>} 运行数据列表
   */
  async getRunData() {
    return await runDataService.getSanitizerRunData();
  },

  /**
   * 切换标记状态
   * @param params
   */
  async toggleMark(params: { id: string }) {
    return await runDataService.toggleSanitizerMark(params);
  },

  /**
   * 打开异常检测数据面板
   * @param params - 参数
   */
  openPanel(params: unknown) {
    viewService.openMsSanitizerPanelView(params);
  },
};
