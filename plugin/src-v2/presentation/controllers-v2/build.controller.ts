import {
  StartBuildParams, StartRunParams, StartBuildExampleParams,
} from '@shared/api-types';
import { BuildApplicationService } from '@plugin-v2/application/services/operator/build.application';
import { INotificationService } from '@plugin-v2/application/interfaces/notification.interface';
import { ResultUtils } from '@plugin-v2/domain/shared/types/result.type';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { CommandExecutor } from '@plugin/class/command-options';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 构建控制器 V2
 * 表现层,负责处理 API 请求和 UI 交互
 */
export class BuildControllerV2 {
  // 全局任务执行器引用,用于支持停止任务功能
  private static currentExecutor: CommandExecutor | null = null;

  constructor(
    private buildService: BuildApplicationService,
    private notification: INotificationService,
    private projectManager: ProjectManager,
  ) {}

  /**
   * 开始构建算子
   */
  async startBuild(params: StartBuildParams = {}): Promise<void> {
    try {
      // 确保项目已初始化
      await this.projectManager.initProject();

      // 保存当前 executor 引用,用于可能的停止操作
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      // 转换参数
      const dto = {
        configId: params.configId ? Number(params.configId) : undefined,
        compileOption: params.compileOption,
      };

      // 执行构建
      const result = await this.buildService.startBuild(dto);

      // 处理结果
      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`编译算子失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('编译算子成功');
    }
    finally {
      // 清理执行器引用
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * 开始运行算子
   */
  async startRun(params: StartRunParams = {}): Promise<void> {
    try {
      await this.projectManager.initProject();

      // 保存当前 executor 引用
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      const dto = { configId: params.configId ? Number(params.configId) : undefined };

      const result = await this.buildService.startRun(dto);

      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`运行失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('运行成功');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * 开始构建示例
   */
  async startBuildExample(params: StartBuildExampleParams = {}): Promise<void> {
    try {
      await this.projectManager.initProject();

      // 保存当前 executor 引用
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      const dto = { configId: params.configId ? Number(params.configId) : undefined };

      const result = await this.buildService.startBuildExample(dto);

      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`编译示例失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('编译示例成功');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * 获取构建配置ID
   */
  async getBuildConfigId(): Promise<number | undefined> {
    const result = await this.buildService.getBuildConfigId();

    return ResultUtils.isOk(result) ? result.value : undefined;
  }

  /**
   * 获取示例构建配置ID
   */
  async getBuildExampleConfigId(): Promise<number | undefined> {
    const result = await this.buildService.getBuildExampleConfigId();

    return ResultUtils.isOk(result) ? result.value : undefined;
  }

  /**
   * 获取仿真配置ID (返回字符串以保持与 V1 API 兼容)
   */
  async getSimulateConfigId(): Promise<string> {
    const result = await this.buildService.getSimulateConfigId();

    return ResultUtils.isOk(result) ? String(result.value) : '';
  }

  /**
   * 获取上板配置ID (返回字符串以保持与 V1 API 兼容)
   */
  async getOnBoardConfigId(): Promise<string> {
    const result = await this.buildService.getOnBoardConfigId();

    return ResultUtils.isOk(result) ? String(result.value) : '';
  }

  /**
   * 获取异常检测配置ID
   */
  async getSanitizerConfigId(): Promise<number | undefined> {
    const result = await this.buildService.getSanitizerConfigId();

    return ResultUtils.isOk(result) ? result.value : undefined;
  }

  /**
   * 获取异常检测配置列表
   */
  async getSanitizerConfigs(): Promise<unknown[]> {
    const result = await this.buildService.getSanitizerConfigs();

    return ResultUtils.isOk(result) ? result.value : [];
  }

  /**
   * 保存异常检测配置
   */
  async saveSanitizerForm(params: {
    data: unknown;
    showMessage?: boolean;
  }): Promise<void> {
    const result = await this.buildService.saveSanitizerForm(params);

    if (ResultUtils.isErr(result)) {
      const errorMessage = result.error instanceof Error
        ? result.error.message
        : String(result.error);

      this.notification.showError(`保存异常检测配置失败: ${errorMessage}`);
      throw result.error;
    }

    if (params.showMessage) {
      this.notification.showInfo('保存异常检测配置成功');
    }
  }

  /**
   * 开始仿真分析
   */
  async startSimulate(): Promise<void> {
    try {
      await this.projectManager.initProject();

      // 保存当前 executor 引用
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      const result = await this.buildService.startSimulate();

      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`仿真分析失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('执行仿真分析成功');

      // 触发 UI 刷新命令
      await vscode.commands.executeCommand('performanceSidebarView.focus');
      await vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * 开始上板分析
   */
  async startOnBoard(): Promise<void> {
    try {
      await this.projectManager.initProject();

      // 保存当前 executor 引用
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      const result = await this.buildService.startOnBoard();

      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`上板分析失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('执行上板分析成功');

      // 触发 UI 刷新命令
      await vscode.commands.executeCommand('performanceSidebarView.focus');
      await vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * 运行异常检测
   */
  async runSanitizer(): Promise<void> {
    try {
      await this.projectManager.initProject();

      // 保存当前 executor 引用
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      // 创建日志目录
      this.ensureSanitizerLogDir();

      const result = await this.buildService.runSanitizer();

      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`异常检测失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('异常检测成功');

      // 触发 UI 刷新命令
      await vscode.commands.executeCommand('huawei-op-devtools.flashMsSanitizerRunData');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * 确保异常检测日志目录存在
   * 私有辅助方法,处理文件系统操作
   */
  private ensureSanitizerLogDir(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const logPath = path.join(
        workspacePath,
        '.vscode',
        'mindstudio_sanitizer_log',
      );

      if (!fs.existsSync(logPath)) {
        fs.mkdirSync(logPath, {
          mode: 0o750,
          recursive: true,
        });
      }
    }
  }

  /**
   * 停止当前正在执行的任务
   */
  stopTask(): void {
    console.log('[BuildControllerV2.stopTask] 收到停止任务请求');

    if (BuildControllerV2.currentExecutor) {
      console.log('[BuildControllerV2.stopTask] 终止正在执行的任务');
      BuildControllerV2.currentExecutor.kill();
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
      vscode.window.showWarningMessage('任务已被手动停止');
    }
    else {
      console.log('[BuildControllerV2.stopTask] 没有正在执行的任务');
      vscode.window.showInformationMessage('当前没有正在执行的任务');
    }
  }
}
