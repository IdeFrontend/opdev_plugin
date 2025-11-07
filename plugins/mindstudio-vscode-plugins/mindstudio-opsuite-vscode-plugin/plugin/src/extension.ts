import * as path from 'path';
import * as vscode from 'vscode';
import RemoteServer from './class/RemoteServer';
import { RemoteServerOpener } from './class/RemoteServerOpener';
import { ServiceManager } from './class/serviceManager';
import { RemoteServerConfig } from './class/types';
import { WebviewProvider } from './class/webviewProvider';

/**
 * 插件激活入口函数
 * @param context VSCode扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('MindStudio Opsuite 插件已激活');
    let remoteOpener: RemoteServerOpener;
    remoteOpener = new RemoteServerOpener(context);
    testOpenm(remoteOpener);

    // 初始化服务管理器
    const serviceManager = new ServiceManager(context);

    // 初始化Webview提供者
    const webviewProvider = new WebviewProvider(context, serviceManager);

    // 注册打开Opsuite命令
    const openCommand = vscode.commands.registerCommand('mindstudio-opsuite.open', () => {
        console.log('执行命令: mindstudio-opsuite.open');
        webviewProvider.show();
    });

    // 订阅销毁事件
    context.subscriptions.push(openCommand);
    context.subscriptions.push(serviceManager);
}

/**
 * 插件停用时的清理函数
 */
export function deactivate() {
    console.log('MindStudio Opsuite 插件已停用');
}

async function testSSH() {
    // 使用示例
    const server = new RemoteServer({
        host: '10.175.223.129',
        username: 'y30012926',
        password: '123'
    });

    // 连接并执行操作 
    await server.connect();
    const localPath = path.join(__dirname, '../releases/');
    await server.uploadFile(localPath, 'mindstudio-opsuite-vscode-plugins.zip', '.vscode-server/extensions/');
    await server.unzipFile('.vscode-server/extensions/mindstudio-opsuite-vscode-plugins.zip', '.vscode-server/extensions', { zipType: 'zip' });
    await server.executeCommand('node server.js', '.vscode-server/extensions/filesssssssss-main');
    server.disconnect();
}

async function testOpenm(remoteOpener: RemoteServerOpener) {
    const config: RemoteServerConfig = {
        host: '10.175.223.129',
        port: 22,
        username: 'y30012926',
        password: '123',
        privateKey: undefined,
        remotePath: '/home/y30012926'
    };

    if (config) {
        await remoteOpener.open(config);
    }
    const isConnected = await remoteOpener.testConnection(config);
    if (isConnected) {
        vscode.window.showInformationMessage('连接测试成功!');
    } else {
        vscode.window.showErrorMessage('连接测试失败!');
    }

}