import {
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
  StartSimulateParams,
  StartOnBoardParams,
  StartSanitizerParams,
  StartDumpTensorParams,
  StartUtTestParams,
} from '@shared/api-types';
import { BuildApplicationService } from '@plugin-v2/application/services/operator/build.application';
import { INotificationService } from '@plugin-v2/application/interfaces/notification.interface';
import { ResultUtils } from '@plugin-v2/domain/shared/types/result.type';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { CommandExecutor } from '@plugin/class/command-options';
import { homeMethods } from '@plugin/controller/home-controller';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';
import { ConfigService } from '@plugin/service/config-service';
import {
  getConfig, postConfig,
} from '@plugin/domain';
import { Project } from '@plugin/core/project/project';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Build controller V2
 * Presentation layer; handles API requests and UI interaction
 */
export class BuildControllerV2 {
  // Global executor reference for stop-task support
  private static currentExecutor: CommandExecutor | null = null;

  constructor(
    private buildService: BuildApplicationService,
    private notification: INotificationService,
    private projectManager: ProjectManager,
  ) {}

  /**
   * Start operator build
   */
  async startBuild(params: StartBuildParams = {}): Promise<void> {
    try {
      // Ensure project is initialized
      await this.projectManager.initProject();

      // Store executor reference for possible stop
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      // Map params
      const dto = {
        configId: params.configId ? Number(params.configId) : undefined,
        compileOption: params.compileOption,
        operatorNames: params.operatorNames,
        operatorType: params.operatorType,
      };

      // Run build
      const result = await this.buildService.startBuild(dto);

      // Handle result
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
      // Clear executor reference
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * Start operator run
   */
  async startRun(params: StartRunParams = {}): Promise<void> {
    try {
      await this.projectManager.initProject();

      // Store executor reference
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      // For pyasc: check if a .py file is open
      // Skip if filePath was passed (e.g. context menu)
      const projectTypeInfo = await homeMethods.getProjectType();
      const isPyasc = projectTypeInfo.projectType === OperatorProjectType.PYASC;

      if (isPyasc && !params.filePath) {
        // Check if a .py file is currently open
        const activeEditor = vscode.window.activeTextEditor;
        const isPyFile = activeEditor?.document.fileName.endsWith('.py');

        if (!isPyFile) {
          this.notification.showWarning('请先打开一个 .py 文件');

          return;
        }

        // Get workspace path
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
          this.notification.showWarning('未找到工作区路径');

          return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const filePath = activeEditor!.document.uri.fsPath;

        // Compute relative path
        const relativePath = path.relative(workspacePath, filePath)
          .replace(/\\/g, '/');

        // Get build_op config and update target_file
        const buildConfigId = await this.getBuildConfigId();

        if (buildConfigId) {
          // Get project ID
          const project = Project.getInstance();

          if (project.workspaceIsProject()) {
            const projectId = project.projectId;

            // Get build_op config
            const configs = await getConfig(projectId, 'build_op');
            const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

            if (buildOpConfig) {
              // Update config target_file
              const updatedConfig = {
                config_id: buildConfigId,
                config_type: 'build_op',
                user_options: {
                  ...buildOpConfig.user_options,
                  target_file: relativePath,
                },
              };

              // Save config
              await postConfig('build_op', [updatedConfig]);
            }
          }
        }
      }

      const dto = {
        configId: params.configId ? Number(params.configId) : undefined,
        filePath: params.filePath,
      };

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
   * Start build example
   */
  async startBuildExample(params: StartBuildExampleParams = {}): Promise<void> {
    try {
      await this.projectManager.initProject();

      // Store executor reference
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      const dto = {
        configId: params.configId ? Number(params.configId) : undefined,
        operatorNames: params.operatorNames,
        operatorType: params.operatorType,
      };

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
   * Get build config ID
   */
  async getBuildConfigId(): Promise<number | undefined> {
    const result = await this.buildService.getBuildConfigId();

    return ResultUtils.isOk(result) ? result.value : undefined;
  }

  /**
   * Get build example config ID
   */
  async getBuildExampleConfigId(): Promise<number | undefined> {
    const result = await this.buildService.getBuildExampleConfigId();

    return ResultUtils.isOk(result) ? result.value : undefined;
  }

  /**
   * Get simulate config ID (returns string for V1 API compatibility)
   */
  async getSimulateConfigId(): Promise<string> {
    const result = await this.buildService.getSimulateConfigId();

    return ResultUtils.isOk(result) ? String(result.value) : '';
  }

  /**
   * Get on-board config ID (returns string for V1 API compatibility)
   */
  async getOnBoardConfigId(): Promise<string> {
    const result = await this.buildService.getOnBoardConfigId();

    return ResultUtils.isOk(result) ? String(result.value) : '';
  }

  /**
   * Get sanitizer (anomaly detection) config ID
   */
  async getSanitizerConfigId(): Promise<number | undefined> {
    const result = await this.buildService.getSanitizerConfigId();

    return ResultUtils.isOk(result) ? result.value : undefined;
  }

  /**
   * Get sanitizer config list
   */
  async getSanitizerConfigs(): Promise<unknown[]> {
    const result = await this.buildService.getSanitizerConfigs();

    return ResultUtils.isOk(result) ? result.value : [];
  }

  /**
   * Save sanitizer config
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
   * Start simulation analysis
   */
  async startSimulate(params: StartSimulateParams = {}): Promise<void> {
    try {
      await this.projectManager.initProject();

      // Store executor reference
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      // For pyasc: check if a .py file is open
      const projectTypeInfo = await homeMethods.getProjectType();
      const isPyasc = projectTypeInfo.projectType === OperatorProjectType.PYASC;

      if (isPyasc) {
        // Check if a .py file is open
        const activeEditor = vscode.window.activeTextEditor;
        const isPyFile = activeEditor?.document.fileName.endsWith('.py');

        if (!isPyFile) {
          this.notification.showWarning('请先打开一个 .py 文件');

          return;
        }

        // Get workspace path
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
          this.notification.showWarning('未找到工作区路径');

          return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const filePath = activeEditor!.document.uri.fsPath;

        // Compute relative path
        const relativePath = path.relative(workspacePath, filePath)
          .replace(/\\/g, '/');

        // Get build_op config and update target_file
        const buildConfigId = await this.getBuildConfigId();

        if (buildConfigId) {
          // Get project ID
          const project = Project.getInstance();

          if (project.workspaceIsProject()) {
            const projectId = project.projectId;

            // Get build_op config
            const configs = await getConfig(projectId, 'build_op');
            const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

            if (buildOpConfig) {
              // Update config target_file
              const updatedConfig = {
                config_id: buildConfigId,
                config_type: 'build_op',
                user_options: {
                  ...buildOpConfig.user_options,
                  target_file: relativePath,
                },
              };

              // Save config
              await postConfig('build_op', [updatedConfig]);
            }
          }
        }
      }

      const result = await this.buildService.startSimulate({ operatorNames: params.operatorNames });

      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`仿真分析失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('执行仿真分析成功');

      // Trigger UI refresh commands
      await vscode.commands.executeCommand('huawei-op-devtools.open-performance-panel-view');
      await vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * Start on-board analysis
   */
  async startOnBoard(params: StartOnBoardParams = {}): Promise<void> {
    try {
      await this.projectManager.initProject();

      // Store executor reference
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      // For pyasc: check if a .py file is open
      const projectTypeInfo = await homeMethods.getProjectType();
      const isPyasc = projectTypeInfo.projectType === OperatorProjectType.PYASC;

      if (isPyasc) {
        // Check if a .py file is open
        const activeEditor = vscode.window.activeTextEditor;
        const isPyFile = activeEditor?.document.fileName.endsWith('.py');

        if (!isPyFile) {
          this.notification.showWarning('请先打开一个 .py 文件');

          return;
        }

        // Get workspace path
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
          this.notification.showWarning('未找到工作区路径');

          return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const filePath = activeEditor!.document.uri.fsPath;

        // Compute relative path
        const relativePath = path.relative(workspacePath, filePath)
          .replace(/\\/g, '/');

        // Get build_op config and update target_file
        const buildConfigId = await this.getBuildConfigId();

        if (buildConfigId) {
          // Get project ID
          const project = Project.getInstance();

          if (project.workspaceIsProject()) {
            const projectId = project.projectId;

            // Get build_op config
            const configs = await getConfig(projectId, 'build_op');
            const buildOpConfig = configs.find((c: any) => c.config_id === buildConfigId);

            if (buildOpConfig) {
              // Update config target_file
              const updatedConfig = {
                config_id: buildConfigId,
                config_type: 'build_op',
                user_options: {
                  ...buildOpConfig.user_options,
                  target_file: relativePath,
                },
              };

              // Save config
              await postConfig('build_op', [updatedConfig]);
            }
          }
        }
      }

      const result = await this.buildService.startOnBoard({ operatorNames: params.operatorNames });

      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`上板分析失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('执行上板分析成功');

      // Trigger UI refresh commands
      await vscode.commands.executeCommand('huawei-op-devtools.open-performance-panel-view');
      await vscode.commands.executeCommand('huawei-op-devtools.flashPerformanceRunData');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * Run sanitizer (anomaly detection)
   */
  async runSanitizer(params: StartSanitizerParams = {}): Promise<void> {
    try {
      await this.projectManager.initProject();

      // Store executor reference
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();

      // Create log directory
      this.ensureSanitizerLogDir();

      const result = await this.buildService.runSanitizer({ operatorNames: params.operatorNames });

      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);

        this.notification.showError(`异常检测失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('异常检测成功');

      // Focus sanitizer panel and refresh report list
      await vscode.commands.executeCommand('msSanitizerPanelView.focus');
      await vscode.commands.executeCommand('huawei-op-devtools.flashMsSanitizerRunData');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * Ensure sanitizer log directory exists
   * Private helper for filesystem operations
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
   * Start DumpTensor flow.
   */
  async startDumpTensor(
    params: StartDumpTensorParams = {},
  ): Promise<void> {
    try {
      await this.projectManager.initProject();
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();
      const projectTypeInfo = await homeMethods.checkMultipleOperators();
      const result = await this.buildService.startDumpTensor({
        ...params,
        isStandardCustom: projectTypeInfo.isStandardCustom,
      });
      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);
        this.notification.showError(`DumpTensor 执行失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('DumpTensor 执行成功');
      await vscode.commands.executeCommand('huawei-op-devtools.open-dump-tensor-panel-view');
      await vscode.commands.executeCommand('huawei-op-devtools.flashDumpTensorData');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * Start UT test flow.
   */
  async startUtTest(
    params: StartUtTestParams = {},
  ): Promise<void> {
    try {
      await this.projectManager.initProject();
      BuildControllerV2.currentExecutor = this.projectManager.getExecutor();
      const result = await this.buildService.startUtTest(params);
      if (ResultUtils.isErr(result)) {
        const errorMessage = result.error instanceof Error
          ? result.error.message
          : String(result.error);
        this.notification.showError(`UT 测试执行失败: ${errorMessage}`);
        throw result.error;
      }

      this.notification.showInfo('UT 测试执行成功');
    }
    finally {
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
    }
  }

  /**
   * Stop the currently running task
   */
  async stopTask(): Promise<void> {
    console.log('[BuildControllerV2.stopTask] Stop task requested');

    if (BuildControllerV2.currentExecutor) {
      console.log('[BuildControllerV2.stopTask] Killing running task');
      await BuildControllerV2.currentExecutor.kill();
      BuildControllerV2.currentExecutor = null;
      this.projectManager.clearExecutor();
      vscode.window.showWarningMessage('任务已被手动停止');
    }
    else {
      console.log('[BuildControllerV2.stopTask] No task running');
      vscode.window.showInformationMessage('当前没有正在执行的任务');
    }
  }

  /**
   * Check whether a task is currently running in V2.
   */
  async checkTaskStatus(): Promise<boolean> {
    return BuildControllerV2.currentExecutor !== null;
  }
}
