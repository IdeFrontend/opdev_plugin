/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import { ServiceManager } from './class/serviceManager';
import { WebviewProvider } from './class/webviewProvider';


/**
 * 插件激活入口函数
 * @param context VSCode扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    // 初始化服务管理器
    const serviceManager = new ServiceManager(context);

    // 初始化Webview提供者
    const webviewProvider = new WebviewProvider(context, serviceManager);

    // 注册打开Opsuite命令
    const openCommand = vscode.commands.registerCommand('mindstudio-opsuite.open', () => {
        webviewProvider.show('link');
    });

    // 订阅销毁事件
    context.subscriptions.push(openCommand);
    context.subscriptions.push(serviceManager);
}
