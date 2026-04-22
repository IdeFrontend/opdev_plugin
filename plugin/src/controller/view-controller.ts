import { viewService } from '@plugin/service/view-service';

export const viewMethods = {
  /**
   * Open CSV file preview
   * @param filePath CSV file path
   */
  async openCsvFile(filePath: string) {
    await viewService.openCsvFile(filePath);
  },

  /**
   * Open Insight data view
   * @param filePath Insight data file path
   */
  async openInsight(filePath: string) {
    await viewService.openInsight(filePath);
  },

  /**
   * Open the anomaly detection panel
   */
  openMsSanitizerPanelView() {
    // Compatible with old interfaces, temporarily leave blank or redirect
    // viewService.openMsSanitizerPanelView({});
  },
};
