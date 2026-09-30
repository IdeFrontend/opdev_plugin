/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/build-service', () => ({
  buildService: {},
  isRootStandardCustom: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeBuildOpDeployTarget: jest.fn() } }));

jest.mock('@plugin/service/sanitizer-service', () => ({ sanitizerService: { runSanitizer: jest.fn() } }));

jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn() }));

jest.mock('@plugin/helpers/post-activate-bootstrap', () => ({
  whenPostActivateBootstrapReady: jest.fn(() => Promise.resolve()),
  isMindStudioDebugExtensionActive: jest.fn(() => true),
}));

jest.mock('@plugin/helpers/npu-hardware-guard', () => ({ assertNpuHardwareAvailableOrNotify: jest.fn(() => false) }));

jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({
  startNpuHardwareProbe: jest.fn(() => Promise.resolve(true)),
  startRemoteNpuHardwareProbe: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@plugin/helpers/operator-flow-coordinator', () => ({ enqueueCompileRun: jest.fn((_kind, action) => action()) }));

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    getProjectType: jest.fn(() => Promise.resolve({ projectType: 'ascend' })),
    resolveBuildTargetFile: jest.fn(),
    resolveDebugOperatorEntry: jest.fn(),
    getSelectedOperators: jest.fn(),
  },
}));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { isProjectTypeSupported: jest.fn(() => true) } }));

jest.mock('@plugin/domain', () => ({
  getBuildExampleCommand: jest.fn(),
  resolveBuildExampleBaseContext: jest.fn(),
  resolveExampleModeForBaseContext: jest.fn(),
}));

jest.mock('@plugin/domain/utils/debug-target', () => ({
  msdebugConfiguredTargetExists: jest.fn(() => true),
  updateMsdebugTarget: jest.fn(),
}));

jest.mock('@plugin/domain/utils/msdebug-env', () => ({ backfillMsdebugLibInEnvFile: jest.fn() }));

jest.mock('@plugin/domain/utils/debug-config-resolver', () => ({
  isPythonDebugLaunchConfig: jest.fn(() => false),
  resolveDebugLaunchConfigName: jest.fn(() => 'msdebug'),
}));

jest.mock('@plugin/domain/utils/debug-python-target', () => ({ updateMsdebugPythonTarget: jest.fn() }));

jest.mock('@plugin/domain/utils/msdebug-ide-settings', () => ({ ensureMsdebugBreakpointFileAssociations: jest.fn() }));

jest.mock('@plugin/domain/utils/triton-kernel-path', () => ({ resolveTritonLaunchKernelPath: jest.fn() }));

jest.mock('@plugin/domain/services/command-strategy/triton-strategy', () => ({ probeTritonPythonDependencies: jest.fn(() => Promise.resolve({ ok: true })) }));

jest.mock('@plugin/helpers/python-operator-editor-context', () => ({ resolveOrPickPythonOperatorUri: jest.fn() }));

import { ProjectManager } from '@plugin/core/project/project-manager';
import { preparePythonOperatorLaunchContext } from '@plugin/controller/task-controller';
import { ConfigService } from '@plugin/service/config-service';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { resolveOrPickPythonOperatorUri } from '@plugin/helpers/python-operator-editor-context';
import { buildPythonDeployTarget } from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';

/**
 * Base predicate for comparison.
 *
 * The write predicate (task-controller.ts:145-153):
 *   const buildConfigId = await buildService.getBuildConfigId();
 *   if (buildConfigId) {
 *     const projectIdStr = ProjectManager.getInstance().projectId;
 *     if (projectIdStr) { const deployTarget = buildPythonDeployTarget(relativePath);
 *       await ConfigService.writeBuildOpDeployTarget(deployTarget); }
 *   }
 * i.e. the deploy target is written iff a build_op config ROW exists AND the
 * project is registered — the row survives regardless of the values it holds
 * (rows are seeded create-if-missing for recognized/created/imported projects,
 * independent of settings contents). The id-free twin of "build_op row exists"
 * is the synthesized project record (`getProjectByPath`), which is non-null
 * exactly for recognized projects (settings projectType, cache scan marker,
 * or devtool_config.json).
 */
const baseWritePredicate = (buildOpRowExists: boolean, projectIdSet: boolean): boolean =>
  buildOpRowExists && projectIdSet;

describe('preparePythonOperatorLaunchContext deploy-target guard', () => {
  const workspacePath = path.join(os.tmpdir(), 'py-launch-guard');
  const filePath = path.join(workspacePath, 'op.py');

  beforeEach(() => {
    jest.clearAllMocks();
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath: workspacePath });
    (getProjectByPath as jest.Mock).mockReturnValue({
      project_path: workspacePath,
      project_type: 'pyasc',
    });
    (resolveOrPickPythonOperatorUri as jest.Mock).mockResolvedValue({ fsPath: filePath });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspacePath } } as vscode.WorkspaceFolder];
  });

  it('matches the base write predicate on the same inputs (parity matrix)', async () => {
    const cases = [
      {
        rowExists: true,
        projectPathSet: true,
        expectWrite: true,
      },
      {
        rowExists: true,
        projectPathSet: false,
        expectWrite: false,
      },
      {
        rowExists: false,
        projectPathSet: true,
        expectWrite: false,
      },
      {
        rowExists: false,
        projectPathSet: false,
        expectWrite: false,
      },
    ];

    for (const c of cases) {
      jest.clearAllMocks();

      (getProjectByPath as jest.Mock).mockReturnValue(c.rowExists
        ? {
          project_path: workspacePath,
          project_type: 'pyasc',
        }
        : undefined);
      (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath: c.projectPathSet ? workspacePath : '' });
      (resolveOrPickPythonOperatorUri as jest.Mock).mockResolvedValue({ fsPath: filePath });

      const ctx = await preparePythonOperatorLaunchContext('pyasc');

      expect(ctx)
        .not.toBeNull();
      // Same inputs, same decision as base:
      expect(baseWritePredicate(c.rowExists, c.projectPathSet))
        .toBe(c.expectWrite);
      expect(ConfigService.writeBuildOpDeployTarget)
        .toHaveBeenCalledTimes(c.expectWrite ? 1 : 0);
    }
  });

  it('writes the deploy target even when build_op settings are empty — the write proceeds as long as the row exists', async () => {
    // Edge (b): the user clears all build_op settings,
    // the config row still exists → the write proceeds (the picked .py becomes
    // the run target). The settings map must not gate the write.
    const ctx = await preparePythonOperatorLaunchContext('pyasc');

    expect(ctx)
      .not.toBeNull();
    expect(ConfigService.writeBuildOpDeployTarget)
      .toHaveBeenCalledTimes(1);
    const relativePath = path.relative(workspacePath, filePath)
      .replace(/\\/g, '/');

    expect(ConfigService.writeBuildOpDeployTarget)
      .toHaveBeenCalledWith(buildPythonDeployTarget(relativePath));
  });

  it('skips the write when the workspace is not a recognized project (no build_op row → skip)', async () => {
    // Edge (a): a from-disk folder without stored rows /
    // detection has no build_op row → the write is skipped. The
    // synthesized record is undefined for such a workspace → skip.
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);

    const ctx = await preparePythonOperatorLaunchContext('pyasc');

    expect(ctx)
      .not.toBeNull();
    expect(ConfigService.writeBuildOpDeployTarget)
      .not.toHaveBeenCalled();
  });

  it('skips the write when projectPath is empty', async () => {
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath: '' });

    const ctx = await preparePythonOperatorLaunchContext('pyasc');

    expect(ctx)
      .not.toBeNull();
    expect(ConfigService.writeBuildOpDeployTarget)
      .not.toHaveBeenCalled();
  });

  it('returns null without any write for a non-python project', async () => {
    const ctx = await preparePythonOperatorLaunchContext('cann');

    expect(ctx)
      .toBeNull();
    expect(ConfigService.writeBuildOpDeployTarget)
      .not.toHaveBeenCalled();
  });
});
