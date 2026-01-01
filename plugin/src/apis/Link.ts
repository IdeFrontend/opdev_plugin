import * as vscode from 'vscode';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { OpsAPI } from '../helpers/OpsAPI';
import {
  BuildCreateOpsParams,
  StartLinkCreateOpsParams,
} from 'shared:/api-types';

// 辅助函数：获取 extension context
function getExtensionContext(): vscode.ExtensionContext {
  return (globalThis as any).extensionContext;
}

export const linkApis: ApiGroup = {
  webview: {
    // 创建算子（通过原型）
    async buildCreateOps(params: BuildCreateOpsParams): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.createOpsByPrototype('', 'cann');
      await vscode.commands.executeCommand(
        'workbench.action.closeActiveEditor',
      );
    },

    // 开始链接创建算子
    async startLinkCreateOps(params: StartLinkCreateOpsParams): Promise<void> {
      const context = getExtensionContext();

      if (!params.fileName && !params.value) {
        await OpsAPI.init();
        const opsPrototypeFilePath = await OpsAPI.createOps();

        console.log('res', opsPrototypeFilePath);
        if (opsPrototypeFilePath) {
          await OpsAPI.createOpsByPrototype(opsPrototypeFilePath);
        }
        await vscode.commands.executeCommand(
          'workbench.action.closeActiveEditor',
        );

        return;
      }
      // 开始传入
      if (params.fileName && params.value) {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
          throw new Error('请先打开一个工作区');
        }

        const workspacePath = workspaceFolders[0].uri;
        const filePath = vscode.Uri.joinPath(workspacePath, params.fileName);

        try {
          // 检查文件是否存在
          try {
            await vscode.workspace.fs.stat(filePath);

            // 询问是否覆盖
            const choice = await vscode.window.showWarningMessage(
              `文件 ${params.fileName} 已存在，是否覆盖？`,
              { modal: true },
              '覆盖',
              '取消',
            );

            if (choice !== '覆盖') {
              return;
            }
          } catch {
            // 文件不存在，继续
          }

          // 写入文件
          await vscode.workspace.fs.writeFile(
            filePath,
            new TextEncoder().encode(params.value),
          );

          vscode.window.showInformationMessage(
            `文件 ${params.fileName} 创建成功`,
          );

          // 可选：格式化JSON
          try {
            const formattedValue = JSON.stringify(
              JSON.parse(params.value),
              null,
              2,
            );

            await vscode.workspace.fs.writeFile(
              filePath,
              new TextEncoder().encode(formattedValue),
            );
          } catch {
            // 如果不是有效的JSON，保持原样
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(`创建文件失败: ${error.message}`);
          throw error;
        }
      }
    },
  },
};
