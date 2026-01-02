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
        // 异常检测前编译
        await ops.startBuild({ compileOption: '--mssanitizer' });
        // 创建文件夹
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
          throw new Error('No workspace folder found');
        }
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const logPath = path.join(
          workspacePath,
          '.vscode/mindstudio_sanitizer_log',
        );

        if (!fs.existsSync(logPath)) {
          fs.mkdirSync(logPath, { mode: 0o750 });
        }
        // 开启异常检测
        await ops.runSanitizer();
        // 执行完检测后，获取最新的列表数据
        vscode.commands.executeCommand(
          'huawei-op-devtools.flashMsSanitizerRunData',
        );
      } finally {
        ProjectManager.getInstance().clearExecutor();
      }
    },
  },
};
