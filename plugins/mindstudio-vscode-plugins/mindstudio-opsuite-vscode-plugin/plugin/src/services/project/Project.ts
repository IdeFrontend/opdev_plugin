import * as vscode from 'vscode';

import { getProjectByPath } from '../../../autogen-server/models/projectModel';

export class Project {
  /** 当前工作区是否已创建工程 */
  public workspaceIsProject(): boolean {
    const [workspaceFolder] = vscode.workspace.workspaceFolders ?? [];
    if (!workspaceFolder) {
      return false;
    }
    const projectPath = workspaceFolder.uri.fsPath;
    const record = getProjectByPath(projectPath);
    return record ? true : false;
  }
}
