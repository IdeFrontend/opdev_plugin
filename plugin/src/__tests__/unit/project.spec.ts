/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
    onDidChangeWorkspaceFolders: jest.fn(),
  },
}));

jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn() }));

import * as vscode from 'vscode';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { Project } from '@plugin/core/project/project';

const mockWorkspace = vscode.workspace as unknown as {
  workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined;
  onDidChangeWorkspaceFolders: jest.Mock;
};
const getProjectByPathMock = getProjectByPath as jest.Mock;

function workspaceFolder(fsPath: string): { uri: { fsPath: string } } {
  return { uri: { fsPath } };
}

function projectRecord(fsPath: string) {
  return {
    project_name: pathBasename(fsPath),
    project_path: fsPath,
    project_type: 'ascend',
  };
}

function pathBasename(fsPath: string): string {
  return fsPath.split(/[\\/]/)
    .pop() as string;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWorkspace.workspaceFolders = undefined;
});

describe('Project.getInstance', () => {
  it('returns the same instance on repeated calls', () => {
    expect(Project.getInstance())
      .toBe(Project.getInstance());
  });
});

describe('Project workspace detection', () => {
  it('is not a project when the workspace has no folders', () => {
    mockWorkspace.workspaceFolders = undefined;

    const project = new Project();

    expect(project.workspaceIsProject())
      .toBe(false);
    expect(getProjectByPathMock).not.toHaveBeenCalled();
  });

  it('is a project when a workspace folder resolves to a record', () => {
    mockWorkspace.workspaceFolders = [workspaceFolder('/repo/ops')];
    getProjectByPathMock.mockReturnValue(projectRecord('/repo/ops'));

    const project = new Project();

    expect(getProjectByPathMock)
      .toHaveBeenCalledWith('/repo/ops');
    expect(project.workspaceIsProject())
      .toBe(true);
    expect(project.projectPath)
      .toBe('/repo/ops');
  });

  it('is not a project when the folder does not resolve to a record', () => {
    mockWorkspace.workspaceFolders = [workspaceFolder('/repo/plain')];
    getProjectByPathMock.mockReturnValue(undefined);

    const project = new Project();

    expect(getProjectByPathMock)
      .toHaveBeenCalledWith('/repo/plain');
    expect(project.workspaceIsProject())
      .toBe(false);
  });

  it('re-detects when the current project folder is removed', () => {
    mockWorkspace.workspaceFolders = [workspaceFolder('/repo/ops')];
    getProjectByPathMock.mockReturnValue(projectRecord('/repo/ops'));

    const project = new Project();

    expect(project.workspaceIsProject())
      .toBe(true);

    mockWorkspace.workspaceFolders = [workspaceFolder('/repo/new')];
    getProjectByPathMock.mockReturnValue(projectRecord('/repo/new'));

    const listener = mockWorkspace.onDidChangeWorkspaceFolders.mock.calls[0][0];

    listener({ removed: [workspaceFolder('/repo/ops')] });

    expect(getProjectByPathMock)
      .toHaveBeenLastCalledWith('/repo/new');
    expect(project.workspaceIsProject())
      .toBe(true);
    expect(project.projectPath)
      .toBe('/repo/new');
  });

  it('ignores removals that do not affect the current project', () => {
    mockWorkspace.workspaceFolders = [workspaceFolder('/repo/ops')];
    getProjectByPathMock.mockReturnValue(projectRecord('/repo/ops'));

    const project = new Project();

    getProjectByPathMock.mockClear();

    const listener = mockWorkspace.onDidChangeWorkspaceFolders.mock.calls[0][0];

    listener({ removed: [workspaceFolder('/repo/other')] });

    expect(getProjectByPathMock).not.toHaveBeenCalled();
    expect(project.workspaceIsProject())
      .toBe(true);
  });

  it('does not re-detect when there is no current project', () => {
    mockWorkspace.workspaceFolders = undefined;

    const project = new Project();

    const listener = mockWorkspace.onDidChangeWorkspaceFolders.mock.calls[0][0];

    listener({ removed: [workspaceFolder('/repo/ops')] });

    expect(getProjectByPathMock).not.toHaveBeenCalled();
    expect(project.workspaceIsProject())
      .toBe(false);
  });
});
