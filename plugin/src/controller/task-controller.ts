import * as vscode from 'vscode';

import { CommandExecutor } from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { buildService } from '@plugin/service/build-service';
import { sanitizerService } from '@plugin/service/sanitizer-service';
import { homeMethods } from './home-controller';

// 全局任务管理器：用于追踪和终止正在执行的任务
let currentExecutor: CommandExecutor | null = null;

export const taskMethods = {
  /**
   * 构建算子
   */
  async startBuild(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用，用于可能的终止操作
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await buildService.startBuild({});
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 运行算子
   */
  async startRun(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await buildService.startRun({});
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 构建示例
   */
  async startBuildExample(): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await buildService.startBuildExample({});
  },

  /**
   * 仿真分析
   */
  async startSimulate(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await buildService.startSimulate();
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 上板分析
   */
  async startOnBoard(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await buildService.startOnBoard();
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 异常检测
   */
  async runSanitizer(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用，用于可能的终止操作
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      await sanitizerService.runSanitizer();
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 构建算子 (webview 兼容)
   */
  async buildOp(): Promise<void> {
    return this.startBuild();
  },

  /**
   * 构建示例 (webview 兼容)
   */
  async buildExample(): Promise<void> {
    return this.startBuildExample();
  },

  /**
   * 运行示例 (webview 兼容)
   */
  async runExample(): Promise<void> {
    return this.startRun();
  },

  /**
   * 仿真分析 (webview 兼容)
   */
  async simulate(): Promise<void> {
    return this.startSimulate();
  },

  /**
   * 上板分析 (webview 兼容)
   */
  async onBoard(): Promise<void> {
    return this.startOnBoard();
  },

  /**
   * 检查任务执行状态
   * @returns 是否有任务正在运行
   */
  async checkTaskStatus(): Promise<boolean> {
    return currentExecutor !== null;
  },

  /**
   * 停止任务
   */
  async stopTask(): Promise<void> {
    console.log('[stopTask] 收到停止任务请求');

    if (currentExecutor) {
      console.log('[stopTask] 终止正在执行的任务');
      await currentExecutor.kill();
      currentExecutor = null;
      ProjectManager.getInstance()
        .clearExecutor();
      vscode.window.showWarningMessage('任务已被手动停止');
    }
    else {
      console.log('[stopTask] 没有正在执行的任务');
      vscode.window.showInformationMessage('当前没有正在执行的任务');
    }
  },

  /**
   * 运行NPU调试
   */
  async runDebug(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // debug前编译，使用--debug参数
      await buildService.startBuild({ compileOption: '--debug' });
      await vscode.commands.executeCommand('workbench.debug.action.toggleRepl');
      
      // 获取项目类型和模板名称，判断是否使用 msdebug-python
      const projectInfo = await homeMethods.getProjectType();
      const usePythonDebug = projectInfo.projectType === 'ascend' && projectInfo.projectTemplateName === 'torch_library_template';
      
      // 启动调试配置
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const debugConfigName = usePythonDebug ? 'msdebug-python' : 'msdebug';
        await vscode.debug.startDebugging(workspaceFolder, debugConfigName);
      }
      else {
        await vscode.commands.executeCommand('workbench.action.debug.start');
      }
    }
    catch (error) {
      console.error('打开NPU debug时出错:', error);
      throw error;
    }
  },

  /**
   * NPU调试配置
   */
  async debugConfig(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.debug.configure');
      vscode.window.showInformationMessage('已打开 launch.json 文件');
    }
    catch (error) {
      console.error('打开 launch.json 时出错:', error);
      vscode.window.showErrorMessage(`无法打开 launch.json: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },

  /**
   * 运行CPU调试
   */
  async runCpuDebug(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // CPU调试前编译，使用--simulator参数
      await buildService.startBuild({ compileOption: '--simulator' });
      await vscode.commands.executeCommand('workbench.debug.action.toggleRepl');
      
      // 获取项目类型和模板名称，判断是否使用 msdebug-python
      const projectInfo = await homeMethods.getProjectType();
      const usePythonDebug = projectInfo.projectType === 'ascend' && projectInfo.projectTemplateName === 'torch_library_template';
      
      // 启动调试配置
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const debugConfigName = usePythonDebug ? 'msdebug-python' : 'msdebug-cpu';
        await vscode.debug.startDebugging(workspaceFolder, debugConfigName);
      }
      else {
        await vscode.commands.executeCommand('workbench.action.debug.start');
      }
    }
    catch (error) {
      console.error('打开CPU debug时出错:', error);
      throw error;
    }
  },

  /**
   * CPU调试配置
   */
  async cpuDebugConfig(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.debug.configure');
      vscode.window.showInformationMessage('已打开 launch.json 文件');
    }
    catch (error) {
      console.error('打开 launch.json 时出错:', error);
      vscode.window.showErrorMessage(`无法打开 launch.json: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
};
