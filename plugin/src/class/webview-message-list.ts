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
  callback: Function;
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
    callback: (message: any, that: any) => {
      vscode.commands.executeCommand(COMMAND_OPEN);
    },
  },
  {
    command: 'vscodeRunSetProjectSH',
    callback: async (msg: any, that: any) => {
      vscode.commands.executeCommand(COMMAND_PROJECT_SH);
    },
  },
  {
    command: 'openWelcome',
    callback: (message: any, that: any) => {
      vscode.commands.executeCommand(COMMAND_WELCOME);
    },
  },
  {
    command: 'vscodeOpenSidebar',
    callback: (message: any, that: any) => {
      vscode.commands.executeCommand(
        'workbench.view.extension.mindstudio-opssuite-vscode-plugin',
      );
    },
  },
  {
    command: 'vscodeOpenConfig',
    callback: async (msg: any, that: any) => {
      await vscode.commands.executeCommand(COMMAND_CONFIG);
    },
  },
];

// 创建算子工程类型
// 1 执行 vscodeBuildCreateOps 消息体内逻辑  data: 'cann'
// 2 执行 vscodeStartLinkCreateOps 消息体内逻辑
export async function handleOperatorProjectDictoryFile(
  message: any | undefined,
  that: any,
  progress: any,
) {
  console.log('创建算子工程类型', message);
  if ([1, 2].includes(message.createOperatorProjectDictoryFileType)) {
    // 显示连接进度
    progress.report({ increment: 25 });
    if (message.createOperatorProjectDictoryFileType === 1) {
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
    if (message.createOperatorProjectDictoryFileType === 2) {
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
