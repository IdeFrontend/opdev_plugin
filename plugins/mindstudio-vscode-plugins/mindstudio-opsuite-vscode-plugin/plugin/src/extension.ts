/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ServiceManager } from './class/serviceManager';
import { WebviewProvider } from './class/webviewProvider'; 3
import OpsOption from './class/OpsOption'



/**
 * 插件激活入口函数
 * @param context VSCode扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    // 初始化服务管理器
    const serviceManager = new ServiceManager(context);

    // 初始化新建算子工程的Webview
    const createOpsProvider = new WebviewProvider(context, serviceManager);

    // 初始化配置页面的Webview
    const configProvider = new WebviewProvider(context, serviceManager);

    const opsOption = new OpsOption(context)

    // 注册打开Opsuite命令
    const openCommand = vscode.commands.registerCommand('mindstudio-opsuite.open', async () => {
        await serviceManager.startServices();
        createOpsProvider.show('Link'); 
    });

    // 注册打开Opsuite命令
    const ConfigCommand = vscode.commands.registerCommand('mindstudio-opsuite.config', async () => {
        await serviceManager.startServices();
        configProvider.show('Config');
    });

    // 注册新建算子原型文件命令
    const createCommand = vscode.commands.registerCommand('mindstudio-opsuite.createOps', async () => {
        await serviceManager.startServices();
        await opsOption.init()
        opsOption.createOps()
    });

    // 注册编译命令
    const buildOpsCommand = vscode.commands.registerCommand('mindstudio-opsuite.buildOps', async () => {
        await serviceManager.startServices();
        await opsOption.init()
        opsOption.startBuild()
    });


    // 注册JSON编辑器按钮命令
    const buttonCommand = vscode.commands.registerCommand('extension.jsonButtonAction', async (uri?: vscode.Uri) => {
        if (uri) {
            await serviceManager.startServices();
            await opsOption.init()
            opsOption.createOpsByPrototype(uri.fsPath)
        }
    });

    // 注册按钮到编辑器标题栏
    const button = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    button.text = "生成算子工程";
    button.tooltip = "生成算子工程";
    button.command = 'extension.jsonButtonAction';

    // 只在JSON文件中显示按钮
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === 'json') {
            button.show();
        } else {
            button.hide();
        }
    });

    context.subscriptions.push(buttonCommand, button);

    // 订阅销毁事件
    context.subscriptions.push(buildOpsCommand);
    context.subscriptions.push(openCommand);
    context.subscriptions.push(ConfigCommand);
    context.subscriptions.push(createCommand);
    context.subscriptions.push(serviceManager);
}
