import * as vscode from 'vscode';

import { ApiGroup } from 'plugin:/core/ApiServer';
import { CommandExecutor } from 'plugin:/class/CommandOptions';
import { OpsAPI } from '../helpers/OpsAPI';
import {
  BuildOpParams,
  BuildExampleParams,
  RunExampleParams,
  SimulateParams,
  OnBoardParams,
} from 'shared:/api-types';

// 全局任务管理器：用于追踪和终止正在执行的任务
let currentExecutor: CommandExecutor | null = null;

export const operateApis: ApiGroup = {
  webview: {
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
  },
};

