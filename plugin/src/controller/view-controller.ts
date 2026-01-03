import { viewService } from '../service/view-service';

export const viewMethods = {
  /**
   * 打开 CSV 文件预览
   * @param filePath CSV 文件路径
   */
  async openCsvFile(filePath: string) {
    await viewService.openCsvFile(filePath);
  },

  /**
   * 打开 Insight 数据视图
   * @param filePath Insight 数据文件路径
   */
  async openInsight(filePath: string) {
    await viewService.openInsight(filePath);
  },

  /**
   * 打开异常检测面板
   */
  openMsSanitizerPanelView() {
    // 兼容旧接口，暂时留空或重定向
    // viewService.openMsSanitizerPanelView({});
  },
};
