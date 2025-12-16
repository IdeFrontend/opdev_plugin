/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { RemoteServerOpener } from './RemoteServerOpener';
import RemoteServer from './RemoteServer';
import DirectoryZipper from './DirectoryZipper';
import packageJson from '../../../package.json';
import { CommandExecutor } from './CommandOptions';
import OpsOption from './OpsOption';

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
    command: 'vscodeInstallServer',
    callback: async (msg: any, that: any) => {
      const message = msg.message;
      const server = new RemoteServer(message);
      await server.connect();
      const zipper = new DirectoryZipper();
      const publisher = packageJson.publisher;
      const extensionName = packageJson.name;
      const version = packageJson.version;
      const extensionsPath = '.vscode-server/extensions/';
      const serviceFile = 'register_extension.sh';
      const plugiExtensionsPath = `${extensionsPath}${publisher}.${extensionName}-${version}`;
      const commandPath = `${plugiExtensionsPath}/out/shells`;

      let cmdOut: any = {};
      cmdOut = await server.executeCommand(`cd ${plugiExtensionsPath}`);
      if (cmdOut.stderr && cmdOut.stderr.indexOf('No such file or directory') !== -1) {
        zipper.setCurrentDirectory(__dirname);
        that.panel.webview.postMessage({
          command: 'iframeSetSSHLoading',
          data: 20,
        });
        let outputhPath = await zipper.findAndZipDirectory(`${publisher}.${extensionName}-${version}`, `${extensionName}.zip`);
        if (!outputhPath) {
          outputhPath = await zipper.findAndZipDirectory(`${extensionName}`, `${extensionName}.zip`);
        }
        that.panel.webview.postMessage({
          command: 'iframeSetSSHLoading',
          data: 50,
        });
        await server.uploadFile(outputhPath, `/${extensionName}.zip`, extensionsPath);
        that.panel.webview.postMessage({
          command: 'iframeSetSSHLoading',
          data: 80,
        });
        await server.unzipFile(`${extensionsPath}/${extensionName}.zip`, plugiExtensionsPath, { zipType: 'zip' });
        that.panel.webview.postMessage({
          command: 'iframeSetSSHLoading',
          data: 90,
        });
        await server.executeCommand(`chmod +x  ./${serviceFile}`, commandPath);
        await server.executeCommand(`./${serviceFile} ${publisher} ${extensionName} ${version}`, commandPath);
      }

      that.panel.webview.postMessage({
        command: 'iframeSetSSHLoading',
        data: 100,
      });

      setTimeout(() => {
        that.panel.webview.postMessage({
          command: 'iframePluginInstallEnd',
        });
      }, 500);
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
        await executor.execute(`chmod +x ${message.projectSH}`);
        await executor.execute(`${message.projectSH}`);
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
      await opsOption.startBuild(data);
    },
  },
  {
    command: 'vscodeBuildExample',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.startBuildExample(data);
    },
  },
  {
    command: 'vscodeBuildCreateOps',
    callback: async (msg: any, that: any) => {
      const data = msg.message.data;
      const opsOption = new OpsOption(that.context);
      await opsOption.init();
      await opsOption.createOpsByPrototype('', data);
    },
  },
];

export default webviewMessageList;
