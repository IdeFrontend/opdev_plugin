import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExceptionParser } from './exception-parser';

import { HtmlTransformer } from './html-transformer';
import webviewMessageList from './webview-message-list';
import { ApiServer } from '@plugin/core/api-server';
import {
  COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW,
  VIEW_MS_SANITIZER,
} from '@plugin/constants';

export class MsSanitizerPanelViewProvider
implements vscode.WebviewViewProvider {
  public static readonly viewType = 'msSanitizerPanelView';

  public static getMsSanitizerPanelViewDataParams = null;

  _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext;
  private _apiServer: ApiServer;
  private _themeChangeDisposable: vscode.Disposable | undefined;

  constructor(context: vscode.ExtensionContext, apiServer: ApiServer) {
    this._extensionUri = context.extensionUri;
    this._context = context;
    this._apiServer = apiServer;
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] 开始解析 webview 视图');
    console.log(`[MsSanitizerPanelViewProvider.resolveWebviewView] viewType: ${MsSanitizerPanelViewProvider.viewType}`);
    console.log(`[MsSanitizerPanelViewProvider.resolveWebviewView] extensionUri: ${this._extensionUri.toString()}`);

    this._view = webviewView;

    // 配置 WebView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] WebView 配置完成');

    // 注册 webview 到 ApiServer
    this._apiServer.addWebview('MsSanitizerPanelView', webviewView.webview);
    console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] WebView 已注册到 ApiServer');

    // 消息处理
    webviewView.webview.onDidReceiveMessage(
      async (message: any) => {
        console.log('[MsSanitizerPanelViewProvider] 收到消息:', message.command);

        if (message.command === 'vscodeGetMsSanitizerPanelViewData') {
          // 发送数据 后续优化 先通过_view.webview 方式下发内容
          if (!MsSanitizerPanelViewProvider.getMsSanitizerPanelViewDataParams) {
            console.log('[MsSanitizerPanelViewProvider] 无数据参数，发送空数据');
            webviewView.webview.postMessage({
              command: 'iframeRemoteMsSanitizerPanelViewSetRenderList',
              data: {},
            });

            return;
          }

          console.log('[MsSanitizerPanelViewProvider] 开始获取面板数据');
          const panelData = await getPanelData(MsSanitizerPanelViewProvider.getMsSanitizerPanelViewDataParams);

          MsSanitizerPanelViewProvider.getMsSanitizerPanelViewDataParams = null;
          console.log('[MsSanitizerPanelViewProvider] 面板数据获取完成，发送数据');
          webviewView.webview.postMessage({
            command: 'iframeRemoteMsSanitizerPanelViewSetRenderList',
            data: panelData,
          });
        }
        else {
          this.handleWebviewMessage(message);
        }
      },
      undefined,
      this._context.subscriptions,
    );
    console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] 消息处理器已注册');

    // 设置 HTML 内容
    const distPath = path.join(this._extensionUri.fsPath, 'out', 'web');

    console.log(`[MsSanitizerPanelViewProvider.resolveWebviewView] 开始加载 HTML，distPath: ${distPath}`);
    console.log(`[MsSanitizerPanelViewProvider.resolveWebviewView] router: ${VIEW_MS_SANITIZER}`);

    try {
      webviewView.webview.html = await HtmlTransformer.transformDistHtml(
        distPath,
        webviewView.webview,
        `sidebars/${VIEW_MS_SANITIZER}`,
      );
      console.log('[MsSanitizerPanelViewProvider.resolveWebviewView] HTML 加载完成');
    }
    catch (error) {
      console.error('[MsSanitizerPanelViewProvider.resolveWebviewView] HTML 加载失败:', error);
      throw error;
    }

    // 监听 VSCode 主题变化并通知 Webview
    this._themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      webviewView.webview.postMessage({
        command: 'updateTheme',
        themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
      });
    });

    // 初始化时发送当前主题
    webviewView.webview.postMessage({
      command: 'updateTheme',
      themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
    });
  }

  /**
   * 处理来自 Webview 的消息
   */
  private handleWebviewMessage(message: any): void {
    for (const messageItem of webviewMessageList) {
      if (message.command === messageItem.command) {
        messageItem.callback(message, this);
      }
    }
  }

  /**
   * 清理资源
   */
  public dispose() {
    if (this._themeChangeDisposable) {
      this._themeChangeDisposable.dispose();
      this._themeChangeDisposable = undefined;
    }
  }
}

const getPanelData = (params: Record<string, any>) => {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log('getRunData1 no workspaceFolders');

    return [];
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;

  const inputContent = fs.readFileSync(params.path, 'utf-8');
  const parser = new ExceptionParser({ matchPath: workspacePath });
  // 直接传入整个文件内容进行解析
  const data = parser.parseAll(inputContent);

  console.log('异常检测详情数据：', data);

  return {
    ...params,
    data,
  };
};

export const getMsSanitizerPanelViewProvider = (
  context: vscode.ExtensionContext,
  apiServer: ApiServer,
) => {
  const msSanitizerPanelViewProvider = new MsSanitizerPanelViewProvider(
    context,
    apiServer,
  );
  const msSanitizerPanelView = vscode.window.registerWebviewViewProvider(
    MsSanitizerPanelViewProvider.viewType,
    msSanitizerPanelViewProvider,
    { webviewOptions: { retainContextWhenHidden: false } },
  );

  // 注册打开终端和 Webview 的命令
  const openMsSanitizerDisposable = vscode.commands.registerCommand(
    COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW,
    async (data: any) => {
      // 打开底部区域面板
      await vscode.commands.executeCommand('workbench.action.togglePanel');

      // 定位到异常检测面板
      await vscode.commands.executeCommand('msSanitizerPanelView.focus');

      MsSanitizerPanelViewProvider.getMsSanitizerPanelViewDataParams = data;
    },
  );

  return {
    msSanitizerPanelView,
    openMsSanitizerDisposable,
  };
};
