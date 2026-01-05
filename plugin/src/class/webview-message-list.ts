/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';

import { ProjectManager } from '../core/project/project-manager';
import { welcomeMethods } from '../controller/welcome-controller';
import {
  COMMAND_OPEN,
  COMMAND_PROJECT_SH,
  COMMAND_WELCOME,
  COMMAND_CONFIG,
} from '../constants';

export interface messageItem {
  command: string;
  callback: (message: any, that: any) => void;
}

const webviewMessageList: messageItem[] = [
  {
    command: 'alert',
    callback: (message: any) => vscode.window.showErrorMessage(message.text),
  },
  {
    command: 'info',
    callback: (message: any) =>
      vscode.window.showInformationMessage(message.text),
  },
  {
    command: 'loaded',
    callback: (message: any) => {
      if (message.status === 'success') {
      } else if (message.status === 'error') {
        vscode.window.showWarningMessage(`Opsuite加载异常: ${message.message}`);
      }
    },
  },
  {
    command: 'openLinkWebviewPanel',
    callback: (_message: any, _that: any) => {
      vscode.commands.executeCommand(COMMAND_OPEN);
    },
  },
  {
    command: 'vscodeRunSetProjectSH',
    callback: async (_msg: any, _that: any) => {
      vscode.commands.executeCommand(COMMAND_PROJECT_SH);
    },
  },
  {
    command: 'openWelcome',
    callback: (_message: any, _that: any) => {
      vscode.commands.executeCommand(COMMAND_WELCOME);
    },
  },
  {
    command: 'vscodeOpenSidebar',
    callback: (_message: any, _that: any) => {
      vscode.commands.executeCommand(
        'workbench.view.extension.mindstudio-opssuite-vscode-plugin',
      );
    },
  },
  {
    command: 'vscodeOpenConfig',
    callback: async (_msg: any, _that: any) => {
      await vscode.commands.executeCommand(COMMAND_CONFIG);
    },
  },
  {
    command: 'openExternalLink',
    callback: async (message: any) => {
      if (message.url) {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
    },
  },
];

// 创建算子工程类型
// 1 执行 vscodeBuildCreateOps 消息体内逻辑  data: 'cann'
// 2 执行 vscodeStartLinkCreateOps 消息体内逻辑
export async function handleOperatorProjectDirectoryFile(
  message: { createOperatorProjectDirectoryFileType: number } | undefined,
  _that: unknown,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
) {
  console.log('创建算子工程类型', message);
  if (
    message &&
    [1, 2].includes(message.createOperatorProjectDirectoryFileType)
  ) {
    // 显示连接进度
    progress.report({ increment: 25 });
    if (message.createOperatorProjectDirectoryFileType === 1) {
      // 创建算子（通过原型）
      await ProjectManager.getInstance().initProject();
      await welcomeMethods.createOpsByPrototype({
        opsPrototypeFile: '',
        opType: 'cann',
      });
      await vscode.commands.executeCommand(
        'workbench.action.closeActiveEditor',
      );
    }
    if (message.createOperatorProjectDirectoryFileType === 2) {
      // 开始链接创建算子
      await ProjectManager.getInstance().initProject();
      const opsPrototypeFilePath = await welcomeMethods.createOps({});

      console.log('res', opsPrototypeFilePath);
      if (opsPrototypeFilePath) {
        await welcomeMethods.createOpsByPrototype({
          opsPrototypeFile: opsPrototypeFilePath,
        });
      }
      await vscode.commands.executeCommand(
        'workbench.action.closeActiveEditor',
      );
    }
    progress.report({ increment: 100, message: '算子文件创建完成' });
  }
}

export default webviewMessageList;
