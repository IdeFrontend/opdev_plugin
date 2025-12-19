/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';

import { RemoteServerOpener } from './RemoteServerOpener';
import RemoteServer from '../services/local/RemoteServer';
import packageJson from '../../../package.json';
import { CommandExecutor } from './CommandOptions';
import OpsOption from './OpsOption';
import { SSHKeyAutoConfig } from './SSHKeyAutoConfig';
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
      if (!message.message.data) {
        const opsOption = new OpsOption(that.context);
        await opsOption.init();
        const opsPrototypeFilePath = await opsOption.createOps();
        console.log('res', opsPrototypeFilePath);
        if (opsPrototypeFilePath) {
          opsOption.createOpsByPrototype(opsPrototypeFilePath);
        }
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        return;
      }
      // 开始传入
      const result = message.message.data;
      async function createFile(result: { fileName: string; value: string }) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage('请先打开一个工作区');
          return;
        }

        const workspacePath = workspaceFolders[0].uri;
        const filePath = vscode.Uri.joinPath(workspacePath, result.fileName);

        try {
          // 检查文件是否存在
          try {
            await vscode.workspace.fs.stat(filePath);

            // 询问是否覆盖
            const choice = await vscode.window.showWarningMessage(`文件 ${result.fileName} 已存在，是否覆盖？`, { modal: true }, '覆盖', '取消');

            if (choice !== '覆盖') {
              return;
            }
          } catch {
            // 文件不存在，继续
          }

          // 写入文件
          await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(result.value));

          vscode.window.showInformationMessage(`文件 ${result.fileName} 创建成功`);

          // 可选：格式化JSON
          try {
            const formattedValue = JSON.stringify(JSON.parse(result.value), null, 2);
            await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(formattedValue));
          } catch {
            // 如果不是有效的JSON，保持原样
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(`创建文件失败: ${error.message}`);
        }
      }
      createFile(result);
    },
  },
  {
    command: 'openLinkWebviewPanel',
    callback: (message: any, that: any) => {
      vscode.commands.executeCommand('huawei-op-devtools.open');
    },
  },
  {
    command: 'vscodeGetssh',
    callback: (message: any, that: any) => {
      if (!that.panel) {
        return;
      }
      that.panel.webview.postMessage({
        command: 'iframeSetSSHData',
        data: that.sshData,
      });

      that.panel.webview.postMessage({
        command: 'iframeSetUserInfo',
        data: that.userInfo,
      });

      that.panel.webview.postMessage({
        command: 'iframeGetDisposed',
        data: that.isRemote,
      });
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
  {
    command: 'vscodeSshValidate',
    callback: async (msg: any, that: any) => {
      const message = msg.message;
      const remoteOpener: RemoteServerOpener = new RemoteServerOpener();
      const isConnected = await remoteOpener.testConnection(message);
      that.panel.webview.postMessage({
        command: 'iframeSshValidateEnd',
        data: {
          isConnected,
        },
      });
    },
  },
  {
    command: 'vscodeUpdateLocalData',
    callback: async (msg: any, that: any) => {
      const message = msg.message;
      that.storage.set(message.key, message.value);
    },
  },
  {
    command: 'vscodeRemotePathSearch',
    callback: async (msg: any, that: any) => {
      const message = msg.message;
      const publisher = packageJson.publisher;
      const extensionName = packageJson.name;
      const version = packageJson.version;
      const extensionsPath = '.vscode-server/extensions/';
      const serviceFile = 'get_files.sh';
      const plugiExtensionsPath = `${extensionsPath}${publisher}.${extensionName}-${version}`;
      const commandPath = `${plugiExtensionsPath}/out/server/shells`;
      if (that.isRemote) {
        const opsOption = new OpsOption(that.context);
        await opsOption.init();
        const res = await opsOption.getAllPath(message.keyword);
        that.panel.webview.postMessage({
          command: 'iframeRemoteSearchResult',
          data: {
            type: message.type,
            list: res,
          },
        });
      } else {
        const server = new RemoteServer(message.ssh);
        await server.connect();
        await server.executeCommand(`chmod +x  ./${serviceFile}`, commandPath);
        const res = await server.executeCommand(`./${serviceFile} ${message.keyword}`, commandPath);
        const list = JSON.parse(res.stdout);
        that.panel.webview.postMessage({
          command: 'iframeRemoteSearchResult',
          data: {
            type: message.type,
            list,
          },
        });
      }
    },
  },
  {
    command: 'vscodeCreatedProject',
    callback: async (msg: any, that: any) => {
      const message = msg.message.data;
      const publisher = packageJson.publisher;
      const extensionName = packageJson.name;
      const version = packageJson.version;
      const extensionsPath = '.vscode-server/extensions/';
      const serviceFile = 'create_project.sh';
      const plugiExtensionsPath = `${extensionsPath}${publisher}.${extensionName}-${version}`;
      const commandPath = `${plugiExtensionsPath}/out/shells`;
      // 判斷当前是在本地还是服务器上
      if (that.isRemote) {
        console.log('服务器上执行');
        const executor = new CommandExecutor();
        await executor.execute(`mkdir  ${message.projectPath}/${message.projectName}`, ['File exists']);
        if (message.projectSH) {
          await executor.execute(`chmod +x ${message.projectSH}`);
          await executor.execute(`${message.projectSH}`);
        }
        const opsOption = new OpsOption(that.context);
        await opsOption.init(message.projectSH, message.projectPath, message.projectName);
        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(`${message.projectPath}/${message.projectName}`));
        // 使用正确的API检测远程连接
        const remoteName = vscode.env.remoteName;
        if (!remoteName) {
          return console.log('未检测到远程连接');
        }
        // 规范化路径
        const normalizedProjectPath = path.normalize(message.projectPath);
        const normalizedProjectName = path.normalize(message.projectName);
        const fullProjectPath = path.join(normalizedProjectPath, normalizedProjectName);
        console.log(`检测到远程连接: ${remoteName}`);

        if (remoteName && remoteName !== 'ssh-remote') {
          // 如果有完整的远程连接信息，则使用它
          if (remoteName.startsWith('ssh-remote+')) {
            const remoteUri = vscode.Uri.parse(`vscode-remote://${remoteName}${fullProjectPath}`);
            console.log(`准备打开远程文件夹: ${remoteUri.toString()}`);

            await vscode.commands.executeCommand('vscode.openFolder', remoteUri, {
              forceNewWindow: true,
            });
          } else {
            const remoteUri = vscode.Uri.parse(`vscode-remote://ssh-remote+${remoteName}${fullProjectPath}`);
            await vscode.commands.executeCommand('vscode.openFolder', remoteUri, {
              forceNewWindow: true,
            });
          }
        } else {
          // 如果只有 'ssh-remote' 类型而没有具体连接ID
          // 尝试通过其他方式获取当前SSH连接信息
          console.log(`打开新路径：${fullProjectPath}`);

          // 在远程环境中，我们可以直接打开本地路径（相对于远程系统）
          const localUri = vscode.Uri.file(fullProjectPath);
          await vscode.commands.executeCommand('vscode.openFolder', localUri, {
            forceNewWindow: true,
          });
        }
      } else {
        console.log('本地执行上执行');
        const server = new RemoteServer(message);
        await server.connect();
        await server.executeCommand(`mkdir  ${message.projectPath}/${message.projectName}`);
        await server.executeCommand(`chmod + x ${message.projectSH}`);
        await server.executeCommand(`${message.projectSH}`);
        await server.executeCommand(
          `./${serviceFile} --project-name "${message.projectName}" --project-path "${message.projectPath}/${message.projectName}" --ascend-env-script "${message.projectSH}"`,
          commandPath
        );

        if (!message.privateKey) {
          const autoConfig = new SSHKeyAutoConfig(server);
          await autoConfig.configureSSH(message);
        }

        const remoteOpener: RemoteServerOpener = new RemoteServerOpener();
        remoteOpener.open({ ...message, remotePath: `${message.projectPath}/${message.projectName}` });
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
    command: 'vscodeBuildCreateOps',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.createOpsByPrototype('', data);
      vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    },
  },
  {
    command: 'vscodeOpenCsv',
    callback: async (msg: any) => {
      // 从消息中获取CSV路径，必须从前端传入
      const csvPath = msg.message.data;
      if (!csvPath) {
        vscode.window.showErrorMessage('CSV文件路径不能为空');
        return;
      }
      try {
        const uri = vscode.Uri.file(csvPath);
        const targetDir = path.dirname(csvPath).toLowerCase(); // 使用小写进行比较，避免路径大小写问题

        // 检查是否有相同目录的文件已经打开
        const existingUri = openedCsvDirectories.get(targetDir);

        // 先打开新文件（使用自定义编辑器），这样新文件会立即显示
        // 使用 openWith 命令，VSCode 会自动处理，不会闪现源文件
        await vscode.commands.executeCommand('vscode.openWith', uri, 'csvViewer');

        // 如果相同目录的不同文件已打开，在新文件打开后关闭旧文件
        // 这样新文件已经显示，关闭旧文件时不会闪现源文件
        if (existingUri && existingUri.fsPath !== csvPath) {
          // 等待新文件完全打开
          await new Promise(resolve => setTimeout(resolve, 300));

          // 尝试关闭旧文件
          // 检查当前打开的文本编辑器，找到旧文件并关闭
          const visibleEditors = vscode.window.visibleTextEditors;
          for (const editor of visibleEditors) {
            if (editor.document.uri.fsPath === existingUri.fsPath) {
              // 切换到旧文件并关闭（此时新文件已经打开并显示，所以不会闪现）
              await vscode.window.showTextDocument(editor.document, { preview: false });
              await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
              break;
            }
          }
        }

        // 记录已打开的目录
        openedCsvDirectories.set(targetDir, uri);
      } catch (error) {
        vscode.window.showErrorMessage(`打开 CSV 文件失败: ${error}`);
      }
    },
  },
  {
    command: 'vscodeinsigLoadData',
    callback: async (msg: any, that: any) => {
      // 从消息中获取BIN文件路径
      const binPath = msg.message.data;
      if (!binPath) {
        vscode.window.showErrorMessage('BIN文件路径不能为空');
        return;
      }
      try {
        console.log('加载 BIN 文件:', binPath);

        // 获取 extension context
        // 兼容不同的 provider: WebviewProvider 使用 context, PerformanceSidebarProvider 使用 _context
        const context = that.context || that._context;
        if (!context) {
          vscode.window.showErrorMessage('无法获取扩展上下文');
          console.error('无法获取扩展上下文，that:', that);
          return;
        }

        // 使用 InsightDataViewerPanel 创建或显示 panel
        InsightDataViewerPanel.createOrShow(context, binPath);

        vscode.window.showInformationMessage(`正在加载数据文件: ${binPath}`);
      } catch (error) {
        vscode.window.showErrorMessage(`加载数据文件失败: ${error}`);
      }
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
        // 检查是否在远程环境中
        const isRemote = vscode.env.remoteName !== undefined;

        if (!isRemote) {
          vscode.window.showWarningMessage('此功能需要在远程 SSH 连接环境中使用');
          return;
        }

        // 显示下载进度
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '正在下载文件',
          cancellable: false
        }, async (progress) => {
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
              '所有文件': ['*']
            }
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
        });
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
        const result = await vscode.window.showWarningMessage(
          `确定要删除 ${nodeKey} 吗？`,
          '确定',
          '取消'
        );
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
    command: 'startRenderIframes',
    callback: async (message: any, that: any) => {
      try {
        // 获取 extension context（兼容不同的 provider）
        const context = that.context || that._context;
        if (!context) {
          console.error('无法获取扩展上下文');
          return;
        }

        // 获取 webview（兼容不同的 provider）
        const webview = that.panel?.webview || that._view?.webview;
        if (!webview) {
          console.error('无法获取 webview');
          return;
        }

        // 插件目录列表
        const pluginDirs = [
          { model: 'Cluster', path: 'communication.html', iframeName: 'communication' },
          { model: 'Cluster', path: 'summary.html', iframeName: 'summary' },
          { model: 'Cluster', path: 'index.html', iframeName: 'Cluster' },
          { model: 'Compute', path: 'cache.html', iframeName: 'cache' },
          { model: 'Compute', path: 'detail.html', iframeName: 'detail' },
          { model: 'Compute', path: 'source.html', iframeName: 'source' },
          { model: 'Compute', path: 'index.html', iframeName: 'Compute' },
          { model: 'leaks' },
          { model: 'Memory' },
          { model: 'Operator' },
          { model: 'RL' },
          { model: 'Statistic' },
          { model: 'Timeline' },
        ]

        // 插件目录路径
        const pluginsBasePath = path.join(context.extensionPath, 'plugin', 'insight-vscode-plugin', 'plugins');

        // 读取每个插件目录下的 index.html 文件并发送给 webview
        for (const pluginModel of pluginDirs) {
          const pluginDirPath = path.join(pluginsBasePath, pluginModel.model);
          const indexPath = path.join(pluginDirPath, pluginModel.path || 'index.html');

          try {
            // 检查文件是否存在
            if (fs.existsSync(indexPath)) {
              // 读取文件内容
              const content = fs.readFileSync(indexPath, 'utf8');

              // 发送消息给 webview
              webview.postMessage({
                command: 'renderIframe',
                pluginName: pluginModel.iframeName || pluginModel.model,
                content: content,
              });
            } else {
              console.warn(`插件文件不存在: ${indexPath}`);
            }
          } catch (error: any) {
            console.error(`读取插件文件失败: ${indexPath}`, error);
          }
        }
      } catch (error: any) {
        console.error('处理 startRenderIframes 失败:', error);
      }
    },
  },
];

export default webviewMessageList;
