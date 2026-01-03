import { ProjectManager } from '../services/project/project-manager';
import { projectService } from '../service/project-service';
import { CreateOpsParams, CreateOpsByPrototypeParams } from 'shared:/api-types';

export const welcomeMethods = {
  /**
   * 创建算子工程
   * @param params - 参数
   * @returns 结果
   */
  async createOps(params: CreateOpsParams): Promise<string> {
    await ProjectManager.getInstance().initProject();

    return await projectService.createOps(params);
  },

  /**
   * 通过原型创建算子
   * @param params - 参数
   */
  async createOpsByPrototype(
    params: CreateOpsByPrototypeParams,
  ): Promise<void> {
    await ProjectManager.getInstance().initProject();
    await projectService.createOpsByPrototype(params);
  },
};


