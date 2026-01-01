import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { CommandExecutor } from 'plugin:/class/CommandOptions';
import { OpsAPI } from '../helpers/OpsAPI';
import {
  GetSanitizerFormResult,
  SaveSanitizerFormParams,
  RunSanitizerParams,
} from 'shared:/api-types';

// 全局任务管理器：用于追踪和终止正在执行的任务
let currentExecutor: CommandExecutor | null = null;

export const msSanitizerPanelViewApis: ApiGroup = {
  webview: {
    /**
     * 获取 Sanitizer 配置
     * @returns Sanitizer 配置对象
     */
    async getSanitizerForm(): Promise<GetSanitizerFormResult> {
      await OpsAPI.init();
      const configData = await OpsAPI.getSanitizerConfigs();

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
      await OpsAPI.init();
      await OpsAPI.saveSanitizerForm(params.data);
      const configData = await OpsAPI.getSanitizerConfigs();

      return (configData || [])[0] || {};
    },

    /**
     * 运行 Sanitizer
     * @param params - 运行参数
     */
    async runSanitizer(params: RunSanitizerParams): Promise<void> {
      try {
        await OpsAPI.init();
        // 保存当前 executor 引用
        currentExecutor = OpsAPI.getExecutor();
        // 异常检测前编译
        await OpsAPI.startBuild(undefined, '--mssanitizer');
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
        await OpsAPI.runSanitizer();
        // 执行完检测后，获取最新的列表数据
        vscode.commands.executeCommand(
          'huawei-op-devtools.flashMsSanitizerRunData',
        );
      } finally {
        // 清除 executor 引用
        currentExecutor = null;
      }
    },
  },
};
