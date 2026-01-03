import { ProjectManager } from '../services/project/project-manager';
import { opsMethods } from './ops';
import {
  GetProjectIdResult,
  GetHomeResult,
  InitOpsParams,
} from 'shared:/api-types';

export const homeMethods = {
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
    return await opsMethods.init(params);
  },
};
