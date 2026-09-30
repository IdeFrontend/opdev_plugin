/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import os from 'node:os';
import path from 'node:path';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => ({
  env: { uriScheme: 'vscode' },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: { workspaceFolders: undefined },
  window: {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
  },
  commands: { executeCommand: jest.fn(() => Promise.resolve()) },
  debug: { startDebugging: jest.fn(() => Promise.resolve(true)) },
}));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/build-service', () => ({
  buildService: {
    startBuild: jest.fn(),
    startRun: jest.fn(),
    startBuildExample: jest.fn(),
    startSimulate: jest.fn(),
    startOnBoard: jest.fn(),
    startDumpTensor: jest.fn(),
    startUtTest: jest.fn(),
    importDumpTensorBinFile: jest.fn(),
  },
  isRootStandardCustom: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@plugin/service/sanitizer-service', () => ({ sanitizerService: { runSanitizer: jest.fn() } }));

jest.mock('@plugin/helpers/post-activate-bootstrap', () => ({
  whenPostActivateBootstrapReady: jest.fn(() => Promise.resolve()),
  isMindStudioDebugExtensionActive: jest.fn(() => true),
}));

jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({
  startNpuHardwareProbe: jest.fn(() => Promise.resolve(true)),
  startRemoteNpuHardwareProbe: jest.fn(() => Promise.resolve(false)),
}));

const enqueueCompileRunMock = jest.fn((_kind: string, action: ()=> unknown) => action());
const getCompileOptionForSelectedOperatorsMock = jest.fn(() => Promise.resolve('--fast'));
const buildRemoteExecCommandMock = jest.fn((command: string) => `remote:${command}`);
const buildOperatorSpawnContextMock = jest.fn((context: unknown) => context);
const createRemoteCommandWhenNoNpuTransformerMock = jest.fn(() => (command: unknown) => command);

jest.mock('@plugin/helpers/operator-flow-coordinator', () => ({ enqueueCompileRun: enqueueCompileRunMock }));

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    getProjectType: jest.fn(() => Promise.resolve({ projectType: 'ascend' })),
    resolveBuildTargetFile: jest.fn(),
    resolveDebugOperatorEntry: jest.fn(),
    resolveBuildExampleTargetFile: jest.fn(),
    getSelectedOperators: jest.fn(),
  },
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    hasBuildExampleConfig: jest.fn(() => false),
    writeBuildOpDeployTarget: jest.fn(),
  },
}));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({
  OperatorPluginRegistry: {
    isProjectTypeSupported: jest.fn(() => true),
    getBuildBehaviorByProjectType: jest.fn(() => 'build'),
  },
}));

jest.mock('@plugin/helpers/compile-options', () => ({ getCompileOptionForSelectedOperators: getCompileOptionForSelectedOperatorsMock }));

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

jest.mock('@plugin/domain/services/command-strategy/python-operator-strategy-shared', () => ({
  buildPythonDeployTarget: jest.fn(),
  resolvePythonExecutablePath: jest.fn(() => 'python3'),
}));

jest.mock('@plugin/helpers/python-operator-editor-context', () => ({ resolveOrPickPythonOperatorUri: jest.fn() }));

jest.mock('@plugin/domain/models/op-record', () => ({ resolveOpRecord: jest.fn() }));

jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn() }));

jest.mock('@plugin/helpers/remote-command', () => ({
  buildRemoteExecCommand: buildRemoteExecCommandMock,
  ensureRemoteToolAvailable: jest.fn(() => Promise.resolve(true)),
  buildRemoteBuildExampleCommand: jest.fn(),
  createRemoteCommandWhenNoNpuTransformer: createRemoteCommandWhenNoNpuTransformerMock,
  getRemoteToolConfig: jest.fn(() => Promise.resolve({ host: '10.0.0.1' })),
}));

jest.mock('@plugin/service/operator-command-executor', () => ({
  executeOperatorCommand: jest.fn(() => Promise.resolve({
    code: 0,
    output: 'ok',
    interruptedByUserStop: false,
  })),
  buildOperatorSpawnContext: buildOperatorSpawnContextMock,
}));

jest.mock('@plugin/class/st-test-results-panel', () => ({
  StTestResultsPanel: {
    recordCompletedRun: jest.fn(),
    createOrShow: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@plugin/helpers/st-test-completion-notification', () => ({ showStTestCompletionNotification: jest.fn(() => Promise.resolve()) }));

jest.mock('@plugin/service/st-test-service', () => ({ StTestService: jest.fn(() => ({ startStTest: jest.fn() })) }));

jest.mock('@plugin/domain/services/st-test-errors', () => ({ isStTestCancelledError: jest.fn(() => false) }));

import * as vscode from 'vscode';
import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  parseRemoteDebugAdapterReadyPort,
  taskMethods,
} from '@plugin/controller/task-controller';
import {
  buildService, isRootStandardCustom,
} from '@plugin/service/build-service';
import { homeMethods } from '@plugin/controller/home-controller';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  startNpuHardwareProbe,
  startRemoteNpuHardwareProbe,
} from '@plugin/domain/utils/npu-hardware-probe';
import { isMindStudioDebugExtensionActive } from '@plugin/helpers/post-activate-bootstrap';
import { probeTritonPythonDependencies } from '@plugin/domain/services/command-strategy/triton-strategy';
import { resolveOrPickPythonOperatorUri } from '@plugin/helpers/python-operator-editor-context';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import {
  msdebugConfiguredTargetExists,
  updateMsdebugTarget,
} from '@plugin/domain/utils/debug-target';
import {
  isPythonDebugLaunchConfig,
  resolveDebugLaunchConfigName,
} from '@plugin/domain/utils/debug-config-resolver';
import { updateMsdebugPythonTarget } from '@plugin/domain/utils/debug-python-target';
import { resolvePythonExecutablePath } from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import { ensureMsdebugBreakpointFileAssociations } from '@plugin/domain/utils/msdebug-ide-settings';
import { resolveTritonLaunchKernelPath } from '@plugin/domain/utils/triton-kernel-path';
import {
  ensureRemoteToolAvailable,
  getRemoteToolConfig,
} from '@plugin/helpers/remote-command';
import { executeOperatorCommand } from '@plugin/service/operator-command-executor';
import {
  getBuildExampleCommand,
  resolveBuildExampleBaseContext,
  resolveExampleModeForBaseContext,
} from '@plugin/domain';
import { resolveOpRecord } from '@plugin/domain/models/op-record';

describe('taskMethods.runDebug', () => {
  let tempRoot: string;
  const executor = {
    kill: jest.fn(),
    executeDetached: jest.fn(() => Promise.resolve({ output: 'no adapter output' })),
  };
  const projectManager = {
    getExecutor: jest.fn(() => executor),
    clearExecutor: jest.fn(),
    projectPath: '',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mstt-task-debug-'));
    (vscode.workspace as unknown as { workspaceFolders: Array<{ uri: { fsPath: string } }> })
      .workspaceFolders = [{ uri: { fsPath: tempRoot } }];
    (ProjectManager.getInstance as jest.Mock)
      .mockReturnValue(projectManager);
    projectManager.projectPath = tempRoot;
    (projectManager.getExecutor as jest.Mock)
      .mockReturnValue(executor);
    (enqueueCompileRunMock as jest.Mock)
      .mockImplementation((_kind: string, action: ()=> unknown) => action());
    (isMindStudioDebugExtensionActive as jest.Mock)
      .mockReturnValue(true);
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(false);
    (probeTritonPythonDependencies as jest.Mock)
      .mockResolvedValue({ ok: true });
    (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
      .mockReturnValue(true);
    (OperatorPluginRegistry.getBuildBehaviorByProjectType as jest.Mock)
      .mockReturnValue('build');
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'ascend' });
    (homeMethods.getSelectedOperators as jest.Mock)
      .mockResolvedValue(['Add']);
    (getCompileOptionForSelectedOperatorsMock as jest.Mock)
      .mockResolvedValue('--fast');
    (buildService.startBuild as jest.Mock)
      .mockResolvedValue(true);
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(false);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(false);
    (resolveOrPickPythonOperatorUri as jest.Mock)
      .mockResolvedValue({ fsPath: path.join(tempRoot, 'op.py') });
    (getProjectByPath as jest.Mock)
      .mockReturnValue(undefined);
    (msdebugConfiguredTargetExists as jest.Mock)
      .mockReturnValue(true);
    (updateMsdebugTarget as jest.Mock)
      .mockResolvedValue({ status: 'updated' });
    (isPythonDebugLaunchConfig as jest.Mock)
      .mockReturnValue(false);
    (resolveDebugLaunchConfigName as jest.Mock)
      .mockReturnValue('msdebug');
    (updateMsdebugPythonTarget as jest.Mock)
      .mockResolvedValue(undefined);
    (resolvePythonExecutablePath as jest.Mock)
      .mockReturnValue('python3');
    (buildRemoteExecCommandMock as jest.Mock)
      .mockImplementation((command: string) => `remote:${command}`);
    (ensureRemoteToolAvailable as jest.Mock)
      .mockResolvedValue(true);
    (getRemoteToolConfig as jest.Mock)
      .mockResolvedValue({ host: '10.0.0.1' });
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 0,
        output: 'ok',
        interruptedByUserStop: false,
      });
    (buildOperatorSpawnContextMock as jest.Mock)
      .mockImplementation((context: unknown) => context);
    (createRemoteCommandWhenNoNpuTransformerMock as jest.Mock)
      .mockImplementation(() => (command: unknown) => command);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(tempRoot, {
      recursive: true,
      force: true,
    });
  });

  it('does nothing when the MindStudio debug extension is inactive', async () => {
    (isMindStudioDebugExtensionActive as jest.Mock)
      .mockReturnValue(false);

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('mindStudio.debugPluginInstalling');
    expect(startNpuHardwareProbe)
      .not.toHaveBeenCalled();
  });

  it('rejects the launch when no local or remote NPU is available', async () => {
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(false);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(false);

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('extension.remoteToolRequired');
    expect(buildService.startBuild)
      .not.toHaveBeenCalled();
  });

  it('stops when the project type is unsupported', async () => {
    (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
      .mockReturnValue(false);
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'custom' });

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('extension.unsupportedProjectTypeDisabled');
    expect(buildService.startBuild)
      .not.toHaveBeenCalled();
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('aborts the launch when the Triton Python dependencies are missing', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'triton' });
    (probeTritonPythonDependencies as jest.Mock)
      .mockResolvedValue({
        ok: false,
        stderr: 'numpy missing',
        interpreter: 'python3',
      });

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.tritonDebugDependenciesMissing\nnumpy missing');
    expect(buildService.startBuild)
      .not.toHaveBeenCalled();
    // The early return inside the try block is followed by the finally cleanup.
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(2);
  });

  it('aborts when no Python file can be resolved for a python operator project', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'pyasc' });
    (resolveOrPickPythonOperatorUri as jest.Mock)
      .mockResolvedValue(undefined);

    await taskMethods.runDebug();

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('task.openPyFirst');
    expect(buildService.startBuild)
      .not.toHaveBeenCalled();
  });

  it('does not launch the debugger when the debug build was not built', async () => {
    (buildService.startBuild as jest.Mock)
      .mockResolvedValue(false);

    await taskMethods.runDebug();

    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('launches the C/C++ debug session against the configured target', async () => {
    await taskMethods.runDebug();

    expect(buildService.startBuild)
      .toHaveBeenCalledWith({
        scriptField: 'npu_debug_script',
        operatorNames: ['Add'],
        compileOption: '--fast',
      }, 'npu debug');
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.debug.action.toggleRepl');
    expect(updateMsdebugTarget)
      .toHaveBeenCalledWith(tempRoot, undefined, undefined);
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalledWith({ uri: { fsPath: tempRoot } }, 'msdebug');
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('auto-adapts the msdebug target to the resolved operator', async () => {
    (homeMethods.resolveDebugOperatorEntry as jest.Mock)
      .mockResolvedValue({ name: 'Add' });
    // Synchronous in the real home-controller; the controller passes the
    // value straight through to updateMsdebugTarget without awaiting.
    (homeMethods.resolveBuildExampleTargetFile as jest.Mock)
      .mockReturnValue(path.join(tempRoot, 'build', 'Add'));

    await taskMethods.runDebug();

    expect(updateMsdebugTarget)
      .toHaveBeenCalledWith(
        tempRoot,
        { name: 'Add' },
        path.join(tempRoot, 'build', 'Add'),
      );
  });

  it('warns when no operator could be resolved for msdebug adaptation', async () => {
    (updateMsdebugTarget as jest.Mock)
      .mockResolvedValue({
        status: 'noop',
        reason: 'no_operator',
      });

    await taskMethods.runDebug();

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('debug.autoAdaptNoOperator');
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('warns when no binary could be resolved for msdebug adaptation', async () => {
    (updateMsdebugTarget as jest.Mock)
      .mockResolvedValue({
        status: 'noop',
        reason: 'no_binary',
      });

    await taskMethods.runDebug();

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('debug.autoAdaptNoBinary');
  });

  it('continues when msdebug target adaptation throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation();

    (updateMsdebugTarget as jest.Mock)
      .mockRejectedValue(new Error('adaptation failed'));

    await taskMethods.runDebug();

    expect(console.warn)
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('blocks the launch when the configured target binary is missing', async () => {
    (msdebugConfiguredTargetExists as jest.Mock)
      .mockReturnValue(false);

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('debug.targetBinaryMissing');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('patches the python launch config for pyasc projects', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'pyasc' });
    (isPythonDebugLaunchConfig as jest.Mock)
      .mockReturnValue(true);

    await taskMethods.runDebug();

    expect(updateMsdebugPythonTarget)
      .toHaveBeenCalledWith(tempRoot, ['msdebug'], {
        interpreter: 'python3',
        scriptArg: './op.py',
        cwd: tempRoot,
        launchKernelPath: undefined,
      });
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('resolves the Triton launch kernel path for NPU debug', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'triton' });
    (isPythonDebugLaunchConfig as jest.Mock)
      .mockReturnValue(true);
    (resolveTritonLaunchKernelPath as jest.Mock)
      .mockReturnValue(path.join(tempRoot, 'op_kernel.py'));

    await taskMethods.runDebug();

    expect(resolveTritonLaunchKernelPath)
      .toHaveBeenCalledWith(tempRoot, 'op');
    expect(ensureMsdebugBreakpointFileAssociations)
      .toHaveBeenCalledWith(tempRoot);
    expect(updateMsdebugPythonTarget)
      .toHaveBeenCalledWith(tempRoot, ['msdebug'], {
        interpreter: 'python3',
        scriptArg: './op.py',
        cwd: tempRoot,
        launchKernelPath: path.join(tempRoot, 'op_kernel.py'),
      });
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('warns when the Triton launch kernel path cannot be resolved', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'triton' });
    (isPythonDebugLaunchConfig as jest.Mock)
      .mockReturnValue(true);
    (resolveTritonLaunchKernelPath as jest.Mock)
      .mockReturnValue(undefined);

    await taskMethods.runDebug();

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('task.tritonKernelPathNotFound');
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('continues when breakpoint file association fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation();

    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'triton' });
    (isPythonDebugLaunchConfig as jest.Mock)
      .mockReturnValue(true);
    (ensureMsdebugBreakpointFileAssociations as jest.Mock)
      .mockRejectedValue(new Error('settings lock'));

    await taskMethods.runDebug();

    expect(console.warn)
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('continues when the python debug target update fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation();

    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'pyasc' });
    (isPythonDebugLaunchConfig as jest.Mock)
      .mockReturnValue(true);
    (updateMsdebugPythonTarget as jest.Mock)
      .mockRejectedValue(new Error('write failed'));

    await taskMethods.runDebug();

    expect(console.warn)
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('runs buildExample before debug for standard custom projects', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveOpRecord as jest.Mock)
      .mockReturnValue({ op_name: 'Add' });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
        opName: 'Add',
      });
    (getBuildExampleCommand as jest.Mock)
      .mockReturnValue('build-example-cmd');

    await taskMethods.runDebug();

    expect(executeOperatorCommand)
      .toHaveBeenCalledWith('build-example-cmd', expect.anything(), expect.objectContaining({ transformCommand: expect.any(Function) }));
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('warns when no example source exists for the operator', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveOpRecord as jest.Mock)
      .mockReturnValue({ op_name: 'Add' });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: false,
        opName: 'Add',
      });

    await taskMethods.runDebug();

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('build.exampleNoSourceForOperator');
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('stops when the example build fails', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
      });
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 1,
        output: 'oops',
        interruptedByUserStop: false,
      });

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('build.executeFailed');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('stops silently when the example build was interrupted by the user', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
      });
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 1,
        output: 'stopped',
        interruptedByUserStop: true,
      });

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .not.toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('starts a remote debug adapter and patches launch.json when no local NPU is available', async () => {
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    (executor.executeDetached as jest.Mock)
      .mockResolvedValue({ output: 'log line\n{"event":"ready","port":45678}' });

    await mkdir(path.join(tempRoot, '.vscode'), { recursive: true });
    await writeFile(
      path.join(tempRoot, '.vscode', 'launch.json'),
      JSON.stringify({
        configurations: [
          {
            name: 'remote-debug',
            remoteConfig: {
              host: 'old',
              port: 1,
            },
          },
        ],
      }),
    );

    await taskMethods.runDebug();

    expect(executor.executeDetached)
      .toHaveBeenCalledWith(
        'remote:cd /opt/msdebug-remote-adapter && node ./bin/msdebug-remote-adapter start',
        '"event":"ready"',
        [],
        expect.objectContaining({
          toolOutputLabel: 'npu debug',
          timeout: 30000,
        }),
        true,
      );
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();

    const launchJson = JSON.parse(await readFile(path.join(tempRoot, '.vscode', 'launch.json'), 'utf8')) as {
      configurations: Array<{ remoteConfig: { host: string;
        port: number;
        remoteWorkspaceFolder: string } }>;
    };

    expect(launchJson.configurations[0].remoteConfig)
      .toEqual({
        host: '10.0.0.1',
        port: 45678,
        remoteWorkspaceFolder: tempRoot,
      });
  });

  it('aborts remote debug when launch.json has no remote-debug config to patch', async () => {
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    (executor.executeDetached as jest.Mock)
      .mockResolvedValue({ output: '{"event":"ready","port":45678}' });

    await mkdir(path.join(tempRoot, '.vscode'), { recursive: true });
    await writeFile(
      path.join(tempRoot, '.vscode', 'launch.json'),
      JSON.stringify({
        configurations: [
          {
            name: 'other',
            remoteConfig: {
              host: 'old',
              port: 1,
            },
          },
        ],
      }),
    );

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.remoteDebugAdapterStartFailed');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('proceeds to launch when the python debug config exists without a python context', async () => {
    (isPythonDebugLaunchConfig as jest.Mock)
      .mockReturnValue(true);

    await taskMethods.runDebug();

    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('aborts remote debug when the adapter never reports a ready port', async () => {
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (executor.executeDetached as jest.Mock)
      .mockResolvedValue({ output: 'booting without a port' });

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.remoteDebugAdapterStartFailed');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('aborts remote debug when the remote tool config provides no host', async () => {
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (getRemoteToolConfig as jest.Mock)
      .mockResolvedValue({ host: '   ' });

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.remoteDebugAdapterStartFailed');
    expect(executor.executeDetached)
      .not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('aborts remote debug when the remote tool is unavailable', async () => {
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    (ensureRemoteToolAvailable as jest.Mock)
      .mockResolvedValue(false);

    await taskMethods.runDebug();

    expect(getRemoteToolConfig)
      .not.toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('aborts remote debug when launch.json cannot be updated', async () => {
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation();

    (executor.executeDetached as jest.Mock)
      .mockResolvedValue({ output: '{"event":"ready","port":45678}' });

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.remoteDebugAdapterStartFailed');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('aborts remote debug when the adapter process fails to start', async () => {
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    (startRemoteNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (executor.executeDetached as jest.Mock)
      .mockRejectedValue(new Error('spawn failed'));

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.remoteDebugAdapterStartFailed');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('starts the default debug session when there is no workspace folder', async () => {
    (vscode.workspace as unknown as { workspaceFolders: Array<{ uri: { fsPath: string } }> })
      .workspaceFolders = [];

    await taskMethods.runDebug();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.action.debug.start');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('propagates unexpected errors from the debug launch', async () => {
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (buildService.startBuild as jest.Mock)
      .mockRejectedValue(new Error('build boom'));

    await expect(taskMethods.runDebug())
      .rejects
      .toThrow('build boom');
    expect(console.error)
      .toHaveBeenCalled();
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('passes a null project type through to the launch patch', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: null });

    await taskMethods.runDebug();

    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('omits operator names from the debug build when none are selected', async () => {
    (homeMethods.getSelectedOperators as jest.Mock)
      .mockResolvedValue(undefined);

    await taskMethods.runDebug();

    expect(buildService.startBuild)
      .toHaveBeenCalledWith({
        scriptField: 'npu_debug_script',
        operatorNames: undefined,
        compileOption: '--fast',
      }, 'npu debug');
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('skips the example build when no project path is available for a standard-custom project', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    projectManager.projectPath = '';

    await taskMethods.runDebug();

    expect(ConfigService.hasBuildExampleConfig)
      .not
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('runs the example build with an unresolved project record and no operators', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue(undefined);
    (homeMethods.getSelectedOperators as jest.Mock)
      .mockResolvedValue(undefined);
    (resolveOpRecord as jest.Mock)
      .mockReturnValue(undefined);
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: '' });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
      });
    (getBuildExampleCommand as jest.Mock)
      .mockReturnValue('build-example-cmd');

    await taskMethods.runDebug();

    expect(executeOperatorCommand)
      .toHaveBeenCalledWith('build-example-cmd', expect.anything(), expect.anything());
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('omits the stderr detail when the Triton dependency probe fails without output', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'triton' });
    (probeTritonPythonDependencies as jest.Mock)
      .mockResolvedValue({
        ok: false,
        stderr: undefined,
        interpreter: 'python3',
      });

    await taskMethods.runDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('task.tritonDebugDependenciesMissing');
    expect(buildService.startBuild)
      .not
      .toHaveBeenCalled();
  });

  it('persists the python deploy target when the project record exists', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'pyasc' });
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_name: 'op',
      });

    await taskMethods.runDebug();

    expect(ConfigService.writeBuildOpDeployTarget)
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('aborts the debug launch when no workspace folder is open for a python project', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'pyasc' });
    (vscode.workspace as unknown as { workspaceFolders: Array<{ uri: { fsPath: string } }> })
      .workspaceFolders = [];

    await taskMethods.runDebug();

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('task.workspacePathNotFound');
    expect(buildService.startBuild)
      .not
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .not
      .toHaveBeenCalled();
  });
});

describe('taskMethods.runCpuDebug', () => {
  let tempRoot: string;
  const executor = {
    kill: jest.fn(),
    executeDetached: jest.fn(),
  };
  const projectManager = {
    getExecutor: jest.fn(() => executor),
    clearExecutor: jest.fn(),
    projectPath: '',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mstt-task-cpu-debug-'));
    (vscode.workspace as unknown as { workspaceFolders: Array<{ uri: { fsPath: string } }> })
      .workspaceFolders = [{ uri: { fsPath: tempRoot } }];
    (ProjectManager.getInstance as jest.Mock)
      .mockReturnValue(projectManager);
    projectManager.projectPath = tempRoot;
    (projectManager.getExecutor as jest.Mock)
      .mockReturnValue(executor);
    (enqueueCompileRunMock as jest.Mock)
      .mockImplementation((_kind: string, action: ()=> unknown) => action());
    (isMindStudioDebugExtensionActive as jest.Mock)
      .mockReturnValue(true);
    (startNpuHardwareProbe as jest.Mock)
      .mockResolvedValue(true);
    (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
      .mockReturnValue(true);
    (OperatorPluginRegistry.getBuildBehaviorByProjectType as jest.Mock)
      .mockReturnValue('build');
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'ascend' });
    (homeMethods.getSelectedOperators as jest.Mock)
      .mockResolvedValue(['Add']);
    (getCompileOptionForSelectedOperatorsMock as jest.Mock)
      .mockResolvedValue('--fast');
    (buildService.startBuild as jest.Mock)
      .mockResolvedValue(true);
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(false);
    (resolveOrPickPythonOperatorUri as jest.Mock)
      .mockResolvedValue({ fsPath: path.join(tempRoot, 'op.py') });
    (getProjectByPath as jest.Mock)
      .mockReturnValue(undefined);
    (msdebugConfiguredTargetExists as jest.Mock)
      .mockReturnValue(true);
    (updateMsdebugTarget as jest.Mock)
      .mockResolvedValue({ status: 'updated' });
    (isPythonDebugLaunchConfig as jest.Mock)
      .mockReturnValue(false);
    (resolveDebugLaunchConfigName as jest.Mock)
      .mockReturnValue('msdebug');
    (resolvePythonExecutablePath as jest.Mock)
      .mockReturnValue('python3');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(tempRoot, {
      recursive: true,
      force: true,
    });
  });

  it('does nothing when the MindStudio debug extension is inactive', async () => {
    (isMindStudioDebugExtensionActive as jest.Mock)
      .mockReturnValue(false);

    await taskMethods.runCpuDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('mindStudio.debugPluginInstalling');
  });

  it('aborts early for Triton projects', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'triton' });

    await taskMethods.runCpuDebug();

    expect(buildService.startBuild)
      .not.toHaveBeenCalled();
    // The early return inside the try block is followed by the finally cleanup.
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(2);
  });

  it('launches the C/C++ CPU debug session against the configured target', async () => {
    await taskMethods.runCpuDebug();

    expect(buildService.startBuild)
      .toHaveBeenCalledWith({
        scriptField: 'cpu_debug_script',
        operatorNames: ['Add'],
        compileOption: '--fast',
      }, 'cpu debug');
    expect(resolveDebugLaunchConfigName)
      .toHaveBeenCalledWith('ascend', 'cpu', 'build', undefined);
    expect(updateMsdebugTarget)
      .toHaveBeenCalledWith(tempRoot, undefined, undefined);
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalledWith({ uri: { fsPath: tempRoot } }, 'msdebug');
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('blocks the CPU debug session when the target binary is missing', async () => {
    (msdebugConfiguredTargetExists as jest.Mock)
      .mockReturnValue(false);

    await taskMethods.runCpuDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('debug.targetBinaryMissing');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('does not launch the debugger when the CPU debug build was not built', async () => {
    (buildService.startBuild as jest.Mock)
      .mockResolvedValue(false);

    await taskMethods.runCpuDebug();

    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('builds the example first and launches CPU debug for standard custom projects', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveOpRecord as jest.Mock)
      .mockReturnValue({ op_name: 'Add' });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
      });
    (getBuildExampleCommand as jest.Mock)
      .mockReturnValue('build-example-cmd');
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 0,
        output: 'ok',
        interruptedByUserStop: false,
      });
    (buildOperatorSpawnContextMock as jest.Mock)
      .mockImplementation((context: unknown) => context);
    (createRemoteCommandWhenNoNpuTransformerMock as jest.Mock)
      .mockImplementation(() => (command: unknown) => command);

    await taskMethods.runCpuDebug();

    expect(executeOperatorCommand)
      .toHaveBeenCalledWith(
        'build-example-cmd',
        expect.objectContaining({
          projectPath: tempRoot,
          script: 'build-example-cmd',
        }),
        expect.anything(),
      );
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalledWith({ uri: { fsPath: tempRoot } }, 'msdebug');
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
  });

  it('stops CPU debug when the example build for a standard custom project fails', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveOpRecord as jest.Mock)
      .mockReturnValue({ op_name: 'Add' });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
      });
    (getBuildExampleCommand as jest.Mock)
      .mockReturnValue('build-example-cmd');
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 1,
        output: 'boom',
        interruptedByUserStop: false,
      });
    (buildOperatorSpawnContextMock as jest.Mock)
      .mockImplementation((context: unknown) => context);
    (createRemoteCommandWhenNoNpuTransformerMock as jest.Mock)
      .mockImplementation(() => (command: unknown) => command);

    await taskMethods.runCpuDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('build.executeFailed');
    expect(vscode.debug.startDebugging)
      .not.toHaveBeenCalled();
  });

  it('stops CPU debug when the project type is unsupported', async () => {
    (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
      .mockReturnValue(false);

    await taskMethods.runCpuDebug();

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith('extension.unsupportedProjectTypeDisabled');
    expect(buildService.startBuild)
      .not
      .toHaveBeenCalled();
  });

  it('aborts CPU debug when no python file can be resolved for a pyasc project', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: 'pyasc' });
    (resolveOrPickPythonOperatorUri as jest.Mock)
      .mockResolvedValue(undefined);

    await taskMethods.runCpuDebug();

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('task.openPyFirst');
    expect(buildService.startBuild)
      .not
      .toHaveBeenCalled();
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(2);
  });

  it('omits operator names from the CPU debug build when none are selected', async () => {
    (homeMethods.getSelectedOperators as jest.Mock)
      .mockResolvedValue(undefined);

    await taskMethods.runCpuDebug();

    expect(buildService.startBuild)
      .toHaveBeenCalledWith({
        scriptField: 'cpu_debug_script',
        operatorNames: undefined,
        compileOption: '--fast',
      }, 'cpu debug');
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('skips the example build when no project path is available for a standard-custom project', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    projectManager.projectPath = '';

    await taskMethods.runCpuDebug();

    expect(ConfigService.hasBuildExampleConfig)
      .not
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('runs the example build for a standard-custom project with no operators selected', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (homeMethods.getSelectedOperators as jest.Mock)
      .mockResolvedValue(undefined);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveOpRecord as jest.Mock)
      .mockReturnValue({ op_name: 'Add' });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
      });
    (getBuildExampleCommand as jest.Mock)
      .mockReturnValue('build-example-cmd');
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 0,
        output: 'ok',
        interruptedByUserStop: false,
      });
    (buildOperatorSpawnContextMock as jest.Mock)
      .mockImplementation((context: unknown) => context);
    (createRemoteCommandWhenNoNpuTransformerMock as jest.Mock)
      .mockImplementation(() => (command: unknown) => command);

    await taskMethods.runCpuDebug();

    expect(executeOperatorCommand)
      .toHaveBeenCalledWith(
        'build-example-cmd',
        expect.objectContaining({
          projectPath: tempRoot,
          operatorNames: undefined,
        }),
        expect.anything(),
      );
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('falls back to empty strings when the op record and project are unresolved', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue(undefined);
    (resolveOpRecord as jest.Mock)
      .mockReturnValue(undefined);
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: '' });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
      });
    (getBuildExampleCommand as jest.Mock)
      .mockReturnValue('build-example-cmd');
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 0,
        output: 'ok',
        interruptedByUserStop: false,
      });
    (buildOperatorSpawnContextMock as jest.Mock)
      .mockImplementation((context: unknown) => context);
    (createRemoteCommandWhenNoNpuTransformerMock as jest.Mock)
      .mockImplementation(() => (command: unknown) => command);

    await taskMethods.runCpuDebug();

    expect(executeOperatorCommand)
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('warns when no example source exists for the CPU debug operator', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveOpRecord as jest.Mock)
      .mockReturnValue({ op_name: 'Add' });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: false,
        opName: 'Add',
      });
    (getBuildExampleCommand as jest.Mock)
      .mockReturnValue('build-example-cmd');
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 0,
        output: 'ok',
        interruptedByUserStop: false,
      });
    (buildOperatorSpawnContextMock as jest.Mock)
      .mockImplementation((context: unknown) => context);
    (createRemoteCommandWhenNoNpuTransformerMock as jest.Mock)
      .mockImplementation(() => (command: unknown) => command);

    await taskMethods.runCpuDebug();

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('build.exampleNoSourceForOperator');
    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('stops CPU debug silently when the example build was interrupted by the user', async () => {
    (isRootStandardCustom as jest.Mock)
      .mockResolvedValue(true);
    (ConfigService.hasBuildExampleConfig as jest.Mock)
      .mockReturnValue(true);
    (getProjectByPath as jest.Mock)
      .mockReturnValue({
        project_path: tempRoot,
        project_type: 'standard-custom',
      });
    (resolveOpRecord as jest.Mock)
      .mockReturnValue({ op_name: 'Add' });
    (resolveBuildExampleBaseContext as jest.Mock)
      .mockReturnValue({ project_path: tempRoot });
    (resolveExampleModeForBaseContext as jest.Mock)
      .mockReturnValue({
        mode: 'build',
        exampleFound: true,
      });
    (getBuildExampleCommand as jest.Mock)
      .mockReturnValue('build-example-cmd');
    (executeOperatorCommand as jest.Mock)
      .mockResolvedValue({
        code: 1,
        output: 'stopped',
        interruptedByUserStop: true,
      });
    (buildOperatorSpawnContextMock as jest.Mock)
      .mockImplementation((context: unknown) => context);
    (createRemoteCommandWhenNoNpuTransformerMock as jest.Mock)
      .mockImplementation(() => (command: unknown) => command);

    await taskMethods.runCpuDebug();

    expect(vscode.window.showErrorMessage)
      .not
      .toHaveBeenCalled();
    expect(vscode.debug.startDebugging)
      .not
      .toHaveBeenCalled();
  });

  it('starts the default CPU debug session when there is no workspace folder', async () => {
    (vscode.workspace as unknown as { workspaceFolders: Array<{ uri: { fsPath: string } }> })
      .workspaceFolders = [];

    await taskMethods.runCpuDebug();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.action.debug.start');
    expect(vscode.debug.startDebugging)
      .not
      .toHaveBeenCalled();
  });

  it('passes a null project type through to the CPU launch patch', async () => {
    (homeMethods.getProjectType as jest.Mock)
      .mockResolvedValue({ projectType: null });

    await taskMethods.runCpuDebug();

    expect(vscode.debug.startDebugging)
      .toHaveBeenCalled();
  });

  it('propagates unexpected errors from the CPU debug launch', async () => {
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation();

    (buildService.startBuild as jest.Mock)
      .mockRejectedValue(new Error('cpu boom'));

    await expect(taskMethods.runCpuDebug())
      .rejects
      .toThrow('cpu boom');
    expect(console.error)
      .toHaveBeenCalled();
    expect(projectManager.clearExecutor)
      .toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('parseRemoteDebugAdapterReadyPort edge cases', () => {
  it('returns undefined when no ready event is present', () => {
    expect(parseRemoteDebugAdapterReadyPort('booting logs\n{"event":"started","port":1234}'))
      .toBeUndefined();
  });

  it('ignores ready events with invalid ports', () => {
    for (const port of [
      0,
      -1,
      65536,
      1.5,
    ]) {
      expect(parseRemoteDebugAdapterReadyPort(`{"event":"ready","port":${port}}`))
        .toBeUndefined();
    }
  });

  it('skips malformed JSON fragments', () => {
    expect(parseRemoteDebugAdapterReadyPort('{"event":"ready","port": broken'))
      .toBeUndefined();
  });

  it('prefers the last ready event in combined output', () => {
    expect(parseRemoteDebugAdapterReadyPort('{"event":"ready","port":1111}\n{"event":"ready","port":2222}'))
      .toBe(2222);
  });

  it('tolerates stray braces around a valid ready object', () => {
    expect(parseRemoteDebugAdapterReadyPort('} {"event":"ready","port":7777} {'))
      .toBe(7777);
  });

  it('skips braces inside strings and honours escaped characters', () => {
    expect(parseRemoteDebugAdapterReadyPort('{"event":"ready","note":"{not an object}","port":3333}'))
      .toBe(3333);
    expect(parseRemoteDebugAdapterReadyPort('{"event":"ready","note":"a\\\\b","port":4444}'))
      .toBe(4444);
  });
});
