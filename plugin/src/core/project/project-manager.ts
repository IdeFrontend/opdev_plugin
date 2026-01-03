import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CommandExecutor } from 'plugin:/class/command-options';
import { ExplorerRootUtils } from 'plugin:/class/explorer-root-utils';
import { createProject } from '../../autogen';

/**
 * 项目管理器
 * 负责管理当前操作的项目上下文（ID, 名称, 路径）以及任务执行器状态
 */
export class ProjectManager {
  private static instance: ProjectManager;

  /** 项目ID */
  private _projectId: string = '';
  /** 项目名称 */
  private _projectName: string | undefined;
  /** 项目路径 */
  private _projectPath: string | undefined;
  /** 当前任务执行器 */
  private _currentExecutor: CommandExecutor | null = null;

  private constructor() {}

  /**
   * 获取 ProjectManager 单例实例
   * @returns {ProjectManager} 单例实例
   */
  public static getInstance(): ProjectManager {
    if (!ProjectManager.instance) {
      ProjectManager.instance = new ProjectManager();
    }
    return ProjectManager.instance;
  }

  /**
   * 获取项目ID
   */
  public get projectId(): string {
    return this._projectId;
  }

  /**
   * 获取项目名称
   */
  public get projectName(): string | undefined {
    return this._projectName;
  }

  /**
   * 获取项目路径
   */
  public get projectPath(): string | undefined {
    return this._projectPath;
  }

  /**
   * 获取当前任务执行器
   */
  public get currentExecutor(): CommandExecutor | null {
    return this._currentExecutor;
  }

  /**
   * 获取或创建任务执行器
   * 如果当前没有执行器，则创建一个新的
   * @returns {CommandExecutor} 任务执行器
   */
  public getExecutor(): CommandExecutor {
    if (!this._currentExecutor) {
      this._currentExecutor = new CommandExecutor();
    }
    return this._currentExecutor;
  }

  /**
   * 清除当前任务执行器
   * 通常在任务完成后调用
   */
  public clearExecutor(): void {
    this._currentExecutor = null;
  }

  /**
   * 停止当前正在执行的任务
   * 如果有正在运行的 executor，调用其 kill 方法并重置
   */
  public async stopTask(): Promise<void> {
    if (this._currentExecutor) {
      try {
        this._currentExecutor.kill();
        this._currentExecutor = null;
        vscode.window.showInformationMessage('任务已停止');
      } catch (e) {
        vscode.window.showErrorMessage(
          `停止任务失败: ${e instanceof Error ? e.message : ''}`,
        );
      }
    } else {
      vscode.window.showWarningMessage('当前没有正在执行的任务');
    }
  }

  /**
   * 获取项目信息
   * 优先使用传入参数，其次使用缓存信息，最后尝试从工作区获取
   * @param params 可选的项目路径和名称参数
   * @returns 项目名称和路径对象
   */
  public getProjectInfo(params?: {
    projectPath?: string;
    projectName?: string;
  }) {
    if (params?.projectPath && params?.projectName) {
      return {
        name: params.projectName,
        path: path.normalize(`${params.projectPath}/${params.projectName}`),
      };
    }

    if (this._projectName && this._projectPath) {
      return {
        name: this._projectName,
        path: this._projectPath,
      };
    }

    const selectedFiles = ExplorerRootUtils.getPrimaryRoot();

    return {
      name: selectedFiles?.name,
      path: selectedFiles?.path,
    };
  }

  /**
   * 初始化项目上下文
   * 设置项目路径、名称，并调用后端创建/获取项目ID
   * @param params 初始化参数
   * @returns 项目ID
   */
  public async initProject(params: {
    projectPath?: string;
    projectName?: string;
    accendEnvScript?: string;
  } = {}): Promise<string> {
    const info = this.getProjectInfo(params);

    if (params.projectPath && params.projectName) {
      this._projectPath = path.normalize(
        `${params.projectPath}/${params.projectName}`,
      );
      this._projectName = params.projectName;
    } else {
      this._projectName = info.name;
      this._projectPath = info.path;
    }

    // 获取项目ID
    if (this._projectPath === undefined) {
      this._projectId = '';
      return this._projectId;
    }

    const ascend_env_script = params.accendEnvScript || undefined;
    const projectRes = await createProject({
      project_name: this._projectName ?? '',
      project_path: this._projectPath,
      ascend_env_script,
    });

    // console.log('projectRes', projectRes);
    this._projectId = String(projectRes);

    return this._projectId;
  }

  /**
   * 确保 projectId 已初始化
   * 如果 projectId 为空，则尝试自动初始化
   */
  public async ensureProjectId(): Promise<void> {
    if (!this._projectId) {
      await this.initProject();
    }
  }

  /**
   * 检查并修复 .vscode 目录权限
   * 确保 .vscode 目录权限为 750
   * @returns {Promise<boolean>} 总是返回 false (保留原逻辑返回值)
   */
  public async checkVscode(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const vscodePath = path.join(workspacePath, '.vscode');

    if (fs.existsSync(vscodePath)) {
      const commandExecutor = new CommandExecutor();

      await commandExecutor.execute(`chmod 750 ${vscodePath}`, [], [], {});
    }

    return false;
  }
}
