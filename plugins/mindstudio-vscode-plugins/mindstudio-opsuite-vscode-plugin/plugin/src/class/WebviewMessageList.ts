/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { RemoteServerOpener } from './RemoteServerOpener'
import RemoteServer from './RemoteServer'
import DirectoryZipper from './DirectoryZipper'

export interface messageItem {
    command: string;
    callback: Function
}

const webviewMessageList: messageItem[] = [
    {
        command: 'alert',
        callback: (message: any) => vscode.window.showErrorMessage(message.text)
    },
    {
        command: 'info',
        callback: (message: any) => vscode.window.showInformationMessage(message.text)
    },
    {
        command: 'loaded',
        callback: (message: any) => {
            if (message.status === 'success') {
            } else if (message.status === 'error') {
                vscode.window.showWarningMessage(`Opsuite加载异常: ${message.message}`);
            }
        }
    },
    {
        command: 'vscodeGetssh',
        callback: (message: any, that: any) => {
            if (!that.panel) {
                return;
            }
            that.panel.webview.postMessage({
                command: 'iframeSetSSHData',
                data: that.sshData
            });

            that.panel.webview.postMessage({
                command: 'iframeGetDisposed',
                data: that.isDisposed
            });
        }
    },
    {
        command: 'vscodeSshValidate',
        callback: async (msg: any, that: any) => {
            const message = msg.message;
            const remoteOpener: RemoteServerOpener = new RemoteServerOpener();
            const isConnected = await remoteOpener.testConnection(message)
            that.panel.webview.postMessage({
                command: 'iframeSshValidateEnd',
                data: {
                    isConnected
                }
            });
        }
    },
    {
        command: 'vscodeUpdateLocalData',
        callback: async (msg: any, that: any) => {
            const message = msg.message;
            that.storage.set(message.key, message.value)
        }
    },
    {
        command: 'vscodeInstallServer',
        callback: async (msg: any, that: any) => {
            const message = msg.message;
            const server = new RemoteServer(message)
            await server.connect();
            const zipper = new DirectoryZipper();
            zipper.setCurrentDirectory('');
            await zipper.findAndZipDirectory('out', 'mindstudio-opsuite-vscode-plugin.zip');
            await server.uploadFile(path.join(__dirname, '..'), '/mindstudio-opsuite-vscode-plugin.zip', '.vscode-server/extensions/');
            const publisher = 'mindstudio'
            const extensionName = 'mindstudio-opsuite-vscode-plugin'
            const version = '0.0.1'
            const extensionPath = `.vscode-server/extensions/${publisher}.${extensionName}-${version}`;
            await server.unzipFile('.vscode-server/extensions/mindstudio-opsuite-vscode-plugin.zip', extensionPath, { zipType: 'zip' });
            const commandPath = `${extensionPath}/server`
            await server.executeCommand('chmod u+x  ./vscode_local_service', commandPath);
            await server.executeCommand(`./vscode_local_service --extension_publisher ${publisher} --extension_name ${extensionName} --extension_version ${version} --port 8080`, commandPath);
            that.panel.webview.postMessage({
                command: 'iframePluginInstallEnd',
            });
        }
    }
]

export default webviewMessageList;