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
import { PerformanceSidebarProvider } from './class/PerformanceSidebarProvider';
import { CsvEditorProvider } from './class/CsvEditorProvider';
import { ApiServer } from './core/ApiServer';
import { PanelView } from './core/view/PanelView';
import { routes } from './routes';
import { apis } from './apis';
import { PermanentStorage } from './class/PermanentStorage';
import { ExtensionConfig } from './services/ExtensionConfig';

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

  ExtensionConfig.init(context);
  new PermanentStorage(context);

  // 初始化新建算子工程的Webview
  const createOpsProvider = new WebviewProvider(context, apiServer);

  // 初始化配置页面的Webview
  const configProvider = new WebviewProvider(context);

  // 初始化配置页面的Webview
  const configWelcomeProvider = new WebviewProvider(context);
  // 初始化配置页面的Webview
  const configNewPrototypeProvider = new WebviewProvider(context);

  const opsOption = new OpsOption(context);

  // 注册打开Opsuite命令
  const openCommand = vscode.commands.registerCommand('huawei-op-devtools.open', async () => {
    createOpsProvider.show('Link');
  });

  // 注册打开Opsuite命令
  const ConfigCommand = vscode.commands.registerCommand('huawei-op-devtools.config', async () => {
    configProvider.show('Config');
  });

  // 注册打开欢迎页命令
  const welcomeCommand = vscode.commands.registerCommand('huawei-op-devtools.welcome', async () => {
    configWelcomeProvider.show('Welcome');
  });

  // 注册打开欢迎页命令
  const newPrototypeCommand = vscode.commands.registerCommand('huawei-op-devtools.newPrototype', async () => {
    configNewPrototypeProvider.show('newPrototype');
  });

  // 注册新建算子原型文件命令
  const createCommand = vscode.commands.registerCommand('huawei-op-devtools.createOps', async () => {
    await opsOption.init();
    opsOption.createOps();
  });

  // 注册编译命令
  const buildOpsCommand = vscode.commands.registerCommand('huawei-op-devtools.buildOps', async () => {
    await opsOption.init();
    opsOption.startBuild();
  });

  // 注册JSON编辑器按钮命令
  // 注意：命令已在 package.json 中声明，这里注册处理逻辑
  // 在开发模式下，如果扩展被热重载，可能会遇到命令已存在的错误
  // 使用 try-catch 捕获并忽略该错误
  let buttonCommand: vscode.Disposable;
  try {
    buttonCommand = vscode.commands.registerCommand('extension.jsonButtonAction', async (uri?: vscode.Uri) => {
      if (uri) {
        await opsOption.init();
        opsOption.createOpsByPrototype(uri.fsPath);
      }
    });
  } catch (error: any) {
    // 捕获命令已存在的错误，这是开发模式下常见的情况
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('already exists') || errorMessage.includes('already registered')) {
      console.warn('命令 extension.jsonButtonAction 已存在，使用现有命令');
      // 创建一个虚拟的 Disposable，实际使用现有的命令
      buttonCommand = { dispose: () => {} };
    } else {
      // 其他错误仍然抛出，但不会阻止扩展加载
      console.error('注册命令 extension.jsonButtonAction 时发生未知错误:', errorMessage);
      buttonCommand = { dispose: () => {} };
    }
  }

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

  vscode.commands.executeCommand('huawei-op-devtools.welcome');
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
  const sidebarView = vscode.window.registerWebviewViewProvider(CustomSidebarProvider.viewType, sidebarProvider, {
    webviewOptions: {
      retainContextWhenHidden: true, // WebView隐藏时保持状态
    },
  });

  context.subscriptions.push(sidebarView);

    // 创建性能调优侧边栏提供者
    const performanceSidebarProvider = new PerformanceSidebarProvider(context);

    // 注册性能调优WebView视图
    const performanceSidebarView = vscode.window.registerWebviewViewProvider(
        PerformanceSidebarProvider.viewType,
        performanceSidebarProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true // WebView隐藏时保持状态
            }
        }
    );

    context.subscriptions.push(performanceSidebarView);

    // 注册 CSV 编辑器提供者
    const csvEditorProvider = new CsvEditorProvider();
    const csvEditorRegistration = vscode.window.registerCustomEditorProvider(
        CsvEditorProvider.viewType,
        csvEditorProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false
        }
    );

    context.subscriptions.push(csvEditorRegistration);

    // 注册打开 CSV 文件的命令
    const openCsvCommand = vscode.commands.registerCommand('csv-viewer.openCsv', async () => {
      // 方式1：让用户选择文件
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: '打开',
        filters: {
          'CSV 文件': ['csv'],
          '所有文件': ['*']
        }
      });

      if (fileUri && fileUri[0]) {
        // 使用自定义编辑器打开文件
        await vscode.commands.executeCommand('vscode.openWith', fileUri[0], CsvEditorProvider.viewType);
      }
    });

    context.subscriptions.push(openCsvCommand);
    // 自动显示算子一站式交付平台的活动栏视图
    // 延迟执行，确保视图已经注册完成
    setTimeout(() => {
      vscode.commands.executeCommand('workbench.view.extension.mindstudio-opssuite-vscode-plugin');
    }, 500);
}

/**
 * 国际化
 */
async function initI18n() {
  await i18next.init({
    resources: i18nResource,
    lng: vscode.env.language,
    interpolation: { escapeValue: false },
  });
}

/**
 * 接口
 */
function initApiServer() {
  return new ApiServer(apis);
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
