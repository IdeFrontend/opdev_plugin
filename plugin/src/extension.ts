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
  VIEW_OPTIONS_SIMULATOR,
  COMMAND_ON_BOARD_OPTIONS,
  VIEW_OPTIONS_ON_BOARD,
  COMMAND_SANITIZER_OPTIONS,
  VIEW_OPTIONS_SANITIZER,
  COMMAND_OPEN_PROJECT,
  VIEW_OPEN_PROJECT,
  COMMAND_MARK_AS_OPERATOR_PROJECT,
  COMMAND_MARK_AS_MULTI_OPERATOR_PROJECT,
  COMMAND_UNMARK_AS_OPERATOR_PROJECT,
  COMMAND_UNMARK_AS_MULTI_OPERATOR_PROJECT,
  COMMAND_OPERATOR_PROJECT_BUILD,
  COMMAND_OPERATOR_PROJECT_BUILD_EXAMPLE,
  COMMAND_OPERATOR_PROJECT_RUN,
  COMMAND_OPERATOR_PROJECT_CPU_DEBUG,
  COMMAND_OPERATOR_PROJECT_NPU_DEBUG,
  COMMAND_OPERATOR_PROJECT_CPU_DEBUG_CONFIG,
  COMMAND_OPERATOR_PROJECT_NPU_DEBUG_CONFIG,
  COMMAND_OPERATOR_PROJECT_SANITIZER,
  COMMAND_OPERATOR_PROJECT_ON_BOARD,
  COMMAND_OPERATOR_PROJECT_SIMULATION,
} from './constants';
import { FolderContextMenuService } from './service/folder-context-menu-service';
import { AutoMultiProjectDetector } from './service/auto-multi-project-detector';
import { OperatorProjectIconTheme } from './class/operator-project-icon-theme';

let extensionContext: vscode.ExtensionContext | undefined;

/**
 * 将文件 URI 转换为文件夹 URI
 * 如果传入的是文件夹 URI，则直接返回
 * 如果传入的是文件 URI，则返回文件所在的文件夹 URI
 */
function getFolderUri(uri: vscode.Uri): vscode.Uri {
  try {
    const stat = fs.statSync(uri.fsPath);
    if (stat.isDirectory()) {
      return uri;
    }
    // 如果是文件，返回文件所在的文件夹
    return vscode.Uri.file(path.dirname(uri.fsPath));
  } catch {
    // 如果无法获取文件信息，假设是文件，返回父目录
    return vscode.Uri.file(path.dirname(uri.fsPath));
  }
}

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

  // 初始化打开算子工程的Webview
  const openProjectProvider = new WebviewProvider(context, apiServer);

  // 注册打开Opsuite命令
  const openCommand = vscode.commands.registerCommand(
    COMMAND_OPEN,
    async () => {
      createOpsProvider.show(VIEW_LINK);
    },
  );

  // 注册打开算子工程命令
  const openProjectCommand = vscode.commands.registerCommand(
    COMMAND_OPEN_PROJECT,
    async () => {
      openProjectProvider.show(VIEW_OPEN_PROJECT);
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

  // 初始化'上板分析-选择采集内容'页面的Webview
  const onBoardOptionsProvider = new WebviewProvider(context, apiServer);
  const onBoardOptionsCommand = vscode.commands.registerCommand(
    COMMAND_ON_BOARD_OPTIONS,
    async () => {
      onBoardOptionsProvider.show(VIEW_OPTIONS_ON_BOARD);
    },
  );

  // 初始化'异常检测-选择检测内容'页面的Webview
  const sanitizerOptionsProvider = new WebviewProvider(context, apiServer);
  const sanitizerOptionsCommand = vscode.commands.registerCommand(
    COMMAND_SANITIZER_OPTIONS,
    async () => {
      sanitizerOptionsProvider.show(VIEW_OPTIONS_SANITIZER);
    },
  );

  // 订阅销毁事件
  context.subscriptions.push(apiServer);
  context.subscriptions.push(viewServer);
  context.subscriptions.push(createOptionsCommand);
  context.subscriptions.push(openCommand);
  context.subscriptions.push(openProjectCommand);
  context.subscriptions.push(openProjectSH);
  context.subscriptions.push(ConfigCommand);
  context.subscriptions.push(welcomeCommand);
  context.subscriptions.push(clearWelcomeCountCommand);
  context.subscriptions.push(clearLastProjectPathCommand);
  // 注意: createOptionsCommand 已在上面添加,不要重复添加
  context.subscriptions.push(getHome);
  context.subscriptions.push(createOperatorInWorkspaceCommand);
  context.subscriptions.push(simulatorOptionsCommand);
  context.subscriptions.push(onBoardOptionsCommand);
  context.subscriptions.push(sanitizerOptionsCommand);

  // 初始化文件夹装饰提供者
  const iconTheme = OperatorProjectIconTheme.getInstance(context);
  
  // 注意：不在插件激活时自动检测并标记算子工程合集
  // 只在用户明确打开项目时（link-controller.ts）才进行自动检测

  // 注册文件夹右键菜单命令
  // 注意：由于 VSCode API 限制，无法在菜单显示前更新上下文变量
  // 菜单的 when 条件在菜单显示时评估，此时上下文变量可能不是最新的
  // 解决方案：在命令执行时检查状态，如果不是对应的类型就静默返回
  const markAsOperatorProjectCommand = vscode.commands.registerCommand(
    COMMAND_MARK_AS_OPERATOR_PROJECT,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹');
        return;
      }
      await FolderContextMenuService.markAsOperatorProject(uri);
      
      // 操作完成后触发装饰更新
      iconTheme.fireDecorationUpdate(uri);
      
      // 操作完成后更新上下文变量
      await updateContextForUri(uri);
    },
  );

  const markAsMultiOperatorProjectCommand = vscode.commands.registerCommand(
    COMMAND_MARK_AS_MULTI_OPERATOR_PROJECT,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹');
        return;
      }
      await FolderContextMenuService.markAsMultiOperatorProject(uri);
      
      // 操作完成后触发装饰更新
      iconTheme.fireDecorationUpdate(uri);
      
      // 操作完成后更新上下文变量
      await updateContextForUri(uri);
    },
  );

  const unmarkAsOperatorProjectCommand = vscode.commands.registerCommand(
    COMMAND_UNMARK_AS_OPERATOR_PROJECT,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹');
        return;
      }
      await FolderContextMenuService.unmarkAsOperatorProject(uri);
      
      // 操作完成后触发装饰更新
      iconTheme.fireDecorationUpdate(uri);
      
      // 操作完成后更新上下文变量
      await updateContextForUri(uri);
    },
  );

  const unmarkAsMultiOperatorProjectCommand = vscode.commands.registerCommand(
    COMMAND_UNMARK_AS_MULTI_OPERATOR_PROJECT,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹');
        return;
      }
      await FolderContextMenuService.unmarkAsMultiOperatorProject(uri);
      
      // 操作完成后触发装饰更新
      iconTheme.fireDecorationUpdate(uri);
      
      // 操作完成后更新上下文变量
      await updateContextForUri(uri);
    },
  );

  const operatorProjectBuildCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_BUILD,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.buildOperatorProject(folderUri);
    },
  );

  const operatorProjectBuildExampleCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_BUILD_EXAMPLE,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.buildExampleOperatorProject(folderUri);
    },
  );

  const operatorProjectRunCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_RUN,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.runOperatorProject(folderUri);
    },
  );

  const operatorProjectCpuDebugCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_CPU_DEBUG,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.cpuDebugOperatorProject(folderUri);
    },
  );

  const operatorProjectNpuDebugCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_NPU_DEBUG,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.npuDebugOperatorProject(folderUri);
    },
  );

  const operatorProjectCpuDebugConfigCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_CPU_DEBUG_CONFIG,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.cpuDebugConfigOperatorProject(folderUri);
    },
  );

  const operatorProjectNpuDebugConfigCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_NPU_DEBUG_CONFIG,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.npuDebugConfigOperatorProject(folderUri);
    },
  );

  const operatorProjectSanitizerCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_SANITIZER,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.sanitizerOperatorProject(folderUri);
    },
  );

  const operatorProjectOnBoardCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_ON_BOARD,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.onBoardOperatorProject(folderUri);
    },
  );

  const operatorProjectSimulationCommand = vscode.commands.registerCommand(
    COMMAND_OPERATOR_PROJECT_SIMULATION,
    async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请右键点击文件夹或文件');
        return;
      }
      const folderUri = getFolderUri(uri);
      await FolderContextMenuService.simulationOperatorProject(folderUri);
    },
  );


  context.subscriptions.push(
    markAsOperatorProjectCommand,
    markAsMultiOperatorProjectCommand,
    unmarkAsOperatorProjectCommand,
    unmarkAsMultiOperatorProjectCommand,
    operatorProjectBuildCommand,
    operatorProjectBuildExampleCommand,
    operatorProjectRunCommand,
    operatorProjectCpuDebugCommand,
    operatorProjectNpuDebugCommand,
    operatorProjectCpuDebugConfigCommand,
    operatorProjectNpuDebugConfigCommand,
    operatorProjectSanitizerCommand,
    operatorProjectOnBoardCommand,
    operatorProjectSimulationCommand,
  );

  // 注册资源选择变化监听，动态更新上下文变量
  // 在命令执行前更新上下文变量，这样菜单显示逻辑才能正确工作
  const updateContextForUri = async (uri: vscode.Uri | undefined) => {
    if (!uri) {
      await vscode.commands.executeCommand('setContext', 'operatorProjectMarked', false);
      await vscode.commands.executeCommand('setContext', 'multiOperatorProjectMarked', false);
      await vscode.commands.executeCommand('setContext', 'operatorProjectType', '');
      return;
    }

    const checkResult = await FolderContextMenuService.checkIsOperatorProject(uri);
    
    await vscode.commands.executeCommand(
      'setContext',
      'operatorProjectMarked',
      checkResult.isOperatorProject && !checkResult.isMultiProject,
    );
    await vscode.commands.executeCommand(
      'setContext',
      'multiOperatorProjectMarked',
      checkResult.isMultiProject,
    );
    
    await vscode.commands.executeCommand(
      'setContext',
      'operatorProjectType',
      checkResult.projectType || '',
    );
  };

  // 初始化上下文变量
  await vscode.commands.executeCommand('setContext', 'operatorProjectMarked', false);
  await vscode.commands.executeCommand('setContext', 'multiOperatorProjectMarked', false);
  await vscode.commands.executeCommand('setContext', 'operatorProjectType', '');

  // 注意：由于 VSCode API 限制，无法在菜单显示前更新上下文变量
  // 菜单的 when 条件在菜单显示时评估，此时上下文变量可能不是最新的
  // 解决方案：在命令执行时检查状态，如果不是对应的类型就静默返回
  // 这样即使菜单显示了，也不会执行错误操作

  // 监听资源管理器选择变化，动态更新上下文变量
  // 注意：VSCode 没有直接的 API 来监听资源管理器的选择变化
  // 我们通过在命令执行前更新上下文变量来实现
  // 但更好的方式是使用 onDidChangeTreeData 或其他方式

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
      
      // 检测工作区中的算子工程
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const { WorkspaceDetectorService } = await import('./service/workspace-detector-service.js');
        
        for (const folder of workspaceFolders) {
          await WorkspaceDetectorService.detectAndRegisterWorkspace(folder.uri.fsPath).catch((error) => {
            console.error('检测工作区算子工程失败:', error);
          });
        }
      }
    });

  context.subscriptions.push(watchWorkSpaceFolderChange);

  // 插件激活时检测当前工作区
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    // 延迟执行，确保插件完全初始化
    setTimeout(async () => {
      const { WorkspaceDetectorService } = await import('./service/workspace-detector-service.js');
      
      for (const folder of vscode.workspace.workspaceFolders!) {
        await WorkspaceDetectorService.detectAndRegisterWorkspace(folder.uri.fsPath).catch((error) => {
          console.error('检测工作区算子工程失败:', error);
        });
      }
    }, 2000);
  }

  if (vscode.workspace.workspaceFolders) {
    console.log('激活', vscode.workspace.workspaceFolders);
  }

  console.log('🧠 MindStudio 插件加载器已激活。');
  const installer = new MindStudioPluginInstaller(context, {
    pluginId: 'ascend.mindstudio-debug-vscode-plugin',
    vsixRelativePath:
      './out/plugin/mindstudio-debug-vscode-plugin/MindStudio-Debug-VSCode-Plugin-1.0.8.vsix',
    pluginVersion: '1.0.8',
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
