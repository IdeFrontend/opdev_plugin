import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { CommandExecutor } from 'plugin:/class/CommandOptions';
import { OpsAPI } from '../helpers/OpsAPI';
import { getFiles } from '../../autogen-server';
import { Project } from '../services/project/Project';
import {
  GetProjectIdResult,
  GetHomeResult,
  GetProjectSHResult,
  GetBuildConfigResult,
  SaveAndStartBuildParams,
  SaveAndStartBuildExampleParams,
  GetSanitizerFormResult,
  RemotePathSearchParams,
  RemotePathSearchResult,
  SaveProjectSHParams,
  CreatedProjectParams,
  GetLastProjectPathResult,
  GetWorkspaceResult,
  SetActiveConfigParams,
  GetActiveConfigResult,
  BuildOpParams,
  BuildExampleParams,
  RunSanitizerParams,
  RunExampleParams,
  SimulateParams,
  OnBoardParams,
  DownloadDataParams,
  DeleteNodeParams,
  SelectFolderResult,
  CheckDevtoolConfigResult,
  JumpToFileParams,
  BuildCreateOpsParams,
  StartLinkCreateOpsParams,
  SaveBuildConfigParams,
  SaveSanitizerFormParams,
} from 'shared:/api-types';

// 全局任务管理器：用于追踪和终止正在执行的任务
let currentExecutor: CommandExecutor | null = null;

// 临时存储当前激活的配置
const tempObj = { currentActiveConfig: '' };

// 辅助函数：通过 webview 发送消息
function postMessageToWebview(webview: vscode.Webview, command: string, data: any): void {
  webview.postMessage({
    command,
    data,
  });
}

// 辅助函数：获取 extension context
function getExtensionContext(): vscode.ExtensionContext {
  return (globalThis as any).extensionContext;
}

export const webviewApis: ApiGroup = {
  webview: {
    // 获取项目ID
    async getProjectId(): Promise<GetProjectIdResult> {
      await OpsAPI.init();
      return OpsAPI.getProjectId();
    },

    // 获取HOME目录
    getHome(): GetHomeResult {
      return process.env.HOME || '';
    },

    // 获取项目SH脚本
    async getProjectSH(): Promise<GetProjectSHResult> {
      const project = Project.getInstance();
      return process.env.ASCEND_ENV_SCRIPT || project.projectSH || '';
    },

    // 更新Project
    async updateProject(): Promise<void> {
      const project = Project.getInstance();
      project.updateView();
    },

    // 获取构建配置
    async getBuildConfig(): Promise<GetBuildConfigResult> {
      await OpsAPI.init();
      const configData = await OpsAPI.getConfigData();
      return JSON.stringify(configData);
    },

    // 保存构建配置（返回字符串格式）
    async saveBuildConfig(params: SaveBuildConfigParams): Promise<GetBuildConfigResult> {
      await OpsAPI.init();
      await OpsAPI.saveBuildConfig(params.data);
      const configData = await OpsAPI.getConfigData();
      return JSON.stringify(configData);
    },

    // 保存并开始构建
    async saveAndStartBuild(params: SaveAndStartBuildParams): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.saveBuildConfig(params.data, false);
      const configData = await OpsAPI.getConfigData();
      const config_id = params.data.find((v: any) => v.config_type === 'build_op').config_id;
      await OpsAPI.startBuild(config_id);
    },

    // 保存并开始构建示例
    async saveAndStartBuildExample(params: SaveAndStartBuildExampleParams): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.saveBuildConfig(params.data, false);
      const config_id = params.data.find((v: any) => v.config_type === 'build_example').config_id;
      await OpsAPI.startBuildExample(config_id);
    },

    // 获取 Sanitizer 配置
    async getSanitizerForm(): Promise<GetSanitizerFormResult> {
      await OpsAPI.init();
      const configData = await OpsAPI.getSanitizerConfigs();
      return JSON.stringify((configData || [])[0] || {});
    },

    // 保存 Sanitizer 配置（返回字符串格式）
    async saveSanitizerForm(params: SaveSanitizerFormParams): Promise<GetSanitizerFormResult> {
      await OpsAPI.init();
      await OpsAPI.saveSanitizerForm(params.data);
      const configData = await OpsAPI.getSanitizerConfigs();
      return JSON.stringify((configData || [])[0] || {});
    },

    // 远程路径搜索
    remotePathSearch(params: RemotePathSearchParams): RemotePathSearchResult {
      const res = getFiles(params.keyword);
      return {
        type: params.type,
        list: res,
      };
    },

    // 保存项目SH脚本
    async saveProjectSH(params: SaveProjectSHParams): Promise<void> {
      try {
        await OpsAPI.updateShScript(params.accendEnvScript);
        vscode.window.showInformationMessage('环境变量设置成功', params.accendEnvScript);
        const project = Project.getInstance();
        project.updateView();
      } catch (error) {
        vscode.window.showErrorMessage(`环境变量设置失败: ${error}`);
        throw error;
      }
    },

    // 创建项目
    async createdProject(params: CreatedProjectParams): Promise<void> {
      const context = getExtensionContext();
      // 缓存 projectPath 到 globalState
      const originalProjectPath = params.projectPath;
      context.globalState.update('lastProjectPath', originalProjectPath);

      // 标准算子projectPath需增加 /ops-math/math路径
      let originPath;
      if (params.createOperatorProjectDictoryFileType === 2) {
        originPath = params.projectPath;
        params.projectPath += '/ops-math/math';
      }
      vscode.window.showInformationMessage(`初始化中`);

      const executor = new CommandExecutor();

      // 标准算子解压缩
      if (params.createOperatorProjectDictoryFileType === 2) {
        await executor.execute(`mkdir -p ${originPath}`, ['File exists']);
        const zipUrl = path.resolve(context.extensionPath, `out/templates/code_template/op-math/ops-math.zip`);
        await executor.execute(`unzip -o ${zipUrl} -d ${originPath}`);
      }
      await executor.execute(`mkdir -p ${params.projectPath}/${params.projectName}`, ['File exists']);
      if (params.projectSH) {
        await executor.execute(`chmod +x ${params.projectSH}`);
        await executor.execute(`${params.projectSH}`);
      }
      await OpsAPI.init({
        accendEnvScript: params.projectSH,
        projectPath: params.projectPath,
        projectName: params.projectName
      });
      await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(`${params.projectPath}/${params.projectName}`));
      // 规范化路径
      const normalizedProjectPath = path.normalize(params.projectPath);
      const normalizedProjectName = path.normalize(params.projectName);
      const fullProjectPath = path.join(normalizedProjectPath, normalizedProjectName);

      context.globalState.update('runCommand', 'huawei-op-devtools.createDictory');
      context.globalState.update('runCommand-param', params.createOperatorProjectDictoryFileType);

      // 在远程环境中，我们可以直接打开本地路径（相对于远程系统）
      const localUri = vscode.Uri.file(fullProjectPath);
      console.log('vscode.openFolder，打开新目录', localUri);

      // 询问用户是在当前窗口打开还是新窗口打开
      const choice = await vscode.window.showInformationMessage(
        '选择打开方式',
        { modal: true },
        '当前窗口',
        '新窗口'
      );

      // 如果用户取消了选择，则不执行打开操作
      if (!choice) {
        return;
      }

      const forceNewWindow = choice === '新窗口';

      // 如果用户取消了选择，则不打开文件夹
      try {
        await vscode.commands.executeCommand('vscode.openFolder', localUri, {
          forceNewWindow: forceNewWindow,
        });
        vscode.window.showInformationMessage(`打开算子工程目录成功`);
      } catch (e) {
        vscode.window.showInformationMessage(`打开算子工程目录失败: ${e}`);
      }
    },

    // 获取最后项目路径
    async getLastProjectPath(): Promise<GetLastProjectPathResult> {
      const context = getExtensionContext();
      return context.globalState.get<string>('lastProjectPath') || null;
    },

    // 获取工作区路径
    getWorkspace(): GetWorkspaceResult {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : null;
    },

    // 设置激活的配置
    setActiveConfig(params: SetActiveConfigParams): void {
      tempObj.currentActiveConfig = params.configId;
    },

    // 获取激活的配置
    getActiveConfig(): GetActiveConfigResult {
      return tempObj.currentActiveConfig;
    },

    // 构建算子
    async buildOp(params: BuildOpParams): Promise<void> {
      try {
        await OpsAPI.init();
        // 保存当前 executor 引用，用于可能的终止操作
        currentExecutor = OpsAPI.getExecutor();
        await OpsAPI.startBuild();
      } finally {
        // 清除 executor 引用
        currentExecutor = null;
      }
    },

    // 构建示例
    async buildExample(params: BuildExampleParams): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.startBuildExample();
    },

    // 运行 Sanitizer
    async runSanitizer(params: RunSanitizerParams): Promise<void> {
      try {
        await OpsAPI.init();
        // 保存当前 executor 引用
        currentExecutor = OpsAPI.getExecutor();
        // 异常检测前编译
        await OpsAPI.startBuild(undefined, '--mssanitizer');
        // 创建文件夹
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspacePath = workspaceFolders![0].uri.fsPath;
        const logPath = path.join(path.join(workspacePath, '.vscode/mindstudio_sanitizer_log'));
        if (!fs.existsSync(logPath)) {
          fs.mkdirSync(logPath, { mode: 0o750 });
        }
        // 开启异常检测
        await OpsAPI.runSanitizer();
        // 执行完检测后，获取最新的列表数据
        vscode.commands.executeCommand('huawei-op-devtools.flashMsSanitizerRunData');
      } finally {
        // 清除 executor 引用
        currentExecutor = null;
      }
    },

    // 运行示例
    async runExample(params: RunExampleParams): Promise<void> {
      try {
        await OpsAPI.init();
        // 保存当前 executor 引用
        currentExecutor = OpsAPI.getExecutor();
        await OpsAPI.startRun();
      } finally {
        // 清除 executor 引用
        currentExecutor = null;
      }
    },

    // 仿真
    async simulate(params: SimulateParams): Promise<void> {
      try {
        await OpsAPI.init();
        // 保存当前 executor 引用
        currentExecutor = OpsAPI.getExecutor();
        const configData = await OpsAPI.getBuildConfigs();
        const simulatorItem = configData.find((v: any) => v.config_type === 'simulate')
        const simulatorType = simulatorItem?.user_options?.simulatorType ?? ''
        await OpsAPI.startBuild(undefined, `--simulator ${simulatorType}`);
        await OpsAPI.startSimulate();
      } finally {
        // 清除 executor 引用
        currentExecutor = null;
      }
    },

    // 上板
    async onBoard(params: OnBoardParams): Promise<void> {
      try {
        await OpsAPI.init();
        // 保存当前 executor 引用
        currentExecutor = OpsAPI.getExecutor();
        await OpsAPI.startBuild(undefined, '--onboard');
        await OpsAPI.startOnBoard();
      } finally {
        // 清除 executor 引用
        currentExecutor = null;
      }
    },

    // 停止任务
    stopTask(): void {
      console.log('[stopTask] 收到停止任务请求');
      if (currentExecutor) {
        console.log('[stopTask] 终止正在执行的任务');
        currentExecutor.kill();
        currentExecutor = null;
        vscode.window.showWarningMessage('任务已被手动停止');
      } else {
        console.log('[stopTask] 没有正在执行的任务');
        vscode.window.showInformationMessage('当前没有正在执行的任务');
      }
    },

    // 运行调试
    async runDebug(): Promise<void> {
      try {
        await OpsAPI.init();
        // debug前编译
        await OpsAPI.startBuild(undefined, '--debug');
        await vscode.commands.executeCommand('workbench.debug.action.toggleRepl');
        await vscode.commands.executeCommand('workbench.action.debug.start');
      } catch (error) {
        console.error('打开debug时出错:', error);
        throw error;
      }
    },

    // 调试配置
    async debugConfig(): Promise<void> {
      try {
        await vscode.commands.executeCommand('workbench.action.debug.configure');
        vscode.window.showInformationMessage(`已打开 launch.json 文件`);
      } catch (error) {
        console.error('打开 launch.json 时出错:', error);
        vscode.window.showErrorMessage(`无法打开 launch.json: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    },

    // 保存配置
    async saveConfig(params: { type: string; data: any }): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.saveConfig(params.type, params.data);
    },

    // 下载数据
    async downloadData(params: DownloadDataParams): Promise<void> {
      // 使用 filePath 优先，如果没有则使用 nodeKey
      const remoteFilePath = params.filePath || params.nodeKey;
      if (!remoteFilePath) {
        throw new Error('文件路径不能为空');
      }

      // 显示下载进度
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在下载文件',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0, message: '正在读取远程文件...' });

          // 创建远程文件 URI
          const remoteFileUri = vscode.Uri.file(remoteFilePath);

          // 检查远程文件是否存在
          try {
            const stat = await vscode.workspace.fs.stat(remoteFileUri);
            progress.report({ increment: 30, message: `文件大小: ${(stat.size / 1024).toFixed(2)} KB` });
          } catch (error) {
            throw new Error(`远程文件不存在: ${remoteFilePath}`);
          }

          // 读取远程文件内容
          progress.report({ increment: 40, message: '正在读取文件内容...' });
          const fileData = await vscode.workspace.fs.readFile(remoteFileUri);

          // 获取文件名
          const fileName = path.basename(remoteFilePath);

          progress.report({ increment: 60, message: '请选择保存位置...' });

          // 让用户选择本地保存位置
          const localFileUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(fileName),
            saveLabel: '保存',
            filters: {
              所有文件: ['*'],
            },
          });

          if (!localFileUri) {
            // 用户取消了保存对话框
            return;
          }

          // 将文件内容写入本地
          progress.report({ increment: 80, message: '正在保存文件...' });
          await vscode.workspace.fs.writeFile(localFileUri, fileData);

          progress.report({ increment: 100, message: '下载完成' });
          vscode.window.showInformationMessage(`文件已成功下载到: ${localFileUri.fsPath}`);
        },
      );
    },

    // 删除节点
    async deleteNode(params: DeleteNodeParams): Promise<void> {
      if (!params.nodeKey) {
        throw new Error('节点信息不能为空');
      }
      // 确认删除
      const result = await vscode.window.showWarningMessage(`确定要删除 ${params.nodeKey} 吗？`, '确定', '取消');
      if (result === '确定') {
        console.log('删除节点:', params.nodeKey, params.filePath);
        // 这里可以添加删除文件的逻辑
        vscode.window.showInformationMessage(`已删除: ${params.nodeKey}`);
      }
    },

    // 选择文件夹
    async selectFolder(): Promise<SelectFolderResult | null> {
      // 调用 VS Code 原生对话框（支持选择目录）
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '选择目录',
      });

      if (uris && uris[0]) {
        return uris[0].fsPath;
      }
      return null;
    },

    // 检查 devtool 配置
    checkDevtoolConfig(): CheckDevtoolConfigResult {
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
    },

    // 跳转到文件
    async jumpToFile(params: JumpToFileParams): Promise<void> {
      try {
        console.log('jumpToFile', params);
        const { fileLink, row, col } = params;
        const uri = vscode.Uri.file(fileLink);
        console.log('uri', uri);
        const document = await vscode.workspace.openTextDocument(uri);
        console.log('document', document);
        const editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
        });
        const line = Math.max(0, row - 1);
        const charactor = Math.max(0, col - 1);
        const pos = new vscode.Position(line, charactor);

        // 设置光标位置
        editor.selection = new vscode.Selection(pos, pos);

        // 滚动到目标行，并将其置于视图中央
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);

        // 创建高亮装饰
        const decorationType = vscode.window.createTextEditorDecorationType({
          backgroundColor: 'rgba(255, 200, 0, 0.3)', // 黄色半透明背景
          border: '1px solid rgba(255, 200, 0, 0.8)', // 黄色边框
          isWholeLine: true, // 高亮整行
        });

        // 应用高亮到目标行
        const lineRange = new vscode.Range(
          new vscode.Position(line, 0),
          new vscode.Position(line, document.lineAt(line).text.length)
        );
        editor.setDecorations(decorationType, [lineRange]);

        // 2秒后移除高亮
        setTimeout(() => {
          decorationType.dispose();
        }, 2000);
      } catch (error) {
        console.log('jumpToFile', error);
        vscode.window.showErrorMessage(`打开文件失败：${error}`);
        throw error;
      }
    },

    // 创建算子（通过原型）
    async buildCreateOps(params: BuildCreateOpsParams): Promise<void> {
      await OpsAPI.init();
      await OpsAPI.createOpsByPrototype('', 'cann');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    },

    // 开始链接创建算子
    async startLinkCreateOps(params: StartLinkCreateOpsParams): Promise<void> {
      const context = getExtensionContext();
      if (!params.fileName && !params.value) {
        await OpsAPI.init();
        const opsPrototypeFilePath = await OpsAPI.createOps();
        console.log('res', opsPrototypeFilePath);
        if (opsPrototypeFilePath) {
          await OpsAPI.createOpsByPrototype(opsPrototypeFilePath);
        }
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        return;
      }
      // 开始传入
      if (params.fileName && params.value) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          throw new Error('请先打开一个工作区');
        }

        const workspacePath = workspaceFolders[0].uri;
        const filePath = vscode.Uri.joinPath(workspacePath, params.fileName);

        try {
          // 检查文件是否存在
          try {
            await vscode.workspace.fs.stat(filePath);

            // 询问是否覆盖
            const choice = await vscode.window.showWarningMessage(`文件 ${params.fileName} 已存在，是否覆盖？`, { modal: true }, '覆盖', '取消');

            if (choice !== '覆盖') {
              return;
            }
          } catch {
            // 文件不存在，继续
          }

          // 写入文件
          await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(params.value));

          vscode.window.showInformationMessage(`文件 ${params.fileName} 创建成功`);

          // 可选：格式化JSON
          try {
            const formattedValue = JSON.stringify(JSON.parse(params.value), null, 2);
            await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(formattedValue));
          } catch {
            // 如果不是有效的JSON，保持原样
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(`创建文件失败: ${error.message}`);
          throw error;
        }
      }
    },
  },
};

