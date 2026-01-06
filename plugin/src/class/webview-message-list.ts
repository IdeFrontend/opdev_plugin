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
  callback: (message: any, that: any)=> void;
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
      if (message.status === 'error') {
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
      vscode.commands.executeCommand('workbench.view.extension.mindstudio-opssuite-vscode-plugin');
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
  progress: vscode.Progress<{ message?: string;
    increment?: number }>,
) {
  console.log('handleOperatorProjectDirectoryFile: 被调用');
  console.log('handleOperatorProjectDirectoryFile: message:', message);
  console.log('handleOperatorProjectDirectoryFile: message 类型:', typeof message);

  if (!message) {
    console.warn('handleOperatorProjectDirectoryFile: message 为空，退出');

    return;
  }

  console.log('handleOperatorProjectDirectoryFile: createOperatorProjectDirectoryFileType:', message.createOperatorProjectDirectoryFileType);

  if (
    message
    && [
      1,
      2,
    ].includes(message.createOperatorProjectDirectoryFileType)
  ) {
    console.log('handleOperatorProjectDirectoryFile: 类型验证通过，开始处理');

    try {
      // 显示连接进度
      progress.report({
        increment: 25,
        message: '开始创建算子文件...',
      });

      if (message.createOperatorProjectDirectoryFileType === 1) {
        // 创建算子（通过原型）
        console.log('开始创建算子原型（类型1）...');
        // 注意：项目已经在 createdProject 中初始化，这里不需要再次初始化
        // 只需要确保 projectId 已设置
        const pm = ProjectManager.getInstance();

        if (!pm.projectId) {
          console.log('projectId 未设置，尝试初始化项目...');
          await pm.ensureProjectId();
        }

        console.log('当前 projectId:', pm.projectId);
        console.log('开始创建算子原型...');

        await welcomeMethods.createOpsByPrototype({
          opsPrototypeFile: '',
          opType: 'cann',
        });
        console.log('算子原型创建完成');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      if (message.createOperatorProjectDirectoryFileType === 2) {
        // 开始链接创建算子
        console.log('开始创建算子（类型2）...');
        // 注意：项目已经在 createdProject 中初始化，这里不需要再次初始化
        // 只需要确保 projectId 已设置
        const pm = ProjectManager.getInstance();

        if (!pm.projectId) {
          console.log('projectId 未设置，尝试初始化项目...');
          await pm.ensureProjectId();
        }

        console.log('当前 projectId:', pm.projectId);
        console.log('开始创建算子原型文件...');

        const opsPrototypeFilePath = await welcomeMethods.createOps({});

        console.log('算子原型文件路径:', opsPrototypeFilePath);

        if (opsPrototypeFilePath) {
          console.log('开始通过原型创建算子工程...');
          await welcomeMethods.createOpsByPrototype({ opsPrototypeFile: opsPrototypeFilePath });
          console.log('通过原型创建算子工程完成');
        }
        else {
          throw new Error('创建算子原型文件失败：返回路径为空');
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      progress.report({
        increment: 100,
        message: '算子文件创建完成',
      });
      vscode.window.showInformationMessage('算子文件创建完成');
    }
    catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error('创建算子文件失败:', error);
      progress.report({
        increment: 100,
        message: '算子文件创建失败',
      });
      vscode.window.showErrorMessage(`创建算子文件失败: ${errorMessage}`);
      throw error;
    }
  }
}

export default webviewMessageList;
