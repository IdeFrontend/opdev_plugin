/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import i18next from 'i18next';
import * as vscode from 'vscode';

import i18nResource from 'shared:/i18n';

import { WebviewProvider } from './class/webviewProvider';
import OpsOption from './class/OpsOption';
import { CustomSidebarProvider } from './class/CustomSidebarProvider';
import { ApiServer } from './core/ApiServer';
import { PanelView } from './core/view/PanelView';
import { routes } from './routes';

/**
 * 插件激活入口函数
 * @param context VSCode扩展上下文
 */
export async function activate(context: vscode.ExtensionContext) {
  // 国际化
  await initI18n();

  // api接口
  const apiServer = initApiServer();

  // 视图
  const panelView = initViews(context, apiServer);

  // 初始化新建算子工程的Webview
  const createOpsProvider = new WebviewProvider(context);

  // 初始化配置页面的Webview
  const configProvider = new WebviewProvider(context);

  // 初始化配置页面的Webview
  const configWelcomeProvider = new WebviewProvider(context);
  // 初始化配置页面的Webview
  const configNewPrototypeProvider = new WebviewProvider(context);

  const opsOption = new OpsOption(context);

  // 注册打开Opsuite命令
  const openCommand = vscode.commands.registerCommand('mindstudio-opsuite.open', async () => {
    createOpsProvider.show('Link');
  });

  // 注册打开Opsuite命令
  const ConfigCommand = vscode.commands.registerCommand('mindstudio-opsuite.config', async () => {
    configProvider.show('Config');
  });

  // 注册打开欢迎页命令
  const welcomeCommand = vscode.commands.registerCommand('mindstudio-opsuite.welcome', async () => {
    configWelcomeProvider.show('Welcome');
  });

  // 注册打开欢迎页命令
  const newPrototypeCommand = vscode.commands.registerCommand('mindstudio-opsuite.newPrototype', async () => {
    configNewPrototypeProvider.show('newPrototype');
  });

  // 注册新建算子原型文件命令
  const createCommand = vscode.commands.registerCommand('mindstudio-opsuite.createOps', async () => {
    await opsOption.init();
    opsOption.createOps();
  });

  // 注册编译命令
  const buildOpsCommand = vscode.commands.registerCommand('mindstudio-opsuite.buildOps', async () => {
    await opsOption.init();
    opsOption.startBuild();
  });

  // 注册JSON编辑器按钮命令
  const buttonCommand = vscode.commands.registerCommand('extension.jsonButtonAction', async (uri?: vscode.Uri) => {
    if (uri) {
      await opsOption.init();
      opsOption.createOpsByPrototype(uri.fsPath);
    }
  });

  // 注册按钮到编辑器标题栏
  const button = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  button.text = '生成算子工程';
  button.tooltip = '生成算子工程';
  button.command = 'extension.jsonButtonAction';

  // 只在JSON文件中显示按钮
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && editor.document.languageId === 'json') {
      button.show();
    } else {
      button.hide();
    }
  });

  configProvider.showLeftPage('Home');

  vscode.commands.executeCommand('mindstudio-opsuite.welcome');
  context.subscriptions.push(buttonCommand, button);

  // 订阅销毁事件
  context.subscriptions.push(apiServer);
  context.subscriptions.push(panelView);
  context.subscriptions.push(buildOpsCommand);
  context.subscriptions.push(openCommand);
  context.subscriptions.push(ConfigCommand);
  context.subscriptions.push(createCommand);
  context.subscriptions.push(welcomeCommand);
  context.subscriptions.push(newPrototypeCommand);

    // 创建侧边栏提供者
    const sidebarProvider = new CustomSidebarProvider(context);
    
    // 注册WebView视图
    const sidebarView = vscode.window.registerWebviewViewProvider(
        CustomSidebarProvider.viewType,
        sidebarProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true // WebView隐藏时保持状态
            }
        }
    );
    
    context.subscriptions.push(sidebarView);
}

/**
 * 国际化
 */
async function initI18n() {
  i18next.init({
    resources: i18nResource,
    lng: vscode.env.language,
    interpolation: { escapeValue: false },
  });
}

/**
 * 接口
 */
function initApiServer() {
  return new ApiServer({
    // TODO 接口配置
  });
}

/**
 * 视图
 * @param context 扩展上下文
 * @param apiServer api服务
 */
function initViews(context: vscode.ExtensionContext, apiServer: ApiServer): PanelView {
  const panelView = new PanelView(routes, context);

  panelView.onViewActivated((path, panel) => {
    apiServer.addWebview(path, panel.webview);
  });
  panelView.onViewDisposed((path) => {
    apiServer.removeWebview(path);
  });

  return panelView;
}
