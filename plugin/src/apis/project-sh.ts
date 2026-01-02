import { ApiGroup } from 'plugin:/core/ApiServer';
import { ProjectManager } from '../services/project/project-manager';
import { opsApis, OpsApi } from './ops';
import { GetProjectSHResult, UpdateShScriptParams } from 'shared:/api-types';

// 获取正确类型的 ops API
const ops = opsApis.ops as unknown as OpsApi;

export const projectSHApis: ApiGroup = {
  webview: {
    /**
     * 更新脚本文件
     * @param {UpdateShScriptParams} params - 参数
     * @returns {Promise<GetProjectSHResult>} 结果
     */
    async updateShScript(
      params: UpdateShScriptParams,
    ): Promise<GetProjectSHResult> {
      await ProjectManager.getInstance().initProject();

      return await ops.updateShScript(params);
    },
  },
};
