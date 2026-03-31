import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CommandExecutor } from '@plugin/class/command-options';
import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';
import { createProject } from '@plugin/domain';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { soc_version } from '@plugin/domain/utils/ascend-util';

/**
 * project manager
 * Responsible for managing the project context (ID, name, path) of the current operation and the task executor status
 */
export class ProjectManager {
  private static instance: ProjectManager;

  /** Project ID */
  private _projectId: string = '';
  /** Project name */
  private _projectName: string | undefined;
  /** Project path */
  private _projectPath: string | undefined;
  /** current task executor */
  private _currentExecutor: CommandExecutor | null = null;

  private constructor() {}

  /**
   * Get the ProjectManager singleton instance
   * @returns {ProjectManager} singleton instance
   */
  public static getInstance(): ProjectManager {
    if (!ProjectManager.instance) {
      ProjectManager.instance = new ProjectManager();
    }

    return ProjectManager.instance;
  }

  /**
   * Get project ID
   */
  public get projectId(): string {
    return this._projectId;
  }

  /**
   * Get or create a task executor
   * If there is currently no executor, create a new one
   * @returns {CommandExecutor} task executor
   */
  public getExecutor(): CommandExecutor {
    if (!this._currentExecutor) {
      this._currentExecutor = new CommandExecutor();
    }

    return this._currentExecutor;
  }

  /**
   * Clear current task executor
   * Usually called after the task is completed
   */
  public clearExecutor(): void {
    this._currentExecutor = null;
  }
  /**
   * Get project information
   * First use the incoming parameters, secondly use the cached information, and finally try to get it from the workspace
   * @param params optional project path and name parameters
   * @returns project name and path object
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
   * Initialize project context
   * Set the project path and name, and call the backend to create/get the project ID
   * @param params initialization parameters
   * @returns project ID
   */
  public async initProject(params: {
    projectPath?: string;
    projectName?: string;
    ascendEnvScript?: string;
    projectType?: string,
    templateName?: string,
  } = {}): Promise<string> {
    const info = this.getProjectInfo(params);

    if (params.projectPath && params.projectName) {
      this._projectPath = path.normalize(`${params.projectPath}/${params.projectName}`);
      this._projectName = params.projectName;
    }
    else {
      this._projectName = info.name;
      this._projectPath = info.path;
    }

    // Get project ID
    if (this._projectPath === undefined) {
      this._projectId = '';

      return this._projectId;
    }

    // 检查是否存在现有项目
    const existingProject = getProjectByPath(this._projectPath);
    
    // 优先使用现有项目的配置，然后是参数传入的值，最后是默认值
    const ascend_env_script = params.ascendEnvScript || existingProject?.ascend_env_script || undefined;
    const project_soc_version = existingProject?.soc_version || soc_version;
    
    const projectRes = await createProject({
      project_name: this._projectName ?? '',
      project_path: this._projectPath,
      ascend_env_script,
      template_name: params.templateName,
      project_type: params.projectType,
      soc_version: project_soc_version
    });

    this._projectId = String(projectRes);

    return this._projectId;
  }

  /**
   * Make sure projectId is initialized
   * If projectId is empty, try to initialize automatically
   */
  public async ensureProjectId(): Promise<void> {
    if (!this._projectId) {
      await this.initProject();
    }
  }

  /**
   * Check and fix .vscode directory permissions
   * Make sure the .vscode directory permissions are 750
   * @returns {Promise<boolean>} always returns false (retains the original logical return value)
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
