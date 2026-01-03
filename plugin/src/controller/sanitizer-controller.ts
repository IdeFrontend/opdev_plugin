import { ProjectManager } from '../core/project/project-manager';
import { configService } from '../service/config-service';
import { sanitizerService } from '../service/sanitizer-service';
import {
  GetSanitizerFormResult,
  SaveSanitizerFormParams,
} from 'shared:/api-types';

export const sanitizerViewMethods = {
  /**
   * 获取 Sanitizer 配置
   * @returns Sanitizer 配置对象
   */
  async getSanitizerForm(): Promise<GetSanitizerFormResult> {
    await ProjectManager.getInstance().initProject();
    const configData = await configService.getSanitizerConfigsList();

    return (configData || [])[0] || {};
  },

  /**
   * 保存 Sanitizer 配置
   * @param params 保存参数
   * @returns 更新后的 Sanitizer 配置对象
   */
  async saveSanitizerForm(
    params: SaveSanitizerFormParams,
  ): Promise<GetSanitizerFormResult> {
    await ProjectManager.getInstance().initProject();
    await configService.saveSanitizerForm(params);
    const configData = await configService.getSanitizerConfigsList();

    return (configData || [])[0] || {};
  },

  /**
   * 运行 Sanitizer
   */
  async runSanitizer(): Promise<void> {
    try {
      await ProjectManager.getInstance().initProject();
      await sanitizerService.runSanitizer();
    } finally {
      ProjectManager.getInstance().clearExecutor();
    }
  },
};
