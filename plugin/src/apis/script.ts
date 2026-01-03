import { ProjectManager } from '../services/project/project-manager';
import { opsMethods } from './ops';
import { GetProjectSHResult, UpdateShScriptParams } from 'shared:/api-types';

export const scriptMethods = {
  /**
   * 更新脚本文件
   * @param params 更新参数
   * @returns 更新结果
   */
  async updateShScript(
    params: UpdateShScriptParams,
  ): Promise<GetProjectSHResult> {
    await ProjectManager.getInstance().initProject();

    return await opsMethods.updateShScript(params);
  },
};

