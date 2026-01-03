import * as vscode from 'vscode';

import { CommandExecutor } from 'plugin:/class/CommandOptions';
import { ProjectManager } from '../core/project/project-manager';
import { buildService } from '../service/build-service';
import {
  BuildOpParams,
  BuildExampleParams,
  RunExampleParams,
  SimulateParams,
  OnBoardParams,
} from 'shared:/api-types';

// 全局任务管理器：用于追踪和终止正在执行的任务
let currentExecutor: CommandExecutor | null = null;

export const taskMethods = {
  /**
   * 构建算子
   */
  async buildOp(): Promise<void> {
    try {
      await ProjectManager.getInstance().initProject();
      // 保存当前 executor 引用，用于可能的终止操作
      currentExecutor = ProjectManager.getInstance().getExecutor();
      await buildService.startBuild({});
    } finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance().clearExecutor();
    }
  },

  /**
   * 构建示例
   */
  async buildExample(): Promise<void> {
    await ProjectManager.getInstance().initProject();
    await buildService.startBuildExample({});
  },

  /**
   * 运行示例
   */
  async runExample(): Promise<void> {
    try {
      await ProjectManager.getInstance().initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance().getExecutor();
      await buildService.startRun({});
    } finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance().clearExecutor();
    }
  },

  /**
   * 仿真分析
   */
  async simulate(): Promise<void> {
    try {
      await ProjectManager.getInstance().initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance().getExecutor();
      await buildService.startSimulate();
    } finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance().clearExecutor();
    }
  },

  /**
   * 上板分析
   */
  async onBoard(): Promise<void> {
    try {
      await ProjectManager.getInstance().initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance().getExecutor();
      await buildService.startOnBoard();
    } finally {
      // 清除 executor 引用
      currentExecutor = null;
      ProjectManager.getInstance().clearExecutor();
    }
  },

  /**
   * 停止任务
   */
  stopTask(): void {
    console.log('[stopTask] 收到停止任务请求');
    if (currentExecutor) {
      console.log('[stopTask] 终止正在执行的任务');
      currentExecutor.kill();
      currentExecutor = null;
      ProjectManager.getInstance().clearExecutor();
      vscode.window.showWarningMessage('任务已被手动停止');
    } else {
      console.log('[stopTask] 没有正在执行的任务');
      vscode.window.showInformationMessage('当前没有正在执行的任务');
    }
  },

  /**
   * 运行调试
   */
  async runDebug(): Promise<void> {
    try {
      await ProjectManager.getInstance().initProject();
      // debug前编译
      await buildService.startBuild({ compileOption: '--debug' });
      await vscode.commands.executeCommand(
        'workbench.debug.action.toggleRepl',
      );
      await vscode.commands.executeCommand('workbench.action.debug.start');
    } catch (error) {
      console.error('打开debug时出错:', error);
      throw error;
    }
  },

  /**
   * 调试配置
   */
  async debugConfig(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.debug.configure');
      vscode.window.showInformationMessage(`已打开 launch.json 文件`);
    } catch (error) {
      console.error('打开 launch.json 时出错:', error);
      vscode.window.showErrorMessage(
        `无法打开 launch.json: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  },
};
