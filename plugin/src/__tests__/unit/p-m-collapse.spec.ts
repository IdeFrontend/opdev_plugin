/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/class/command-options', () => ({
  CommandExecutor: jest.fn()
    .mockImplementation(() => ({ execute: jest.fn() })),
}));

import * as vscode from 'vscode';

import { ProjectManager } from '@plugin/core/project/project-manager';
import { CommandExecutor } from '@plugin/class/command-options';

/**
 * ProjectManager collapsed to a path-only project context + task executor.
 * The registry-era surface (projectId / initProject / getProjectInfo) is absent —
 * consumers resolve records themselves via getProjectByPath.
 */
describe('ProjectManager is path-only (registry collapse)', () => {
  beforeEach(() => {
    ProjectManager.getInstance()
      .resetCachedProject();
  });

  it('exposes no registry-era surface (projectId / initProject / getProjectInfo absent)', () => {
    const pm = ProjectManager.getInstance() as unknown as Record<string, unknown>;

    expect(pm.projectId)
      .toBeUndefined();
    expect(pm['_projectId'])
      .toBeUndefined();
    expect(pm.initProject)
      .toBeUndefined();
    expect(pm.getProjectInfo)
      .toBeUndefined();
  });

  it('setProjectContext caches the path; resetCachedProject clears it', () => {
    const pm = ProjectManager.getInstance();
    const originalFolders = vscode.workspace.workspaceFolders;

    // No workspace folders — the getter has nothing to fall back to.
    vscode.workspace.workspaceFolders = undefined;

    expect(pm.projectPath)
      .toBeUndefined();
    pm.setProjectContext('/repo/ops-math/add', 'add');
    expect(pm.projectPath)
      .toBe('/repo/ops-math/add');
    pm.resetCachedProject();
    expect(pm.projectPath)
      .toBeUndefined();

    vscode.workspace.workspaceFolders = originalFolders;
  });

  it('fresh window (no cached context) falls back to workspaceFolders[0]', () => {
    const pm = ProjectManager.getInstance();
    const originalFolders = vscode.workspace.workspaceFolders;

    pm.resetCachedProject();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/repo/ops-math' } }];

    // Nothing was ever cached (fresh window) — the live workspace root wins.
    expect(pm.projectPath)
      .toBe('/repo/ops-math');

    // A cached path still takes precedence over the workspace root.
    pm.setProjectContext('/repo/ops-math/add', 'add');
    expect(pm.projectPath)
      .toBe('/repo/ops-math/add');

    vscode.workspace.workspaceFolders = originalFolders;
  });

  it('getExecutor lazily creates and clearExecutor releases the shared executor', () => {
    const pm = ProjectManager.getInstance();

    pm.clearExecutor();
    const first = pm.getExecutor();

    expect(pm.getExecutor())
      .toBe(first);
    pm.clearExecutor();
    expect(pm.getExecutor())
      .not.toBe(first);
    expect(CommandExecutor)
      .toHaveBeenCalledTimes(2);
  });
});
