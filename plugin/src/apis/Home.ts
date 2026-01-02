import { ApiGroup } from 'plugin:/core/ApiServer';
import { ProjectManager } from '../services/project/project-manager';
import { opsApis, OpsApi } from './ops';
import {
  GetProjectIdResult,
  GetHomeResult,
  InitOpsParams,
} from 'shared:/api-types';

// 获取正确类型的 ops API
const ops = opsApis.ops as unknown as OpsApi;

export const homeApis: ApiGroup = {
  webview: {
    /**
     * 获取项目ID
     * @returns 项目ID
     */
    async getProjectId(): Promise<GetProjectIdResult> {
      await ProjectManager.getInstance().initProject();

      return ProjectManager.getInstance().projectId;
    },

    /**
     * 初始化项目
     * @param params - 初始化参数
     * @returns 初始化结果
     */
    async initOps(params: InitOpsParams): Promise<GetHomeResult> {
      return await ops.init(params);
    },
  },
};
