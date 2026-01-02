import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { ProjectManager } from '../services/project/project-manager';
import { opsApis, OpsApi } from './ops';
import {
  GetSanitizerFormResult,
  SaveSanitizerFormParams,
} from 'shared:/api-types';

// 获取正确类型的 ops API
const ops = opsApis.ops as unknown as OpsApi;

export const msSanitizerPanelViewApis: ApiGroup = {
  webview: {
    /**
     * 获取 Sanitizer 配置
     * @returns Sanitizer 配置对象
     */
    async getSanitizerForm(): Promise<GetSanitizerFormResult> {
      await ProjectManager.getInstance().initProject();
      const configData = await ops.getSanitizerConfigs();

      return (configData || [])[0] || {};
    },

    /**
     * 保存 Sanitizer 配置
     * @param  params - 保存参数
     * @returns 更新后的 Sanitizer 配置对象
     */
    async saveSanitizerForm(
      params: SaveSanitizerFormParams,
    ): Promise<GetSanitizerFormResult> {
      await ProjectManager.getInstance().initProject();
      await ops.saveSanitizerForm(params);
      const configData = await ops.getSanitizerConfigs();

      return (configData || [])[0] || {};
    },

    /**
     * 运行 Sanitizer
     */
    async runSanitizer(): Promise<void> {
      try {
        await ProjectManager.getInstance().initProject();
        await ops.runSanitizer();
      } finally {
        ProjectManager.getInstance().clearExecutor();
      }
    },
  },
};
