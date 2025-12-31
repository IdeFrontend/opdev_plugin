/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Project } from '../services/project/Project';

import { CommandExecutor } from './CommandOptions';
import { OpsAPI } from '../helpers/OpsAPI';
import { getFiles } from '../../autogen-server';
import { InsightDataViewerPanel } from './InsightDataViewerPanel';

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
    callback: (message: any) => vscode.window.showInformationMessage(message.text),
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
      vscode.commands.executeCommand('huawei-op-devtools.open');
    },
  },
  {
    command: 'vscodeRunSetProjectSH',
    callback: async (msg: any, that: any) => {
      vscode.commands.executeCommand('huawei-op-devtools.projectSH');
    },
  },
  {
    command: 'openWelcome',
    callback: (message: any, that: any) => {
      vscode.commands.executeCommand('huawei-op-devtools.welcome');
    },
  },
  {
    command: 'vscodeOpenSidebar',
    callback: (message: any, that: any) => {
      vscode.commands.executeCommand('workbench.view.extension.mindstudio-opssuite-vscode-plugin');
    },
  },
  {
    command: 'vscodeOpenConfig',
    callback: async (msg: any, that: any) => {
      await vscode.commands.executeCommand('huawei-op-devtools.config');
    },
  },
];

// 创建算子工程类型
// 1 执行 vscodeBuildCreateOps 消息体内逻辑  data: 'cann'
// 2 执行 vscodeStartLinkCreateOps 消息体内逻辑
export async function handleOperatorProjectDictoryFile(message: any | undefined, that: any, progress: any) {
  console.log('创建算子工程类型', message);
  if ([1, 2].includes(message.createOperatorProjectDictoryFileType)) {
    // 显示连接进度
    progress.report({ increment: 25 });
    if (message.createOperatorProjectDictoryFileType === 1) {
      // 创建算子（通过原型）
      await OpsAPI.init();
      await OpsAPI.createOpsByPrototype('', 'cann');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
    if (message.createOperatorProjectDictoryFileType === 2) {
      // 开始链接创建算子
      await OpsAPI.init();
      const opsPrototypeFilePath = await OpsAPI.createOps();
      console.log('res', opsPrototypeFilePath);
      if (opsPrototypeFilePath) {
        await OpsAPI.createOpsByPrototype(opsPrototypeFilePath);
      }
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
    progress.report({ increment: 100, message: '算子文件创建完成' });
  }
}


export default webviewMessageList;
