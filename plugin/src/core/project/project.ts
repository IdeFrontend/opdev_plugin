/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as vscode from 'vscode';

import {
  getProjectByPath,
  ProjectRecord,
} from '@plugin/domain/models/project-model';

export class Project<HasProject extends boolean = false> {
  private static instance: Project;

  static getInstance(): Project {
    if (!Project.instance) {
      Project.instance = new Project();
    }

    return Project.instance;
  }

  public get projectPath(): HasProject extends true
    ? string
    : string | undefined {
    return this._workspaceProject!.project_path;
  }

  private _workspaceProject: ProjectRecord | null = null;

  constructor() {
    this.getWorkspaceProject();
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      const isCurrentProjectRemoved = e.removed.some((workspace) =>
        workspace.uri.fsPath === this._workspaceProject?.project_path);

      if (isCurrentProjectRemoved) {
        this.getWorkspaceProject();
      }
    });
  }

  /** Whether a project has been created in the current workspace */
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
    console.log(this._workspaceProject, 'value---------');
  }
}
