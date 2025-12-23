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
import OpsOption from './OpsOption';
import { getFiles } from '../../autogen-server';
import { InsightDataViewerPanel } from './InsightDataViewerPanel';

// 跟踪已打开的CSV文件目录
const openedCsvDirectories = new Map<string, vscode.Uri>();

const tempObj = { currentActiveConfig: '' };

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
    command: 'vscodeStartLinkCreateOps',
    callback: async (message: any, that: any) => {
      console.log('message-------', message);

      vscodeStartLinkCreateOps(message.message.data, that);
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
    command: 'vscodeGetProjectId',
    callback: async (message: any, that: any) => {
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      that.panel.webview.postMessage({
        command: 'iframeSetProjectId',
        data: opsOption.projectId,
      });
    },
  },
  {
    command: 'vscodeGetHome',
    callback: async (message: any, that: any) => {
      console.log(process.env.HOME, 'GET');
      that.panel.webview.postMessage({
        command: 'iframeSetHome',
        data: process.env.HOME,
      });
    },
  },
  {
    command: 'vscodeGetBuildConfig',
    callback: async (message: any, that: any) => {
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      const configData = await opsOption.getConfigData();
      that.panel.webview.postMessage({
        command: 'iframeSetBuildConfigItem',
        data: JSON.stringify(configData),
      });
    },
  },
  {
    command: 'vscodeSaveBuildConfig',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.saveBuildConfig(data);
      const configData = await opsOption.getConfigData();
      that.panel.webview.postMessage({
        command: 'iframeSetBuildConfigItem',
        data: JSON.stringify(configData),
      });
    },
  },
  {
    command: 'vscodeSaveAndStartBuild',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.saveBuildConfig(data, false);
      const configData = await opsOption.getConfigData();
      that.panel.webview.postMessage({
        command: 'iframeSetBuildConfigItem',
        data: JSON.stringify(configData),
      });
      const config_id = data.find((v: any) => v.config_type === 'build_op').config_id;
      await opsOption.startBuild(config_id);
    },
  },
  {
    command: 'vscodeSaveAndStartBuildExample',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.saveBuildConfig(data, false);
      const config_id = data.find((v: any) => v.config_type === 'build_example').config_id;
      await opsOption.startBuildExample(config_id);
    },
  },
  {
    command: 'vscodeGetProjectIdBoard',
    callback: async (message: any, that: any) => {
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      that._view.webview.postMessage({
        command: 'iframeSetProjectId',
        data: opsOption.projectId,
      });
    },
  },
  {
    command: 'vscodeGetBuildConfigBoard',
    callback: async (message: any, that: any) => {
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      const configData = await opsOption.getConfigData();
      that._view.webview.postMessage({
        command: 'iframeSetBuildConfigItem',
        data: JSON.stringify(configData),
      });
    },
  },
  // 查询 Sanitizer 配置
  {
    command: 'vscodeGetSanitizerForm',
    callback: async (message: any, that: any) => {
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      const configData = await opsOption.getSanitizerConfigs();
      console.log('SetSanitizerForm', configData);

      that._view.webview.postMessage({
        command: 'iframeSetSanitizerForm',
        data: JSON.stringify((configData || [])[0]),
      });
    },
  },
  // 保存 Sanitizer 配置
  {
    command: 'vscodeSaveSanitizerForm',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.saveSanitizerForm(data);
      const configData = await opsOption.getSanitizerConfigs();
      that.panel.webview.postMessage({
        command: 'iframeSetBuildConfigItem',
        data: JSON.stringify((configData || [])[0]),
      });
    },
  },
  {
    command: 'vscodeRemotePathSearch',
    callback: async (msg: any, that: any) => {
      const message = msg.message;
      const res = getFiles(message.keyword);
      that.panel.webview.postMessage({
        command: 'iframeRemoteSearchResult',
        data: {
          type: message.type,
          list: res,
        },
      });
    },
  },
  {
    command: 'vscodeCreatedProject',
    callback: async (msg: any, that: any) => {
      
      const message = msg.message.data;
      // 标准算子projectPath需增加 /ops-math/math路径
      let originPath;
      if (message.createOperatorProjectDictoryFileType === 2) {
        originPath = message.projectPath;
        message.projectPath += '/ops-math/math';
      }
      vscode.window.showInformationMessage(`初始化中`);

      const executor = new CommandExecutor();

      // 标准算子解压缩
      if (message.createOperatorProjectDictoryFileType === 2) {
        await executor.execute(`mkdir -p ${originPath}`, ['File exists']);
        const zipUrl = path.resolve(that.context.extensionPath, `out/templates/code_template/op-math/ops-math.zip`);
        await executor.execute(`unzip -o ${zipUrl} -d ${originPath}`);
      }
      await executor.execute(`mkdir -p ${message.projectPath}/${message.projectName}`, ['File exists']);
      if (message.projectSH) {
        await executor.execute(`chmod +x ${message.projectSH}`);
        await executor.execute(`${message.projectSH}`);
      }
      const opsOption = new OpsOption(that.context);
      await opsOption.init(message.projectSH, message.projectPath, message.projectName);
      await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(`${message.projectPath}/${message.projectName}`));

      (that.context as vscode.ExtensionContext).globalState.update('runCommand', 'huawei-op-devtools.createDictory');
      (that.context as vscode.ExtensionContext).globalState.update('runCommand-param', message.createOperatorProjectDictoryFileType);
    },
  },
  {
    command: 'vscodeCreatedProject',
    callback: async (msg: any, that: any) => {
      const message = msg.message.data;
      // 标准算子projectPath需增加 /ops-math/math路径
      let originPath;
      if (message.createOperatorProjectDictoryFileType === 2) {
        originPath = message.projectPath;
        message.projectPath += '/ops-math/math';
      }
      vscode.window.showInformationMessage(`初始化中`);

      const executor = new CommandExecutor();

      // 标准算子解压缩
      if (message.createOperatorProjectDictoryFileType === 2) {
        await executor.execute(`mkdir -p ${originPath}`, ['File exists']);
        const zipUrl = path.resolve(that.context.extensionPath, `out/templates/code_template/op-math/ops-math.zip`);
        await executor.execute(`unzip -o ${zipUrl} -d ${originPath}`);
      }
      await executor.execute(`mkdir -p ${message.projectPath}/${message.projectName}`, ['File exists']);
      if (message.projectSH) {
        await executor.execute(`chmod +x ${message.projectSH}`);
        await executor.execute(`${message.projectSH}`);
      }
      const opsOption = new OpsOption(that.context);
      await opsOption.init(message.projectSH, message.projectPath, message.projectName);
      await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(`${message.projectPath}/${message.projectName}`));
      // 规范化路径
      const normalizedProjectPath = path.normalize(message.projectPath);
      const normalizedProjectName = path.normalize(message.projectName);
      const fullProjectPath = path.join(normalizedProjectPath, normalizedProjectName);

      (that.context as vscode.ExtensionContext).globalState.update('runCommand', 'huawei-op-devtools.createDictory');
      (that.context as vscode.ExtensionContext).globalState.update('runCommand-param', message.createOperatorProjectDictoryFileType);

      // 在远程环境中，我们可以直接打开本地路径（相对于远程系统）
      const localUri = vscode.Uri.file(fullProjectPath);
      console.log('vscode.openFolder，打开新目录', localUri);

      // 询问用户是在当前窗口打开还是新窗口打开
      const choice = await vscode.window.showInformationMessage(
        '选择打开方式',
        { modal: true },
        '当前窗口',
        '新窗口'
      );

      // 如果用户取消了选择，则不执行打开操作
      if (!choice) {
        return;
      }

      const forceNewWindow = choice === '新窗口';

      // 如果用户取消了选择，则不打开文件夹
      try {
        await vscode.commands.executeCommand('vscode.openFolder', localUri, {
          forceNewWindow: forceNewWindow,
        });
        vscode.window.showInformationMessage(`打开算子工程目录成功`);
      } catch (e) {
        vscode.window.showInformationMessage(`打开算子工程目录失败: ${e}`);
      }
    },
  },
  {
    command: 'vscodeSetActiveConfig',
    callback: async (msg: any, that: any) => {
      tempObj.currentActiveConfig = msg.message.data;
    },
  },
  {
    command: 'vscodeOpenConfig',
    callback: async (msg: any, that: any) => {
      tempObj.currentActiveConfig = msg.message.data;
      await vscode.commands.executeCommand('huawei-op-devtools.config');
    },
  },
  {
    command: 'vscodeGetActiveConfig',
    callback: async (message: any, that: any) => {
      that.panel.webview.postMessage({
        command: 'getActiveConfig',
        data: tempObj.currentActiveConfig,
      });
    },
  },
  // 编译部署算子
  {
    command: 'vscodeBuildOp',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.startBuild();
    },
  },
  {
    command: 'vscodeBuildExample',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.startBuildExample();
    },
  },
  // sanitizer检测
  {
    command: 'vscodeRunSanitizer',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      // 异常检测前编译
      await opsOption.startBuild(undefined, '--mssanitizer');
      // 开启异常检测
      await opsOption.runSanitizer();
    },
  },
  {
    command: 'vscodeSaveProjectSH',
    callback: async (msg: any, that: any) => {
      const projectSH = msg.message.data;
      if (!projectSH) {
        vscode.window.showErrorMessage('环境变量配置脚本路径不能为空');
        return;
      }
      try {
        const opsOption = new OpsOption(that.context);
        await opsOption.init(projectSH);
        vscode.window.showInformationMessage('环境变量设置成功');
      } catch (error) {
        vscode.window.showErrorMessage(`环境变量设置失败: ${error}`);
      }
    },
  },
  {
    command: 'vscodeRunExample',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.startRun();
    },
  },
  {
    command: 'vscodeSimulate',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.startSimulate();
    },
  },
  {
    command: 'vscodeOnBoard',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.startOnBoard();
    }
  },
  {
    command: 'vscodeRunDebug',
    callback: async (msg: any, that: any) => {
      try {
        const opsOption = new OpsOption(that.context);
        await opsOption.init();
        // debug前编译
        await opsOption.startBuild(undefined, '--debug');
        await vscode.commands.executeCommand('workbench.action.debug.start');
      } catch (error) {
        console.error('打开debug时出错:', error);
      }
    },
  },
  {
    command: 'vscodeDebugConfig',
    callback: async (msg: any, that: any) => {
      try {
        await vscode.commands.executeCommand('workbench.action.debug.configure');
        vscode.window.showInformationMessage(`已打开 launch.json 文件`);
      } catch (error) {
        console.error('打开 launch.json 时出错:', error);
        vscode.window.showErrorMessage(`无法打开 launch.json: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  },
  {
    command: 'vscodeSaveConfig',
    callback: async (msg: any, that: any) => {
      console.log('saveconfig', msg)
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.saveConfig(data.type, data.data);
    },
  },
  {
    command: 'vscodeBuildCreateOps',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      await vscodeBuildCreateOps(data, that);
    },
  },
  {
    command: 'vscodeDownloadData',
    callback: async (msg: any) => {
      // 从消息中获取文件路径和节点信息
      const { filePath, nodeKey } = msg.message.data || {};
      if (!filePath && !nodeKey) {
        vscode.window.showErrorMessage('文件路径不能为空');
        return;
      }

      // 使用 filePath 优先，如果没有则使用 nodeKey
      const remoteFilePath = filePath || nodeKey;

      try {
        // 显示下载进度
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: '正在下载文件',
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 0, message: '正在读取远程文件...' });

            // 创建远程文件 URI
            const remoteFileUri = vscode.Uri.file(remoteFilePath);

            // 检查远程文件是否存在
            try {
              const stat = await vscode.workspace.fs.stat(remoteFileUri);
              progress.report({ increment: 30, message: `文件大小: ${(stat.size / 1024).toFixed(2)} KB` });
            } catch (error) {
              vscode.window.showErrorMessage(`远程文件不存在: ${remoteFilePath}`);
              return;
            }

            // 读取远程文件内容
            progress.report({ increment: 40, message: '正在读取文件内容...' });
            const fileData = await vscode.workspace.fs.readFile(remoteFileUri);

            // 获取文件名
            const fileName = path.basename(remoteFilePath);

            progress.report({ increment: 60, message: '请选择保存位置...' });

            // 让用户选择本地保存位置
            // 在 remote-ssh 场景下，showSaveDialog 会自动打开本地文件保存对话框
            const localFileUri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(fileName),
              saveLabel: '保存',
              filters: {
                所有文件: ['*'],
              },
            });

            if (!localFileUri) {
              // 用户取消了保存对话框
              return;
            }

            // 将文件内容写入本地
            progress.report({ increment: 80, message: '正在保存文件...' });
            await vscode.workspace.fs.writeFile(localFileUri, fileData);

            progress.report({ increment: 100, message: '下载完成' });
            vscode.window.showInformationMessage(`文件已成功下载到: ${localFileUri.fsPath}`);
          },
        );
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`下载数据失败: ${errorMessage}`);
        console.error('下载文件失败:', error);
      }
    },
  },
  {
    command: 'vscodeDeleteNode',
    callback: async (msg: any) => {
      // 从消息中获取节点信息
      const { nodeKey, filePath } = msg.message.data || {};
      if (!nodeKey) {
        vscode.window.showErrorMessage('节点信息不能为空');
        return;
      }
      try {
        // 确认删除
        const result = await vscode.window.showWarningMessage(`确定要删除 ${nodeKey} 吗？`, '确定', '取消');
        if (result === '确定') {
          console.log('删除节点:', nodeKey, filePath);
          // 这里可以添加删除文件的逻辑
          vscode.window.showInformationMessage(`已删除: ${nodeKey}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`删除节点失败: ${error}`);
      }
    },
  },
  {
    command: 'vscodeSelectFolder',
    callback: async (msg: any, that: any) => {
      // 调用 VS Code 原生对话框（支持选择目录）
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '选择目录',
      });

      if (uris && uris[0]) {
        // 将选中的目录路径发回 Webview
        that.panel.webview.postMessage({
          command: 'selectedDirectory',
          data: uris[0].fsPath
        });
      }
    },
  },
  {
    command: 'vscodeOperateErrorToast',
    callback: (message: any) => vscode.window.showErrorMessage('工程配置中命令行为空，请配置再执行该命令'),
  }
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
      await vscodeBuildCreateOps('cann', that, progress);
    }
    if (message.createOperatorProjectDictoryFileType === 2) {
      await vscodeStartLinkCreateOps(undefined, that, progress);
    }
    progress.report({ increment: 100, message: '算子文件创建完成' });
  }
}

async function vscodeBuildCreateOps(data: any, that: any, progress?: any) {
  const opsOption = new OpsOption(that.context);
  await opsOption.init();
  await opsOption.createOpsByPrototype('', data, progress);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}

async function vscodeStartLinkCreateOps(data: any, that: any, progress?: any) {
  if (!data) {
    const opsOption = new OpsOption(that.context);
    await opsOption.init();
    const opsPrototypeFilePath = await opsOption.createOps();
    console.log('res', opsPrototypeFilePath);
    if (opsPrototypeFilePath) {
      await opsOption.createOpsByPrototype(opsPrototypeFilePath, undefined, progress);
    }
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    return;
  }
  // 开始传入
  async function createFile(result: { fileName: string; value: string }) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('请先打开一个工作区');
      return;
    }

    const workspacePath = workspaceFolders[0].uri;
    const filePath = vscode.Uri.joinPath(workspacePath, data.fileName);

    try {
      // 检查文件是否存在
      try {
        await vscode.workspace.fs.stat(filePath);

        // 询问是否覆盖
        const choice = await vscode.window.showWarningMessage(`文件 ${data.fileName} 已存在，是否覆盖？`, { modal: true }, '覆盖', '取消');

        if (choice !== '覆盖') {
          return;
        }
      } catch {
        // 文件不存在，继续
      }

      // 写入文件
      await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(data.value));

      vscode.window.showInformationMessage(`文件 ${data.fileName} 创建成功`);

      // 可选：格式化JSON
      try {
        const formattedValue = JSON.stringify(JSON.parse(data.value), null, 2);
        await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(formattedValue));
      } catch {
        // 如果不是有效的JSON，保持原样
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`创建文件失败: ${error.message}`);
    }
  }
  createFile(data);
}

export default webviewMessageList;
