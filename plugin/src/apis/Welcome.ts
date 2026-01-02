import { ApiGroup } from 'plugin:/core/ApiServer';
import { ProjectManager } from '../services/project/project-manager';
import { opsApis, OpsApi } from './ops';
import { CreateOpsParams, CreateOpsByPrototypeParams } from 'shared:/api-types';

// 获取正确类型的 ops API
const ops = opsApis.ops as unknown as OpsApi;

export const welcomeApis: ApiGroup = {
  webview: {
    /**
     * 创建算子工程
     * @param {CreateOpsParams} params - 参数
     * @returns {Promise<string>} 结果
     */
    async createOps(params: CreateOpsParams): Promise<string> {
      await ProjectManager.getInstance().initProject();

      return await ops.createOps(params);
    },

    /**
     * 通过原型创建算子
     * @param {CreateOpsByPrototypeParams} params - 参数
     */
    async createOpsByPrototype(
      params: CreateOpsByPrototypeParams,
    ): Promise<void> {
      await ProjectManager.getInstance().initProject();
      await ops.createOpsByPrototype(params);
    },
  },
};
