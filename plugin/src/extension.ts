/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import i18next from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import i18nResource from '@shared/i18n';

import { WebviewProvider } from './class/webview-provider';
import { handleOperatorProjectDirectoryFile } from './class/webview-message-list';
import { CsvEditorProvider } from './class/csv-editor-provider';
import {
  ApiServer, type ApiGroup,
} from './core/api-server';
import { ViewServer } from './core/view/view-server';
import { routes } from './routes';
import { apis } from './api-routes';
import { PermanentStorage } from './class/permanent-storage';
import { ExtensionConfig } from './core/extension-config';
import { RemoteConfig } from './helpers/remote-config';

import { OpsOperateProvider } from './class/ops-operate-provider';
import { getMsSanitizerPanelViewProvider } from './class/ms-sanitizer-panel-view';

import { MindStudioPluginInstaller } from './class/mind-studio-plugin-installer';
import {
  COMMAND_OPEN,
  COMMAND_PROJECT_SH,
  COMMAND_WELCOME,
  COMMAND_CONFIG,
  COMMAND_CREATE_OPERATOR_IN_WORKSPACE,
  COMMAND_TOGGLE_OPS_OPERATE,
  COMMAND_CLEAR_WELCOME_COUNT,
  COMMAND_CLEAR_LAST_PROJECT_PATH,
  COMMAND_CREATE_DIRECTORY,
  COMMAND_GET_HOME,
  COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
  VIEW_HOME,
  VIEW_CONFIG,
  VIEW_LINK,
  VIEW_WELCOME,
  VIEW_PROJECT_SH,
  COMMAND_SIMULATOR_OPTIONS,
  VIEW_OPTIONS_SIMULATOR
} from './constants';

let extensionContext: vscode.ExtensionContext | undefined;

/**
 * 检查当前工作区是否存在 .vscode/devtool_config.json 文件
 * @returns 如果文件存在返回 true，否则返回 false
 */
async function checkDevtoolConfigExists(): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const devtoolConfigPath = path.join(
    workspacePath,
    '.vscode',
    'devtool_config.json',
  );

  try {
    return fs.existsSync(devtoolConfigPath);
  }
  catch (error) {
    console.error('检查 devtool_config.json 文件时出错:', error);

    return false;
  }
}

/**
 * 插件激活入口函数
 * @param context VSCode扩展上下文
 */
export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  // 将 context 设置到全局对象以便 API 层使用
  (
    globalThis as unknown as { extensionContext: vscode.ExtensionContext }
  ).extensionContext = context;

  // api接口
  const apiServer = initApiServer();

  // 初始化配置页面的Webview
  const configProvider = new WebviewProvider(context, apiServer);

  // 注册 pluginSidebar webview provider 并添加到 subscriptions
  const pluginSidebarDisposable = configProvider.showLeftPage(VIEW_HOME);

  context.subscriptions.push(pluginSidebarDisposable);

  // 国际化
  await initI18n();

  // 检查 devtool_config.json 文件是否存在
  const hasDevtoolConfig = await checkDevtoolConfigExists();

  console.log('文件是否存在:', hasDevtoolConfig);
  // 设置 context 来控制命令可见性
  await vscode.commands.executeCommand(
    'setContext',
    'hasDevtoolConfig',
    hasDevtoolConfig,
  );

  /**
   * 关闭辅助侧边栏
   */
  const closeAuxiliaryBar = async () => {
    try {
      // 检查辅助侧边栏是否可见，如果可见则关闭
      await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
      console.log('已关闭辅助侧边栏');
    }
    catch (error) {
      console.error('关闭辅助侧边栏时出错:', error);
    }
  };

  // 视图
  const viewServer = initViews(context, apiServer);

  ExtensionConfig.init(context);
  PermanentStorage.setInstance(context);

  // 初始化新建算子工程的Webview
  const createOpsProvider = new WebviewProvider(context, apiServer);

  // 初始化配置页面的Webview
  const configWelcomeProvider = new WebviewProvider(context, apiServer);

  // 初始化配置页面的Webview
  const configProjectSHProvider = new WebviewProvider(context, apiServer);

  // 注册打开Opsuite命令
  const openCommand = vscode.commands.registerCommand(
    COMMAND_OPEN,
    async () => {
      createOpsProvider.show(VIEW_LINK);
    },
  );

  // 注册在当前目录下新建算子命令
  const createOperatorInWorkspaceCommand = vscode.commands.registerCommand(
    COMMAND_CREATE_OPERATOR_IN_WORKSPACE,
    async (uri?: vscode.Uri) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('请先打开一个工作区');

        return;
      }

      // 如果提供了 uri（在文件上右键），使用该路径；否则使用工作区根目录
      const targetPath = uri ? uri.fsPath : workspaceFolders[0].uri.fsPath;

      await createOpsProvider.show(VIEW_LINK);
      // 等待 webview 加载完成后发送路径
      setTimeout(() => {
        createOpsProvider.postMessage({
          command: 'iframeSetProjectPath',
          data: targetPath,
        });
      }, 500);
    },
  );

  // 打开环境变量命令
  const openProjectSH = vscode.commands.registerCommand(
    COMMAND_PROJECT_SH,
    async () => {
      configProjectSHProvider.show(VIEW_PROJECT_SH);
    },
  );

  // 注册打开关闭算子工作-操作命令
  const toggleOpsOperateCommand = vscode.commands.registerCommand(
    COMMAND_TOGGLE_OPS_OPERATE,
    async () => {
      try {
        // 打开/关闭右侧辅助侧栏
        await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
      }
      catch (error) {
        console.log(error);
      }
    },
  );

  // 注册视图
  const opsOperateProvider = new OpsOperateProvider(context, apiServer);
  const opsOperateView = vscode.window.registerWebviewViewProvider(
    OpsOperateProvider.viewType,
    opsOperateProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  context.subscriptions.push(opsOperateView);
  // 注册命令（无论文件是否存在都要注册）
  context.subscriptions.push(toggleOpsOperateCommand);

  // 根据 devtool_config.json 文件是否存在来决定展开或关闭侧边栏
  if (hasDevtoolConfig) {
    // 延迟执行，确保 UI 已就绪
    setTimeout(async () => {
      try {
        console.log('文件存在执行展开：123123123132');
        await vscode.commands.executeCommand('OpsOperateProvider.focus');
      }
      catch (error) {
        console.error('聚焦 OpsOperateProvider 视图时出错:', error);
      }
    }, 1000);
  }
  else {
    // 如果文件不存在，关闭侧边栏
    setTimeout(async () => {
      await closeAuxiliaryBar();
    }, 500);
  }

  // 注册打开Opsuite命令
  const ConfigCommand = vscode.commands.registerCommand(
    COMMAND_CONFIG,
    async () => {
      configProvider.show(VIEW_CONFIG);
    },
  );

  // 注册打开欢迎页命令
  const welcomeCommand = vscode.commands.registerCommand(
    COMMAND_WELCOME,
    async () => {
      configWelcomeProvider.show(VIEW_WELCOME);
    },
  );

  // 注册删除欢迎页计数命令（用于手动重置）
  const clearWelcomeCountCommand = vscode.commands.registerCommand(
    COMMAND_CLEAR_WELCOME_COUNT,
    async () => {
      await context.globalState.update('welcomeShowCount', undefined);
      console.log('welcomeShowCount 已删除');
    },
  );

  // 注册清除缓存的算子工程位置命令
  const clearLastProjectPathCommand = vscode.commands.registerCommand(
    COMMAND_CLEAR_LAST_PROJECT_PATH,
    async () => {
      RemoteConfig.clearLastProjectPath();
      vscode.window.showInformationMessage('已清除缓存的算子工程位置');
    },
  );

  // 注册创建算子命令
  const createOptionsCommand = vscode.commands.registerCommand(
    COMMAND_CREATE_DIRECTORY,
    async (
      data: { createOperatorProjectDirectoryFileType: number },
      progress: vscode.Progress<{ message?: string;
        increment?: number }>,
    ) => {
      await handleOperatorProjectDirectoryFile(
        data,
        createOpsProvider,
        progress,
      );
    },
  );

  // 获取home
  const getHome = vscode.commands.registerCommand(
    COMMAND_GET_HOME,
    async (_data: unknown) => {
      return process.env.HOME;
    },
  );

  const [workspaceFolder] = vscode.workspace.workspaceFolders ?? [];

  console.log(workspaceFolder, '是否打开了文件夹');

  // 仅在未打开任何工程/文件夹时弹出欢迎页，且在本地缓存中记录次数，最多弹出两次
  if (!workspaceFolder) {
    const welcomeShowCount =
      context.globalState.get<number>('welcomeShowCount') ?? 0;

    console.log(welcomeShowCount, '打开次数');

    if (welcomeShowCount < 2) {
      vscode.commands.executeCommand(COMMAND_WELCOME);
      vscode.commands.executeCommand('workbench.view.extension.mindstudio-opssuite-vscode-plugin');
      context.globalState.update('welcomeShowCount', welcomeShowCount + 1);
    }
  }

  // 异常检测视图
  const {
    openMsSanitizerDisposable, msSanitizerPanelView,
  } =
    getMsSanitizerPanelViewProvider(context, apiServer);
  context.subscriptions.push(msSanitizerPanelView, openMsSanitizerDisposable);

  // 初始化'仿真分析-选择采集内容'页面的Webview
  const simulatorOptionsProvider = new WebviewProvider(context, apiServer);
  const simulatorOptionsCommand = vscode.commands.registerCommand(
    COMMAND_SIMULATOR_OPTIONS,
    async () => {
      simulatorOptionsProvider.show(VIEW_OPTIONS_SIMULATOR);
    },
  );

  // 订阅销毁事件
  context.subscriptions.push(apiServer);
  context.subscriptions.push(viewServer);
  context.subscriptions.push(createOptionsCommand);
  context.subscriptions.push(openCommand);
  context.subscriptions.push(openProjectSH);
  context.subscriptions.push(ConfigCommand);
  context.subscriptions.push(welcomeCommand);
  context.subscriptions.push(clearWelcomeCountCommand);
  context.subscriptions.push(clearLastProjectPathCommand);
  // 注意: createOptionsCommand 已在上面添加,不要重复添加
  context.subscriptions.push(getHome);
  context.subscriptions.push(createOperatorInWorkspaceCommand);
  context.subscriptions.push(simulatorOptionsCommand);

  // 注册 CSV 编辑器提供者
  const csvEditorProvider = new CsvEditorProvider();
  const csvEditorRegistration = vscode.window.registerCustomEditorProvider(
    CsvEditorProvider.viewType,
    csvEditorProvider,
    {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    },
  );

  context.subscriptions.push(csvEditorRegistration);

  // 注册打开 CSV 文件的命令
  const openCsvCommand = vscode.commands.registerCommand(
    'csv-viewer.openCsv',
    async () => {
      // 方式1：让用户选择文件
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: '打开',
        filters: {
          'CSV 文件': ['csv'],
          所有文件: ['*'],
        },
      });

      if (fileUri && fileUri[0]) {
        // 使用自定义编辑器打开文件
        await vscode.commands.executeCommand(
          'vscode.openWith',
          fileUri[0],
          CsvEditorProvider.viewType,
        );
      }
    },
  );

  context.subscriptions.push(openCsvCommand);

  const flashMsSanitizerRunData = vscode.commands.registerCommand(
    COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
    async () => {
      // 后续待优化点，目前通过非法操作方式拿到视图实例
      // 拿到MsSanitizerRunData的视图实例，主动下发刷新命令
      const msSanitizerRunData =
        ViewServer.getInstance().providerWebViewMap.msSanitizerSidebarView;

      console.log('ViewServer.getInstance()', msSanitizerRunData);
      msSanitizerRunData?.webview?.postMessage({ command: 'iframeFlashMsSanitizerRunData' });
    },
  );

  context.subscriptions.push(flashMsSanitizerRunData);

  const flashPerformanceRunData = vscode.commands.registerCommand(
    COMMAND_FLASH_PERFORMANCE_RUN_DATA,
    async () => {
      // 拿到PerformanceRunData的视图实例，主动下发刷新命令
      const performanceRunData =
        ViewServer.getInstance().providerWebViewMap.performanceSidebarView;

      console.log('ViewServer.getInstance()', performanceRunData);
      performanceRunData?.webview?.postMessage({ command: 'iframeRefreshData' });
    },
  );

  context.subscriptions.push(flashPerformanceRunData);

  const watchWorkSpaceFolderChange =
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA);
    });

  context.subscriptions.push(watchWorkSpaceFolderChange);

  // 检查是否需要执行创建算子命令（必须在所有命令注册完成后执行）
  const runCommand = context.globalState.get<string>('runCommand');
  const runCommandParam = context.globalState.get<number>('runCommand-param');

  if (runCommand === COMMAND_CREATE_DIRECTORY && runCommandParam) {
    console.log('检测到需要执行创建算子命令，类型:', runCommandParam);
    // 使用 setTimeout 延迟执行，确保所有插件初始化完成
    setTimeout(async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: '开始创建算子文件...',
            cancellable: false,
          },
          async (progress) => {
            try {
              // 执行创建算子命令
              await vscode.commands.executeCommand(
                COMMAND_CREATE_DIRECTORY,
                { createOperatorProjectDirectoryFileType: runCommandParam },
                progress,
              );
              // 清除 runCommand，避免重复执行
              await context.globalState.update('runCommand', undefined);
              await context.globalState.update('runCommand-param', undefined);
            }
            catch (error) {
              console.error('执行创建算子命令失败:', error);
            }
          },
        );
      }
      catch (error) {
        console.error('创建算子任务启动失败:', error);
      }
    }, 1000);
  }

  if (vscode.workspace.workspaceFolders) {
    console.log('激活', vscode.workspace.workspaceFolders);
  }

  console.log('🧠 MindStudio 插件加载器已激活。');
  const installer = new MindStudioPluginInstaller(context, {
    pluginId: 'ascend.mindstudio-debug-vscode-plugin',
    vsixRelativePath:
      './out/plugin/mindstudio-debug-vscode-plugin/MindStudio-Debug-VSCode-Plugin-1.0.7.vsix',
    pluginVersion: '1.0.7',
  });

  await installer.installIfNeeded();
  console.log('执行了', context);
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
  return new ApiServer(apis as ApiGroup);
}

/**
 * 视图
 * @param context 扩展上下文
 * @param apiServer api服务
 */
function initViews(
  context: vscode.ExtensionContext,
  apiServer: ApiServer,
): ViewServer {
  const viewServer = new ViewServer(routes, context);

  viewServer.onViewActivated((path, webview) => {
    apiServer.addWebview(path, webview);
  });
  viewServer.onViewDisposed((path) => {
    apiServer.removeWebview(path);
  });

  return viewServer;
}

export function deactivate() {
  if (extensionContext) {
    // 卸载/禁用扩展时清空欢迎页弹出计数
    extensionContext.globalState.update('welcomeShowCount', undefined);
  }
}
