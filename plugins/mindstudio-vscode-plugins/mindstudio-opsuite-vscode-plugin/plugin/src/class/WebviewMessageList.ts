/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import * as os from 'os';
import { RemoteServerOpener } from './RemoteServerOpener'
import RemoteServer from './RemoteServer'
import DirectoryZipper from './DirectoryZipper'
import packageJson from '../../../package.json'
import { CommandExecutor } from './CommandOptions'
import { ServerInfoUtil } from './ServerInfoUtil';
import OpsOption from './OpsOption'



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
                data: that.isRemote
            });
        }
    },
    {
        command: 'vscodeGetProjectId',
        callback: async (message: any, that: any) => {
            const opsOption = new OpsOption(that.context);
            await opsOption.init();
            that.panel.webview.postMessage({
                command: 'iframeSetProjectId',
                data: opsOption.projectId
            });
        }
    },
    {
        command: 'vscodeGetBuildConfig',
        callback: async (message: any, that: any) => {
            const opsOption = new OpsOption(that.context);
            await opsOption.init();
            const configData = await opsOption.getConfigData()
            that.panel.webview.postMessage({
                command: 'iframeSetBuildConfigItem',
                data: JSON.stringify(configData.data)
            });
        }
    },
    {
        command: 'vscodeSaveBuildConfig',
        callback: async (msg: any, that: any) => {
            const data = msg.message.data;
            const opsOption = new OpsOption(that.context);
            await opsOption.init();
            await opsOption.saveBuildConfig(data)
            const configData = await opsOption.getConfigData()
            that.panel.webview.postMessage({
                command: 'iframeSetBuildConfigItem',
                data: JSON.stringify(configData.data)
            });
        }
    },
    {
        command: 'vscodeSaveAndStartBuild',
        callback: async (msg: any, that: any) => {
            const data = msg.message.data;
            const opsOption = new OpsOption(that.context);
            await opsOption.init();
            await opsOption.saveBuildConfig(data, false)
            const configData = await opsOption.getConfigData()
            that.panel.webview.postMessage({
                command: 'iframeSetBuildConfigItem',
                data: JSON.stringify(configData.data)
            });
            const config_id = data.find((v: any) => v.config_type === "build_op").config_id
            await opsOption.startBuild(config_id)
        }
    },
    {
        command: 'vscodeSaveAndStartBuildExample',
        callback: async (msg: any, that: any) => {
            const data = msg.message.data;
            const opsOption = new OpsOption(that.context);
            await opsOption.init();
            await opsOption.saveBuildConfig(data, false)
            const config_id = data.find((v: any) => v.config_type === "build_example").config_id
            await opsOption.startBuildExample(config_id)
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
            const publisher = packageJson.publisher;
            const extensionName = packageJson.name;
            const version = packageJson.version;
            const extensionsPath = '.vscode-server/extensions/'
            const serviceFile = 'vscode_local_service'
            const plugiExtensionsPath = `${extensionsPath}${publisher}.${extensionName}-${version}`;
            const commandPath = `${plugiExtensionsPath}/out/server`
            let port = 3000

            let cmdOut: any = {};
            cmdOut = await server.executeCommand(`cd ${plugiExtensionsPath}`);
            if (cmdOut.stderr && cmdOut.stderr.indexOf("No such file or directory") !== -1) {
                zipper.setCurrentDirectory(__dirname);
                that.panel.webview.postMessage({
                    command: 'iframeSetSSHLoading',
                    data: 20
                });
                let outputhPath = await zipper.findAndZipDirectory(`${publisher}.${extensionName}-${version}`, `${extensionName}.zip`);
                if (!outputhPath) {
                    outputhPath = await zipper.findAndZipDirectory(`${extensionName}`, `${extensionName}.zip`);
                }
                that.panel.webview.postMessage({
                    command: 'iframeSetSSHLoading',
                    data: 50
                });
                await server.uploadFile(outputhPath, `/${extensionName}.zip`, extensionsPath);
                that.panel.webview.postMessage({
                    command: 'iframeSetSSHLoading',
                    data: 80
                });
                await server.unzipFile(`${extensionsPath}/${extensionName}.zip`, plugiExtensionsPath, { zipType: 'zip' });
                that.panel.webview.postMessage({
                    command: 'iframeSetSSHLoading',
                    data: 90
                });
                await server.executeCommand(`chmod u+x  ./${serviceFile}`, commandPath);
                let index = 1000;
                while (index !== 0) {
                    index--;
                    let isServerStart = await testLoaclPort(port);
                    if (isServerStart) {
                        console.log(`服务器启动成功，启动端口：${port}`)
                        break;
                    }
                    await server.executeCommand(`./${serviceFile} --extension_publisher ${publisher} --extension_name ${extensionName} --extension_version ${version} server --port ${port}`, commandPath);
                    console.log('服务已尝试启动');
                    await new Promise((reslove) => {
                        setTimeout(() => {
                            reslove(0)
                        }, 1000);
                    })
                    console.log('1s后再次调用嗅探借口，检测服务是否启动成功')
                    isServerStart = await testLoaclPort(port);
                    if (isServerStart) {
                        console.log(`服务器启动成功，启动端口：${port}`)
                        break;
                    }
                    port++;
                }

            } else {
                await server.executeCommand(`chmod u+x  ./${serviceFile}`, commandPath);
                let index = 1000;
                while (index !== 0) {
                    index--;
                    let isServerStart = await testLoaclPort(port);
                    if (isServerStart) {
                        console.log(`服务器启动成功，启动端口：${port}`)
                        break;
                    }
                    await server.executeCommand(`./${serviceFile}  server --port ${port}`, commandPath);
                    console.log('服务已尝试启动');
                    await new Promise((reslove) => {
                        setTimeout(() => {
                            reslove(0)
                        }, 1000);
                    })
                    console.log('1s后再次调用嗅探借口，检测服务是否启动成功')
                    isServerStart = await testLoaclPort(port);
                    if (isServerStart) {
                        break;
                    }
                    port++;
                }

            }

            async function testLoaclPort(port: number) {
                const result = await server.executeCommand(`export no_proxy="localhost,127.0.0.1,.huawei.com,10.0.0.0/24" && curl http://127.0.0.1:${port}/api/v1/health`)
                let isServerStart = result.stdout.indexOf(os.userInfo().username) !== -1;
                if (isServerStart) {
                    return true;
                }
                return false
            }

            that.panel.webview.postMessage({
                command: 'iframeSetSSHLoading',
                data: 100
            });

            setTimeout(() => {
                that.panel.webview.postMessage({
                    command: 'iframePluginInstallEnd',
                });
            }, 500);
        }
    },
    {
        command: 'vscodeCreatedProject',
        callback: async (msg: any, that: any) => {
            const message = msg.message.data;
            const publisher = packageJson.publisher;
            const extensionName = packageJson.name;
            const version = packageJson.version;
            const extensionsPath = '.vscode-server/extensions/'
            const serviceFile = 'vscode_local_service'
            const plugiExtensionsPath = `${extensionsPath}${publisher}.${extensionName}-${version}`;
            const commandPath = `${plugiExtensionsPath}/out/server`

            if (that.isRemote) {
                console.log('服务器上执行');
                const executor = new CommandExecutor();
                await executor.execute(`mkdir  ${message.projectPath}/${message.projectName}`, ['File exists'])
                await executor.execute(`chmod +x ${message.projectSH}`);
                await executor.execute(`${message.projectSH}`);
                const opsOption = new OpsOption(that.context);
                await opsOption.init(message.projectSH);
                await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(`${message.projectPath}/${message.projectName}`))
                const sshConfigName = `${ServerInfoUtil.getUsername()}@${ServerInfoUtil.getPrimaryIP()}`;
                const remoteUri = vscode.Uri.parse(`vscode-remote://ssh-remote+${sshConfigName}${message.projectPath}/${message.projectName}`);
                await vscode.commands.executeCommand('vscode.openFolder', remoteUri, {
                    forceNewWindow: true
                });
            } else {
                console.log('本地执行上执行')
                const server = new RemoteServer(message)
                await server.connect();
                await server.executeCommand(`mkdir  ${message.projectPath}/${message.projectName}`);
                await server.executeCommand(`chmod + x ${message.projectSH}`);
                await server.executeCommand(`${message.projectSH}`);
                await server.executeCommand(`./${serviceFile} task create_project --project_name ${message.projectName} --project_path ${message.projectPath} --ascend_env_script ${message.projectSH}`, commandPath);
                const remoteOpener: RemoteServerOpener = new RemoteServerOpener();
                remoteOpener.open({ ...message, remotePath: `${message.projectPath}/${message.projectName}` })
            }


        }
    }
]

export default webviewMessageList;