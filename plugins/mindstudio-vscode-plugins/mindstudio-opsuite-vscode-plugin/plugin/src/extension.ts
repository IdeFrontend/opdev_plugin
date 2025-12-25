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
import { promisify } from 'util';
import { exec } from 'child_process';

import i18nResource from 'shared:/i18n';

import { ExplorerRootUtils } from './class/ExplorerRootUtils';
import { WebviewProvider } from './class/webviewProvider';
import { handleOperatorProjectDictoryFile } from './class/WebviewMessageList';
import OpsOption from './class/OpsOption';
import { CustomSidebarProvider } from './class/CustomSidebarProvider';
import { CsvEditorProvider } from './class/CsvEditorProvider';
import { ApiServer } from './core/ApiServer';
import { ViewServer } from './core/view/ViewServer';
import { routes } from './routes';
import { apis } from './apis';
import { PermanentStorage } from './class/PermanentStorage';
import { ExtensionConfig } from './services/ExtensionConfig';

import { OpsOperateProvider } from './class/OpsOperateProvider';
import { getMsSanitizerPanelViewProvider } from './class/MsSanitizerPanelView';

import { MindStudioPluginInstaller } from './class/MindStudioPluginInstaller';

let extensionContext: vscode.ExtensionContext | undefined;
const execAsync = promisify(exec);


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
  const devtoolConfigPath = path.join(workspacePath, '.vscode', 'devtool_config.json');

  try {
    return fs.existsSync(devtoolConfigPath);
  } catch (error) {
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
  // 国际化
  await initI18n();

  
  // 检查 devtool_config.json 文件是否存在
  const hasDevtoolConfig = await checkDevtoolConfigExists();
  console.log('文件是否存在:', hasDevtoolConfig);
  // 设置 context 来控制命令可见性
  await vscode.commands.executeCommand('setContext', 'hasDevtoolConfig', hasDevtoolConfig);

  /**
   * 关闭辅助侧边栏
   */
  const closeAuxiliaryBar = async () => {
    try {
      // 检查辅助侧边栏是否可见，如果可见则关闭
      await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
      console.log('已关闭辅助侧边栏');
    } catch (error) {
      console.error('关闭辅助侧边栏时出错:', error);
    }
  };

  // 监听工作区文件夹变化，重新检查配置文件
  // const updateDevtoolConfigContext = async () => {
  //   const exists = await checkDevtoolConfigExists();
  //   await vscode.commands.executeCommand('setContext', 'hasDevtoolConfig', exists);
  //   return exists;
  // };

  // // 监听工作区文件夹变化
  // const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
  //   const exists = await updateDevtoolConfigContext();
  //   // 如果文件存在且侧边栏未展开，则展开它
  //   if (exists) {
  //     setTimeout(async () => {
  //       try {
  //          console.log('执行展开文件存在',exists);
  //         await vscode.commands.executeCommand('OpsOperateProvider.focus');
  //       } catch (error) {
  //         console.error('聚焦 OpsOperateProvider 视图时出错:', error);
  //       }
  //     }, 1000);
  //   } else {
  //     // 如果文件不存在，关闭侧边栏
  //     setTimeout(async () => {
  //       await closeAuxiliaryBar();
  //     }, 500);
  //   }
  // });

  // context.subscriptions.push(workspaceWatcher);

  let progress: any;
  if (context.globalState.get<string>('runCommand') === 'huawei-op-devtools.createDictory') {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `开始创建算子文件...`,
      cancellable: false
    }, async pro => progress = pro)
  }
  // api接口
  const apiServer = initApiServer();

  // 视图
  const viewServer = initViews(context, apiServer);

  ExtensionConfig.init(context);
  PermanentStorage.setInstance(context);

  // 初始化新建算子工程的Webview
  const createOpsProvider = new WebviewProvider(context, apiServer);

  // 初始化配置页面的Webview
  const configProvider = new WebviewProvider(context);

  // 初始化配置页面的Webview
  const configWelcomeProvider = new WebviewProvider(context);

  // 初始化配置页面的Webview
  const configNewPrototypeProvider = new WebviewProvider(context);

  // 初始化配置页面的Webview
  const configProjectSHProvider = new WebviewProvider(context, apiServer);

  const opsOption = new OpsOption(context);

  // 注册打开Opsuite命令
  const openCommand = vscode.commands.registerCommand('huawei-op-devtools.open', async () => {
    createOpsProvider.show('Link');
  });

  // 打开环境变量命令
  const openProjectSH = vscode.commands.registerCommand('huawei-op-devtools.projectSH', async () => {
    configProjectSHProvider.show('ProjectSH');
  });

  // 注册打开关闭算子工作-操作命令
  const toggleOpsOperateCommand = vscode.commands.registerCommand('huawei-op-devtools.toggleOpsOperate', async () => {
    try {
      // 打开/关闭右侧辅助侧栏
      await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
    } catch (error) {
      console.log(error)
    }
  });

  // 注册视图
  const opsOperateProvider = new OpsOperateProvider(context);
  const opsOperateView = vscode.window.registerWebviewViewProvider(OpsOperateProvider.viewType, opsOperateProvider, {
    webviewOptions: {
      retainContextWhenHidden: true,
    },
  });
  context.subscriptions.push(opsOperateView);
  // 注册命令（无论文件是否存在都要注册）
  context.subscriptions.push(toggleOpsOperateCommand);
  
  // 根据 devtool_config.json 文件是否存在来决定展开或关闭侧边栏
  if (hasDevtoolConfig) {
    // 延迟执行，确保 UI 已就绪
    setTimeout(async () => {
      try {
        console.log('文件存在执行展开：123123123132')
        await vscode.commands.executeCommand('OpsOperateProvider.focus');
      } catch (error) {
        console.error('聚焦 OpsOperateProvider 视图时出错:', error);
      }
    }, 1000);
  } else {
    // 如果文件不存在，关闭侧边栏
    setTimeout(async () => {
      await closeAuxiliaryBar();
    }, 500);
  }
  
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

  // 注册删除欢迎页计数命令（用于手动重置）
  const clearWelcomeCountCommand = vscode.commands.registerCommand('huawei-op-devtools.clearWelcomeCount', async () => {
    await context.globalState.update('welcomeShowCount', undefined);
    console.log('welcomeShowCount 已删除');
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

  // 注册创建算子命令
  const createOptionsCommand = vscode.commands.registerCommand('huawei-op-devtools.createDictory', async (data: any, progress: any) => {
    await handleOperatorProjectDictoryFile({ createOperatorProjectDictoryFileType: data }, createOpsProvider, progress);
  });

  // 获取home
  const getHome = vscode.commands.registerCommand('huawei-op-devtools.getHome', async (data: any) => {
    return process.env.HOME;
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
        await opsOption.createOpsByPrototype(uri.fsPath, 'ascend', undefined);
      }
    });
  } catch (error: any) {
    // 捕获命令已存在的错误，这是开发模式下常见的情况
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('already exists') || errorMessage.includes('already registered')) {
      console.warn('命令 extension.jsonButtonAction 已存在，使用现有命令');
      // 创建一个虚拟的 Disposable，实际使用现有的命令
      buttonCommand = { dispose: () => { } };
    } else {
      // 其他错误仍然抛出，但不会阻止扩展加载
      console.error('注册命令 extension.jsonButtonAction 时发生未知错误:', errorMessage);
      buttonCommand = { dispose: () => { } };
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
  const [workspaceFolder] = vscode.workspace.workspaceFolders ?? [];
  console.log(workspaceFolder, '是否打开了文件夹');
  // 仅在未打开任何工程/文件夹时弹出欢迎页，且在本地缓存中记录次数，最多弹出两次
  if (!workspaceFolder) {
    const welcomeShowCount = context.globalState.get<number>('welcomeShowCount') ?? 0;
    console.log(welcomeShowCount, '打开次数');
    if (welcomeShowCount < 2) {
      vscode.commands.executeCommand('huawei-op-devtools.welcome');
      vscode.commands.executeCommand('workbench.view.extension.mindstudio-opssuite-vscode-plugin');
      context.globalState.update('welcomeShowCount', welcomeShowCount + 1);
    }
  }
  context.subscriptions.push(buttonCommand, button);

  // 异常检测视图
  const { openMsSanitizerDisposable, msSanitizerPanelView } = getMsSanitizerPanelViewProvider(context);

  context.subscriptions.push(msSanitizerPanelView, openMsSanitizerDisposable);
  // createOpsProvider.show('ProjectSH');
  // 订阅销毁事件
  context.subscriptions.push(apiServer);
  context.subscriptions.push(viewServer);
  context.subscriptions.push(buildOpsCommand);
  context.subscriptions.push(createOptionsCommand);
  context.subscriptions.push(openCommand);
  context.subscriptions.push(openProjectSH);
  context.subscriptions.push(ConfigCommand);
  context.subscriptions.push(createCommand);
  context.subscriptions.push(welcomeCommand);
  context.subscriptions.push(newPrototypeCommand);
  context.subscriptions.push(clearWelcomeCountCommand);
  context.subscriptions.push(createOptionsCommand);
  context.subscriptions.push(getHome);

  // 创建侧边栏提供者
  const sidebarProvider = new CustomSidebarProvider(context);

  // 注册WebView视图
  const sidebarView = vscode.window.registerWebviewViewProvider(CustomSidebarProvider.viewType, sidebarProvider, {
    webviewOptions: {
      retainContextWhenHidden: true, // WebView隐藏时保持状态
    },
  });

  context.subscriptions.push(sidebarView);

  // 注册 CSV 编辑器提供者
  const csvEditorProvider = new CsvEditorProvider();
  const csvEditorRegistration = vscode.window.registerCustomEditorProvider(CsvEditorProvider.viewType, csvEditorProvider, {
    webviewOptions: {
      retainContextWhenHidden: true,
    },
    supportsMultipleEditorsPerDocument: false,
  });

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
        所有文件: ['*'],
      },
    });

    if (fileUri && fileUri[0]) {
      // 使用自定义编辑器打开文件
      await vscode.commands.executeCommand('vscode.openWith', fileUri[0], CsvEditorProvider.viewType);
    }
  });

  context.subscriptions.push(openCsvCommand);

  if (vscode.workspace.workspaceFolders) {
    console.log('激活', vscode.workspace.workspaceFolders);
    try {
      const runCommand = context.globalState.get<string>('runCommand');
      if (runCommand) {
        // 延迟执行，确保 UI 已就绪
        setTimeout(async () => {
          try {
            console.log('执行命令', runCommand);
            await vscode.commands.executeCommand(runCommand, context.globalState.get('runCommand-param'), progress);
            context.globalState.update('runCommand', null);
            context.globalState.update('runCommand-param', null);
          } catch (e) {
            console.error('Failed to run auto command:', e);
          }
        }, 1000); // 等待窗口加载完成
      }
    } catch (e) {
      // ignore invalid query
    }
  }

  console.log('🧠 MindStudio 插件加载器已激活。');
  const installer = new MindStudioPluginInstaller(context, {
    pluginId: 'ascend.mindstudio-debug-vscode-plugin',
    vsixRelativePath: './out/plugin/mindstudio-debug-vscode-plugin/MindStudio-Debug-VSCode-Plugin-1.0.7.vsix',
    pluginVersion: '1.0.7'
  });

  await installer.installIfNeeded();
  console.log('执行了', context);
  await exportEnvToFile(context);
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
function initViews(context: vscode.ExtensionContext, apiServer: ApiServer): ViewServer {
  const viewServer = new ViewServer(routes, context);

  viewServer.onViewActivated((path, webview) => {
    apiServer.addWebview(path, webview);
  });
  viewServer.onViewDisposed((path) => {
    apiServer.removeWebview(path);
  });

  return viewServer;
}

/**
 * 在扩展根目录执行环境导出命令
 */
async function exportEnvToFile(context: vscode.ExtensionContext) {
  // 优先使用当前工作区根目录作为执行目录，其次回退到扩展安装目录
  // const selectedFiles = ExplorerRootUtils.getPrimaryRoot();
  // console.log(selectedFiles);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  console.log('workspaceFolder', workspaceFolder);
  const cwd = workspaceFolder?.uri.fsPath ?? context.extensionPath;
  console.log('cwd', cwd)
  const targetDir = path.join(cwd, '.arts');
  const targetFile = path.join(targetDir, 'env');
  try {
    await fs.promises.mkdir(targetDir, { recursive: true });
    await execAsync('. /etc/profile && env > ./.arts/.env', {
      cwd,
      shell: '/bin/bash',
      windowsHide: true,
    });
    console.log(`环境变量已导出到: ${targetFile}`);
  } catch (error) {
    console.error('导出环境变量失败:', error);
  }
}

export function deactivate() {
  if (extensionContext) {
    // 卸载/禁用扩展时清空欢迎页弹出计数
    extensionContext.globalState.update('welcomeShowCount', undefined);
  }
}
