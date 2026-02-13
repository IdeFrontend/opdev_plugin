import * as vscode from 'vscode';
import * as path from 'path';

import { CommandExecutor } from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { buildService } from '@plugin/service/build-service';
import { sanitizerService } from '@plugin/service/sanitizer-service';
import { homeMethods } from './home-controller';
import { StartBuildParams, StartBuildExampleParams, StartRunParams } from '@shared/api-types';
import { getConfig, postConfig } from '@plugin/domain';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';

// 全局任务管理器：用于追踪和终止正在执行的任务
let currentExecutor: CommandExecutor | null = null;
// 当前任务名称映射
const taskNameMap: Record<string, string> = {
  'build': '编译部署算子',
  'runExample': '运行',
  'sanitizer': '异常检测',
  'onboard': '上板分析',
  'simulation': '仿真分析',
  'buildAndCpuDebug': 'CPU调试',
  'buildAndDebug': 'NPU调试',
  'dumpTensor': '执行DumpTensor'
};
// 当前正在执行的任务类型
let currentTaskType: string | null = null;

export const taskMethods = {
  /**
   * 构建算子
   */
  async startBuild(params: StartBuildParams = {}): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用，用于可能的终止操作
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      currentTaskType = 'build';
      await buildService.startBuild(params);
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      currentTaskType = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 运行算子
   */
  async startRun(params: StartRunParams = {}): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      currentTaskType = 'runExample';
      await buildService.startRun(params);
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      currentTaskType = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 构建示例
   */
  async startBuildExample(params: StartBuildExampleParams = {}): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      currentTaskType = 'build';
      await buildService.startBuildExample(params);
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      currentTaskType = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 仿真分析
   */
  async startSimulate(params: { operatorNames?: string } = {}): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      currentTaskType = 'simulation';
      await buildService.startSimulate(params);
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      currentTaskType = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 上板分析
   */
  async startOnBoard(params: { operatorNames?: string } = {}): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      currentTaskType = 'onboard';
      await buildService.startOnBoard(params);
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      currentTaskType = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 异常检测
   */
  async runSanitizer(params: { operatorNames?: string } = {}): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用，用于可能的终止操作
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      currentTaskType = 'sanitizer';
      await sanitizerService.runSanitizer(params);
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      currentTaskType = null;
      ProjectManager.getInstance()
        .clearExecutor();
    }
  },

  /**
   * 执行DumpTensor
   */
  async startDumpTensor(params: { operatorNames?: string, compileOption?: string } = {}): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      currentTaskType = 'dumpTensor';
      await buildService.startDumpTensor(params);
    }
    finally {
      // 清除 executor 引用
      currentExecutor = null;
      currentTaskType = null;
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
      currentTaskType = null;
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
   * 获取当前任务名称
   * @returns 当前任务名称，如果没有任务则返回null
   */
  async getCurrentTaskName(): Promise<string | null> {
    if (currentTaskType && taskNameMap[currentTaskType]) {
      return taskNameMap[currentTaskType];
    }
    return null;
  },

  /**
   * 显示确认对话框
   * @param params 对话框参数
   * @returns 用户选择的结果，'停止并执行' 或 undefined（取消）
   */
  async showConfirmDialog(params: {
    title: string;
    content: string;
    confirmText: string;
    cancelText: string;
  }): Promise<string | undefined> {
    // VSCode的showWarningMessage不支持单独的title，将title和content合并显示
    const message = `${params.title}\n${params.content}`;
    // 使用 modal: true 保持模态框，但只提供一个"停止并执行"按钮
    // VSCode会自动添加关闭按钮（X），用户可以通过关闭对话框或按ESC来取消
    // 这样只有一个取消方式（关闭按钮），不会出现两个取消按钮
    const result = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      params.confirmText,
    );
    // 返回用户选择的结果：
    // - 如果用户点击"停止并执行"按钮，返回 confirmText
    // - 如果用户点击关闭按钮（X）或按ESC，返回 undefined（相当于取消）
    return result;
  },

  /**
   * 运行NPU调试
   */
  async runDebug(): Promise<void> {
    try {
      await ProjectManager.getInstance()
        .initProject();
      // 保存当前 executor 引用，用于可能的终止操作
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      // 设置当前任务类型
      currentTaskType = 'buildAndDebug';
      
      // 对于 pyasc 类型，检查当前是否打开了 .py 文件并更新配置
      const projectTypeInfo = await homeMethods.getProjectType();
      const isPyasc = projectTypeInfo.projectType === OperatorProjectType.PYASC;
      
      if (isPyasc) {
        // 检查当前是否打开了 .py 文件
        const activeEditor = vscode.window.activeTextEditor;
        const isPyFile = activeEditor?.document.fileName.endsWith('.py');

        if (!isPyFile) {
          vscode.window.showErrorMessage('请先打开一个 .py 文件');
          // 清除状态
          currentExecutor = null;
          currentTaskType = null;
          ProjectManager.getInstance().clearExecutor();
          return;
        }

        // 获取工作区路径
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('未找到工作区路径');
          // 清除状态
          currentExecutor = null;
          currentTaskType = null;
          ProjectManager.getInstance().clearExecutor();
          return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const filePath = activeEditor!.document.uri.fsPath;

        // 计算相对路径
        const relativePath = path.relative(workspacePath, filePath).replace(/\\/g, '/');

        // 获取 build_op 配置并更新 target_file
        const buildConfigId = await buildService.getBuildConfigId();
        if (buildConfigId) {
          // 获取项目ID
          const projectIdStr = ProjectManager.getInstance().projectId;
          if (projectIdStr) {
            const projectId = Number(projectIdStr);
            // 获取 build_op 配置
            const configs = await getConfig(projectId, 'build_op');
            const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

            if (buildOpConfig) {
              // 更新配置的 target_file
              const updatedConfig = {
                config_id: buildConfigId,
                config_type: 'build_op',
                user_options: {
                  ...buildOpConfig.user_options,
                  target_file: relativePath,
                },
              };

              // 保存配置
              await postConfig('build_op', [updatedConfig]);
            }
          }
        }
      }
      
      // debug前编译，使用--debug参数
      await buildService.startBuild({ scriptField: 'npu_debug_script' });
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
    finally {
      // 清除 executor 引用和任务类型
      currentExecutor = null;
      currentTaskType = null;
      ProjectManager.getInstance()
        .clearExecutor();
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
      // 保存当前 executor 引用，用于可能的终止操作
      currentExecutor = ProjectManager.getInstance()
        .getExecutor();
      // 设置当前任务类型
      currentTaskType = 'buildAndCpuDebug';
      
      // 对于 pyasc 类型，检查当前是否打开了 .py 文件并更新配置
      const projectTypeInfo = await homeMethods.getProjectType();
      const isPyasc = projectTypeInfo.projectType === OperatorProjectType.PYASC;
      
      if (isPyasc) {
        // 检查当前是否打开了 .py 文件
        const activeEditor = vscode.window.activeTextEditor;
        const isPyFile = activeEditor?.document.fileName.endsWith('.py');

        if (!isPyFile) {
          vscode.window.showErrorMessage('请先打开一个 .py 文件');
          // 清除状态
          currentExecutor = null;
          currentTaskType = null;
          ProjectManager.getInstance().clearExecutor();
          return;
        }

        // 获取工作区路径
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('未找到工作区路径');
          // 清除状态
          currentExecutor = null;
          currentTaskType = null;
          ProjectManager.getInstance().clearExecutor();
          return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const filePath = activeEditor!.document.uri.fsPath;

        // 计算相对路径
        const relativePath = path.relative(workspacePath, filePath).replace(/\\/g, '/');

        // 获取 build_op 配置并更新 target_file
        const buildConfigId = await buildService.getBuildConfigId();
        if (buildConfigId) {
          // 获取项目ID
          const projectIdStr = ProjectManager.getInstance().projectId;
          if (projectIdStr) {
            const projectId = Number(projectIdStr);
            // 获取 build_op 配置
            const configs = await getConfig(projectId, 'build_op');
            const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

            if (buildOpConfig) {
              // 更新配置的 target_file
              const updatedConfig = {
                config_id: buildConfigId,
                config_type: 'build_op',
                user_options: {
                  ...buildOpConfig.user_options,
                  target_file: relativePath,
                },
              };

              // 保存配置
              await postConfig('build_op', [updatedConfig]);
            }
          }
        }
      }
      
      // CPU调试前编译，使用--simulator参数
      await buildService.startBuild({ scriptField: 'cpu_debug_script' });
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
    finally {
      // 清除 executor 引用和任务类型
      currentExecutor = null;
      currentTaskType = null;
      ProjectManager.getInstance()
        .clearExecutor();
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
