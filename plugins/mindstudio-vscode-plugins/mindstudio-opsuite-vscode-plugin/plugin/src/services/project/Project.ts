import * as vscode from 'vscode';

import { getProjectByPath, ProjectRecord } from '../../../autogen-server/models/projectModel';

export class Project<HasProject extends boolean = false> {
  private static instance: Project;

  static getInstance(): Project {
    if (!Project.instance) {
      Project.instance = new Project();
    }
    return Project.instance;
  }

  public get projectId(): HasProject extends true ? number : number | undefined {
    return this._workspaceProject!.id;
  }

  public get projectSH(): HasProject extends true ? string : string | undefined {
    return this._workspaceProject!.ascend_env_script!;
  }

  public get projectPath(): HasProject extends true ? string : string | undefined {
    return this._workspaceProject!.project_path;
  }

  private _workspaceProject: ProjectRecord | null = null;

  constructor() {
    this.getWorkspaceProject();
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      const isCurrentProjectRemoved = e.removed.some((workspace) => workspace.uri.fsPath === this._workspaceProject?.project_path);
      if (isCurrentProjectRemoved) {
        this.getWorkspaceProject();
      }
    });
  }

  /** 当前工作区是否已创建工程 */
  public workspaceIsProject(): this is Project<true> {
    return this._workspaceProject !== null;
  }

  private getWorkspaceProject() {
    const [workspaceFolder] = vscode.workspace.workspaceFolders ?? [];
    if (!workspaceFolder) {
      this._workspaceProject = null;
      return;
    }
    const projectPath = workspaceFolder.uri.fsPath;
    this._workspaceProject = getProjectByPath(projectPath) ?? null;
    console.log(this._workspaceProject,'value---------');
  }
}
