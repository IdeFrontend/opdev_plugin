/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * build-service flows: error mapping, user-stop cancels, env construction and
 * the standard-custom deploy paths that `build-service-de-id.spec.ts` does not
 * reach. Keeps the same mock wiring as that spec and adds the remaining
 * branches of every public entry point.
 *
 * Covered here:
 *  - isRootStandardCustom (no folder / detect failure / non-standard type)
 *  - tryMarkOperatorsAsCompiled edges (empty names, array names, op without
 *    path, unknown project, detection failure, store failure)
 *  - startBuild error paths (unsupported type, failed compile, user stop,
 *    command generation throw)
 *  - startRun failure mapping (qemu segfault, pyasc runtime lib, generic),
 *    active-file pick cancel, success
 *  - startBuildExample (warning on missing example source, failure, cancel)
 *  - startSimulate / startOnBoard: guard chain, triton probe failure,
 *    active-file target actions, build/example/deploy failure mapping,
 *    success + panel flash; standard-custom example+deploy chain with the
 *    simulator `--soc=` compile option
 *  - startDumpTensor: temp dir lifecycle, env-exports prefix, remote
 *    transformers, show_kernel_debug_data non-blocking failure, results-tree
 *    refresh
 *  - startUtTest failure mapping and cancel
 *  - captureActiveFileTargetForOptionsPanel / ensurePythonDeployTarget actions
 *  - importDumpTensorBinFile (copy, stale temp cleanup, copy failure)
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

// jest.spyOn cannot redefine Node fs module properties in this environment, so
// rmSync is wrapped in a pass-through jest.fn (everything else stays real).
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');

  return {
    ...actual,
    rmSync: jest.fn(actual.rmSync),
  };
});

import {
  COMMAND_FLASH_DUMP_TENSOR_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
} from '@plugin/constants';

jest.mock('i18next', () => ({
  t: (key: string, options?: { projectType?: string }) => (
    options?.projectType !== undefined ? `${key}:${options.projectType}` : key
  ),
}));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/operator-command-executor', () => ({
  buildOperatorSpawnContext: jest.fn(),
  executeOperatorCommand: jest.fn(async (command: string, _spawnCtx: unknown, opts: { transformCommand?: (c: string)=> Promise<string> | string } = {}) => {
    if (opts.transformCommand) {
      await opts.transformCommand(String(command));
    }

    return {
      code: 0,
      output: '',
      interruptedByUserStop: false,
    };
  }),
  commandFailureMessage: jest.fn((_result: unknown, key: string) => key),
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    writeBuildOpDeployTarget: jest.fn(),
    readOpDevtoolsSetting: jest.fn(),
    getBuildOpConfig: jest.fn(() => ({
      script: 'bash build.sh',
      cpuDebugScript: '',
      npuDebugScript: '',
      targetFile: null,
    })),
  },
}));

jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: { getProjectType: jest.fn(() => Promise.resolve({ projectType: 'ascend' })) } }));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({
  OperatorPluginRegistry: {
    isProjectTypeSupported: jest.fn(() => true),
    getOpPlugin: jest.fn(() => ({
      buildBehavior: {
        requiresActiveFileCheck: false,
        requiresBuildBeforeAnalysis: false,
        supportsSimulate: false,
        supportsOnBoard: false,
        activeFileExtension: null,
      },
      opType: 'cann',
    })),
    detectProject: jest.fn(() => Promise.resolve({ projectType: 'standard-custom' })),
  },
}));

jest.mock('@plugin/domain/services/operator-project-detector', () => ({ OperatorProjectType: { STANDARD_CUSTOM: 'standard-custom' } }));

jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/domain', () => ({
  getBuildOpCommand: jest.fn(),
  getBuildExampleCommand: jest.fn(),
  getSimulateCommand: jest.fn(),
  getOnBoardCommand: jest.fn(),
  getRunCommand: jest.fn(),
  getUtTestCommand: jest.fn(),
  getStandardCustomDeployTail: jest.fn(() => ''),
  resolveExampleModeForBaseContext: jest.fn(() => ({
    mode: 'eager',
    exampleFound: true,
    opName: 'AddCustom',
  })),
  resolveBuildOpBaseContext: jest.fn((projectPath: string) => ({
    projectPath,
    configType: 'build_op',
    op: '',
  })),
  resolveBuildExampleBaseContext: jest.fn((projectPath: string) => ({
    projectPath,
    configType: 'build_example',
    op: '',
  })),
  resolveSimulateBaseContext: jest.fn((projectPath: string) => ({
    projectPath,
    configType: 'simulate',
    op: '',
  })),
  resolveOnBoardBaseContext: jest.fn((projectPath: string) => ({
    projectPath,
    configType: 'on_board',
    op: '',
  })),
  resolveUtTestBaseContext: jest.fn((projectPath: string) => ({
    projectPath,
    configType: 'ut_test',
    op: '',
  })),
}));

jest.mock('@plugin/domain/services/command-strategy/triton-strategy', () => ({ probeTritonPythonDependencies: jest.fn(() => Promise.resolve({ ok: true })) }));

jest.mock('@plugin/domain/services/command-strategy/python-operator-strategy-shared', () => ({
  buildPythonDeployTarget: jest.fn((relativePath: string) => relativePath),
  quoteShellTokenIfNeeded: jest.fn((token: string) => token),
}));

jest.mock('@plugin/helpers/python-operator-editor-context', () => ({ resolveOrPickPythonOperatorUri: jest.fn() }));

jest.mock('@plugin/helpers/sidebar-context-refresh', () => ({ requestSidebarContextsRefresh: jest.fn(() => Promise.resolve()) }));

jest.mock('@plugin/helpers/sync-sanitizer-python-target', () => ({ decidePythonTargetAction: jest.fn() }));

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveAscendEnv: jest.fn(() => ({ socVersion: 'Ascend910B3' })) }));

jest.mock('@plugin/helpers/remote-command', () => ({
  createRemoteCommandWhenNoNpuTransformer: jest.fn((buildRemoteCommand: (command: string)=> string, shouldRunRemotely?: (command: string)=> boolean) => (
    async (command: string) => {
      if (shouldRunRemotely && !shouldRunRemotely(command)) {
        return command;
      }

      return buildRemoteCommand(command);
    }
  )),
  buildRemoteBuildExampleCommand: jest.fn(),
  buildRemoteExecCommand: jest.fn(),
  buildRemoteOnBoardCommand: jest.fn(),
  buildRemoteDumpTensorCommand: jest.fn((command: string) => `(remote-dump) ${command}`),
  resolveRemotePullDir: jest.fn((_root: string | undefined, outputDir: string) => `remote-pull/${outputDir}/`),
}));

import {
  getProjectByPath,
  normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import {
  getBuildOpCommand,
  getBuildExampleCommand,
  getRunCommand,
  getSimulateCommand,
  getOnBoardCommand,
  getUtTestCommand,
  getStandardCustomDeployTail,
  resolveExampleModeForBaseContext,
} from '@plugin/domain';
import {
  buildOperatorSpawnContext,
  executeOperatorCommand,
  commandFailureMessage,
} from '@plugin/service/operator-command-executor';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { homeMethods } from '@plugin/controller/home-controller';
import { resolveOrPickPythonOperatorUri } from '@plugin/helpers/python-operator-editor-context';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import { decidePythonTargetAction } from '@plugin/helpers/sync-sanitizer-python-target';
import { resolveAscendEnv } from '@plugin/domain/utils/ascend-util';
import { probeTritonPythonDependencies } from '@plugin/domain/services/command-strategy/triton-strategy';
import { buildPythonDeployTarget } from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import {
  buildRemoteBuildExampleCommand,
  buildRemoteExecCommand,
  buildRemoteOnBoardCommand,
  buildRemoteDumpTensorCommand,
} from '@plugin/helpers/remote-command';
import {
  readWorkspaceCache,
  updateFolderScanState,
} from '@plugin/helpers/workspace-cache';
import {
  buildService,
  isRootStandardCustom,
  notifyBuildSucceededForSidebar,
} from '@plugin/service/build-service';

type Behavior = {
  requiresActiveFileCheck: boolean;
  requiresBuildBeforeAnalysis: boolean;
  supportsSimulate: boolean;
  supportsOnBoard: boolean;
  activeFileExtension: string | null;
};

const DEFAULT_BEHAVIOR: Behavior = {
  requiresActiveFileCheck: false,
  requiresBuildBeforeAnalysis: false,
  supportsSimulate: false,
  supportsOnBoard: false,
  activeFileExtension: null,
};

function setPluginBehavior(behavior: Partial<Behavior>, opType = 'cann'): void {
  (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue({
    buildBehavior: {
      ...DEFAULT_BEHAVIOR,
      ...behavior,
    },
    opType,
  });
}

function setExecSequence(results: Array<Partial<{ code: number;
  output: string;
  interruptedByUserStop: boolean }>>): void {
  const execMock = executeOperatorCommand as jest.Mock;

  for (const result of results) {
    execMock.mockResolvedValueOnce({
      code: 0,
      output: '',
      interruptedByUserStop: false,
      ...result,
    });
  }
}

describe('build-service flows', () => {
  let root: string;
  let executorExecute: jest.Mock;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-flows-'));
    jest.clearAllMocks();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: root } } as vscode.WorkspaceFolder];
    vscode.workspace.getConfiguration.mockReturnValue({
      inspect: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
    });
    vscode.window.activeTextEditor = undefined;
    executorExecute = jest.fn(async () => ({
      code: 0,
      output: '',
    }));
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ getExecutor: () => ({ execute: executorExecute }) });
    (getProjectByPath as jest.Mock).mockReturnValue({
      id: 7,
      project_name: 'demo',
      project_path: root,
      project_type: 'ascend',
    });
    (getBuildOpCommand as jest.Mock).mockReturnValue('build-op-cmd');
    (getRunCommand as jest.Mock).mockReturnValue('run-cmd');
    (getUtTestCommand as jest.Mock).mockReturnValue('ut-cmd');
    (getBuildExampleCommand as jest.Mock).mockReturnValue('example-cmd');
    (getSimulateCommand as jest.Mock).mockReturnValue('simulate-cmd');
    (getOnBoardCommand as jest.Mock).mockReturnValue('onboard-cmd');
    (getStandardCustomDeployTail as jest.Mock).mockReturnValue('');
    // clearAllMocks does NOT clear mockReturnValue/mockResolvedValue overrides,
    // so every default a test may have replaced is re-asserted here.
    (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock).mockReturnValue(true);
    (OperatorPluginRegistry.detectProject as jest.Mock).mockResolvedValue({ projectType: 'standard-custom' });
    setPluginBehavior();
    (homeMethods.getProjectType as jest.Mock).mockResolvedValue({ projectType: 'ascend' });
    (probeTritonPythonDependencies as jest.Mock).mockResolvedValue({ ok: true });
    (resolveOrPickPythonOperatorUri as jest.Mock).mockResolvedValue(undefined);
    (decidePythonTargetAction as jest.Mock).mockReturnValue(undefined);
    (resolveExampleModeForBaseContext as jest.Mock).mockReturnValue({
      mode: 'eager',
      exampleFound: true,
      opName: 'AddCustom',
    });
    (ConfigService.readOpDevtoolsSetting as jest.Mock).mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  describe('isRootStandardCustom', () => {
    it('returns false when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      await expect(isRootStandardCustom())
        .resolves
        .toBe(false);
      expect(OperatorPluginRegistry.detectProject)
        .not.toHaveBeenCalled();
    });

    it('returns true for a standard-custom root', async () => {
      await expect(isRootStandardCustom())
        .resolves
        .toBe(true);
      expect(OperatorPluginRegistry.detectProject)
        .toHaveBeenCalledWith(root);
    });

    it('returns false when the root is a different project type', async () => {
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });

      await expect(isRootStandardCustom())
        .resolves
        .toBe(false);
    });

    it('returns false when project detection fails', async () => {
      const warn = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockRejectedValue(new Error('detect failed'));

      await expect(isRootStandardCustom())
        .resolves
        .toBe(false);
      expect(warn)
        .toHaveBeenCalled();
    });
  });

  describe('notifyBuildSucceededForSidebar (compiled marking edges)', () => {
    it('does not touch the cache when no operator names are given', async () => {
      await notifyBuildSucceededForSidebar(root, undefined);
      await notifyBuildSucceededForSidebar(root, '  ,  ');

      expect(readWorkspaceCache(root).project)
        .toBeUndefined();
      expect(requestSidebarContextsRefresh)
        .toHaveBeenCalledTimes(2);
    });

    it('marks each name of an array and skips ops without a path', async () => {
      const withPath = path.join(root, 'AddA');
      const withoutPath = path.join(root, 'AddB');

      await updateFolderScanState(root, {
        opsMeet: [],
        opsList: [
          {
            name: 'AddA',
            path: withPath,
          },
          { name: 'NoPath' } as never,
        ],
        experimentalOpsList: [
          {
            name: 'AddB',
            path: withoutPath,
          },
        ],
      });

      await notifyBuildSucceededForSidebar(root, [
        'AddA',
        'AddB',
        'Missing',
      ]);

      const compiled = readWorkspaceCache(root).project?.compiledOpPaths ?? {};

      expect(compiled[withPath])
        .toBe(true);
      expect(compiled[withoutPath])
        .toBe(true);
      expect(Object.keys(compiled))
        .toHaveLength(2);
    });

    it('is a no-op when the project record is missing', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue(null);

      await notifyBuildSucceededForSidebar(root, 'AddCustom');

      expect(readWorkspaceCache(root).project)
        .toBeUndefined();
    });

    it('is a no-op when the project record has no project path', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue({
        id: 7,
        project_name: 'demo',
      });

      await notifyBuildSucceededForSidebar(root, 'AddCustom');

      expect(readWorkspaceCache(root).project)
        .toBeUndefined();
    });

    it('skips marking when project detection fails', async () => {
      const warn = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockRejectedValue(new Error('detect failed'));

      await notifyBuildSucceededForSidebar(root, 'AddCustom');

      expect(readWorkspaceCache(root).project)
        .toBeUndefined();
      expect(warn)
        .toHaveBeenCalled();
    });

    it('skips marking for a non-standard-custom project', async () => {
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });

      await notifyBuildSucceededForSidebar(root, 'AddCustom');

      expect(readWorkspaceCache(root).project)
        .toBeUndefined();
    });

    it('swallows a failing project store read', async () => {
      const warn = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      (getProjectByPath as jest.Mock).mockImplementation(() => {
        throw new Error('store read failed');
      });

      await notifyBuildSucceededForSidebar(root, 'AddCustom');

      expect(warn)
        .toHaveBeenCalled();
    });

    it('marks the operator under the canonical normalized key', async () => {
      const opPath = path.join(root, 'Sub', 'Add');

      await updateFolderScanState(root, {
        opsMeet: [],
        opsList: [
          {
            name: 'Add',
            path: opPath,
          },
        ],
        experimentalOpsList: [],
      });

      await notifyBuildSucceededForSidebar(root, 'Add');

      const cacheKey = Object.keys(readWorkspaceCache(root).folders ?? {})[0];

      expect(cacheKey)
        .toBe(normalizeProjectPath(root));
    });
  });

  describe('startBuild error mapping', () => {
    it('returns false and notifies when the project type is unsupported', async () => {
      (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
        .mockReturnValue(false);

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(false);
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('extension.unsupportedProjectTypeDisabled:ascend');
      expect(getBuildOpCommand)
        .not.toHaveBeenCalled();
    });

    it('cascades to live detection when no project record and no workspace setting exist', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue(undefined);

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(homeMethods.getProjectType)
        .toHaveBeenCalled();
      expect(result)
        .toBe(false);
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.noBuildConfig');
    });

    it('reports the project type as unknown when every source yields nothing', async () => {
      (getProjectByPath as jest.Mock).mockReturnValue(undefined);
      (homeMethods.getProjectType as jest.Mock)
        .mockResolvedValue({ projectType: '' });
      (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
        .mockReturnValue(false);

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(false);
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('extension.unsupportedProjectTypeDisabled:unknown');
    });

    it('returns false without a message when the user stops the build', async () => {
      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce({
          code: 1,
          output: '',
          interruptedByUserStop: true,
        });

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(false);
      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('maps a failed compile to build.compileFailed', async () => {
      const failure = {
        code: 1,
        output: 'boom',
        interruptedByUserStop: false,
      };

      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce(failure);

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(false);
      expect(commandFailureMessage)
        .toHaveBeenCalledWith(failure, 'build.compileFailed', { output: 'boom' });
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.compileFailed');
    });

    it('notifies build.getCompileCommandFailed when command generation throws', async () => {
      (getBuildOpCommand as jest.Mock)
        .mockImplementation(() => {
          throw new Error('no script');
        });

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(false);
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getCompileCommandFailed');
      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });
  });

  describe('startRun error mapping', () => {
    it('returns early when the project type is unsupported', async () => {
      (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
        .mockReturnValue(false);

      await buildService.startRun({});

      expect(getRunCommand)
        .not.toHaveBeenCalled();
    });

    it('warns when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      await buildService.startRun({});

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('build.workspacePathNotFound');
      expect(getRunCommand)
        .not.toHaveBeenCalled();
    });

    it('warns build.openPyFirst when no .py can be picked', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
      });
      (resolveOrPickPythonOperatorUri as jest.Mock)
        .mockResolvedValue(undefined);

      await buildService.startRun({});

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('build.openPyFirst');
      expect(getRunCommand)
        .not.toHaveBeenCalled();
    });

    it('skips the active-file check when filePath is already given', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
      });

      await buildService.startRun({ filePath: 'ops/AddCustom/op.py' });

      expect(resolveOrPickPythonOperatorUri)
        .not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.runSuccess');
    });

    it('reports a successful run and transforms the command for remote exec', async () => {
      await buildService.startRun({});

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.runSuccess');
      expect(buildRemoteExecCommand)
        .toHaveBeenCalledWith('run-cmd');
    });

    it('returns silently when the user stops the run', async () => {
      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce({
          code: 1,
          output: '',
          interruptedByUserStop: true,
        });

      await buildService.startRun({});

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('maps a qemu segfault output to build.runFailedQemuSegfault', async () => {
      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce({
          code: 1,
          output: 'qemu: uncaught target signal 11 (Segmentation fault)',
          interruptedByUserStop: false,
        });

      await buildService.startRun({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.runFailedQemuSegfault');
    });

    it('maps a qemu core dump output to build.runFailedQemuSegfault', async () => {
      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce({
          code: 1,
          output: 'qemu: core dumped',
          interruptedByUserStop: false,
        });

      await buildService.startRun({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.runFailedQemuSegfault');
    });

    it('maps a missing runtime_camodel library to build.runFailedPyascRuntime for pyasc', async () => {
      setPluginBehavior({}, 'pyasc');
      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce({
          code: 1,
          output: 'ld: cannot find -lruntime_camodel',
          interruptedByUserStop: false,
        });

      await buildService.startRun({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.runFailedPyascRuntime');
    });

    it('maps any other failure to build.runFailed', async () => {
      const failure = {
        code: 1,
        output: 'make: error 2',
        interruptedByUserStop: false,
      };

      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce(failure);

      await buildService.startRun({});

      expect(commandFailureMessage)
        .toHaveBeenCalledWith(failure, 'build.runFailed', { output: 'make: error 2' });
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.runFailed');
    });

    it('notifies build.getRunCommandFailed when command generation throws', async () => {
      (getRunCommand as jest.Mock)
        .mockImplementation(() => {
          throw new Error('no run script');
        });

      await buildService.startRun({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getRunCommandFailed');
    });
  });

  describe('startBuildExample', () => {
    it('returns early when the project type is unsupported', async () => {
      (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
        .mockReturnValue(false);

      await buildService.startBuildExample({ operatorNames: 'AddCustom' });

      expect(getBuildExampleCommand)
        .not.toHaveBeenCalled();
    });

    it('warns when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      await buildService.startBuildExample({ operatorNames: 'AddCustom' });

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('build.workspacePathNotFound');
      expect(getBuildExampleCommand)
        .not.toHaveBeenCalled();
    });

    it('warns up front when the operator ships no example for the resolved mode', async () => {
      (resolveExampleModeForBaseContext as jest.Mock)
        .mockReturnValue({
          mode: 'eager',
          exampleFound: false,
          opName: 'AddCustom',
        });

      await buildService.startBuildExample({ operatorNames: 'AddCustom' });

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
      expect(getBuildExampleCommand)
        .toHaveBeenCalledWith(
          {
            projectPath: root,
            configType: 'build_example',
            op: '',
          },
          undefined,
          'AddCustom',
          'eager',
        );
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.executeSuccess');
    });

    it('reports success and builds the remote example command transformer', async () => {
      await buildService.startBuildExample({ operatorNames: 'AddCustom' });

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.executeSuccess');
      expect(buildRemoteBuildExampleCommand)
        .toHaveBeenCalledWith('example-cmd', root);
    });

    it('returns silently when the user stops the example build', async () => {
      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce({
          code: 1,
          output: '',
          interruptedByUserStop: true,
        });

      await buildService.startBuildExample({ operatorNames: 'AddCustom' });

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('maps a failed example build to build.executeFailed', async () => {
      const failure = {
        code: 1,
        output: 'boom',
        interruptedByUserStop: false,
      };

      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce(failure);

      await buildService.startBuildExample({ operatorNames: 'AddCustom' });

      expect(commandFailureMessage)
        .toHaveBeenCalledWith(failure, 'build.executeFailed', { output: '' });
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.executeFailed');
    });

    it('notifies build.getExecuteCommandFailed when command generation throws', async () => {
      (getBuildExampleCommand as jest.Mock)
        .mockImplementation(() => {
          throw new Error('no example script');
        });

      await buildService.startBuildExample({ operatorNames: 'AddCustom' });

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getExecuteCommandFailed');
    });
  });

  describe('captureActiveFileTargetForOptionsPanel', () => {
    it('returns true when the plugin needs no active-file check', async () => {
      await expect(buildService.captureActiveFileTargetForOptionsPanel())
        .resolves
        .toBe(true);
      expect(decidePythonTargetAction)
        .not.toHaveBeenCalled();
    });

    it('reuses the captured target when no matching file is focused', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
      });
      (decidePythonTargetAction as jest.Mock)
        .mockReturnValue('use-existing');

      await expect(buildService.captureActiveFileTargetForOptionsPanel())
        .resolves
        .toBe(true);
      expect(ConfigService.writeBuildOpDeployTarget)
        .not.toHaveBeenCalled();
    });

    it('warns build.openPyFirst when no target exists and nothing is focused', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
      });
      (decidePythonTargetAction as jest.Mock)
        .mockReturnValue('no-target');

      await expect(buildService.captureActiveFileTargetForOptionsPanel())
        .resolves
        .toBe(false);
      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('build.openPyFirst');
    });

    it('warns build.workspacePathNotFound when the folder is gone mid-flow', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
      });
      (decidePythonTargetAction as jest.Mock)
        .mockReturnValue('sync-from-active');
      vscode.workspace.workspaceFolders = undefined;

      await expect(buildService.captureActiveFileTargetForOptionsPanel())
        .resolves
        .toBe(false);
      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('build.workspacePathNotFound');
    });

    it('writes the deploy target captured from the focused .py', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
      });
      (decidePythonTargetAction as jest.Mock)
        .mockReturnValue('sync-from-active');
      const filePath = path.join(root, 'ops', 'AddCustom', 'op.py');

      vscode.window.activeTextEditor = {
        document: {
          fileName: filePath,
          uri: { fsPath: filePath },
        },
      };

      await expect(buildService.captureActiveFileTargetForOptionsPanel())
        .resolves
        .toBe(true);

      const relativePath = path.relative(root, filePath)
        .replace(/\\/g, '/');

      expect(ConfigService.writeBuildOpDeployTarget)
        .toHaveBeenCalledWith(relativePath);
      expect(buildPythonDeployTarget)
        .toHaveBeenCalledWith(relativePath);
    });

    it('skips the deploy write when the workspace is not a recognized project', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
      });
      (decidePythonTargetAction as jest.Mock)
        .mockReturnValue('sync-from-active');
      (getProjectByPath as jest.Mock)
        .mockReturnValue(undefined);
      const filePath = path.join(root, 'op.py');

      vscode.window.activeTextEditor = {
        document: {
          fileName: filePath,
          uri: { fsPath: filePath },
        },
      };

      await expect(buildService.captureActiveFileTargetForOptionsPanel())
        .resolves
        .toBe(true);
      expect(ConfigService.writeBuildOpDeployTarget)
        .not.toHaveBeenCalled();
    });
  });

  describe('startSimulate', () => {
    it('returns early when the project type is unsupported', async () => {
      (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
        .mockReturnValue(false);

      await buildService.startSimulate({});

      expect(getSimulateCommand)
        .not.toHaveBeenCalled();
    });

    it('warns when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      await buildService.startSimulate({});

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('build.workspacePathNotFound');
    });

    it('returns without running when the plugin does not support simulate', async () => {
      await buildService.startSimulate({});

      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('probes triton dependencies and aborts with an error message when they are missing', async () => {
      setPluginBehavior({ supportsSimulate: true }, 'triton');
      (probeTritonPythonDependencies as jest.Mock)
        .mockResolvedValue({
          ok: false,
          interpreter: '/py',
          stderr: 'no torch',
        });

      await buildService.startSimulate({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('sanitizer.tritonDepsFailed');
      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('proceeds when the triton dependency probe succeeds', async () => {
      setPluginBehavior({ supportsSimulate: true }, 'triton');
      (probeTritonPythonDependencies as jest.Mock)
        .mockResolvedValue({
          ok: true,
          interpreter: '/py',
          stderr: '',
        });

      await buildService.startSimulate({});

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.simulationSuccess');
    });

    it('throws task.openPyFirst when the active-file target cannot be captured', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
        supportsSimulate: true,
      });
      (decidePythonTargetAction as jest.Mock)
        .mockReturnValue('no-target');

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('task.openPyFirst');
      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('captures the active file and runs when no operator names are given', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
        supportsSimulate: true,
      });
      (decidePythonTargetAction as jest.Mock)
        .mockReturnValue('sync-from-active');
      const filePath = path.join(root, 'op.py');

      vscode.window.activeTextEditor = {
        document: {
          fileName: filePath,
          uri: { fsPath: filePath },
        },
      };

      await buildService.startSimulate({});

      expect(ConfigService.writeBuildOpDeployTarget)
        .toHaveBeenCalledTimes(1);
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.simulationSuccess');
    });

    it('skips the active-file check when operator names are provided', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
        supportsSimulate: true,
      });

      await buildService.startSimulate({ operatorNames: 'AddCustom' });

      expect(decidePythonTargetAction)
        .not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.simulationSuccess');
    });

    it('throws when the pre-build is interrupted by the user', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsSimulate: true,
      });
      setExecSequence([
        {
          code: 1,
          interruptedByUserStop: true,
        },
      ]);

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('SOC configuration interrupted by user');
    });

    it('maps a failed pre-build to compileFailed and rethrows compileFailedThrow', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsSimulate: true,
      });
      setExecSequence([
        {
          code: 1,
          output: 'boom',
        },
      ]);

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('build.compileFailedThrow');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.compileFailed');
    });

    it('builds, deploys the run package and flashes performance data on success (standard-custom)', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsSimulate: true,
      });
      (getStandardCustomDeployTail as jest.Mock).mockReturnValueOnce('deploy-tail');

      await buildService.startSimulate({});

      const execMock = executeOperatorCommand as jest.Mock;

      expect(execMock)
        .toHaveBeenCalledTimes(3);
      expect(execMock.mock.calls[0][0])
        .toBe('build-op-cmd && deploy-tail');
      expect(resolveAscendEnv)
        .toHaveBeenCalledWith({ isSimulator: true });
      expect(getBuildExampleCommand)
        .toHaveBeenCalledWith(
          {
            projectPath: root,
            configType: 'build_example',
            op: '',
          },
          '--simulator --soc=Ascend910B3',
          undefined,
          undefined,
          true,
        );
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.simulationSuccess');
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(COMMAND_FLASH_PERFORMANCE_RUN_DATA, {
          focusIfNew: true,
          openIfNew: true,
        });
    });

    it('passes the caller compileOption through to the example build unchanged', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsSimulate: true,
      });

      await buildService.startSimulate({ compileOption: '--fast' });

      // buildSimulateExampleCompileOption is still evaluated (its result is only
      // discarded by the `??`), so resolveAscendEnv runs — the compile option
      // passed to the builder is the caller's.
      expect(resolveAscendEnv)
        .toHaveBeenCalledWith({ isSimulator: true });
      expect(getBuildExampleCommand)
        .toHaveBeenCalledWith(
          expect.any(Object),
          '--fast',
          undefined,
          undefined,
          true,
        );
    });

    it('throws when the example build fails after a successful operator build', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsSimulate: true,
      });
      setExecSequence([
        { code: 0 },
        {
          code: 1,
          output: 'example boom',
        },
      ]);

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('build.executeFailedThrow');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.executeFailed');
    });

    it('throws when the deploy of the run package is interrupted by the user', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsSimulate: true,
      });
      setExecSequence([
        { code: 0 },
        { code: 0 },
        {
          code: 1,
          interruptedByUserStop: true,
        },
      ]);

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('SOC configuration interrupted by user');
    });

    it('surfaces a deploy-phase failure through the combined compile+deploy command', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsSimulate: true,
      });
      setExecSequence([
        {
          code: 1,
          output: 'deploy boom',
        },
      ]);

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('build.compileFailedThrow');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.compileFailed');
    });

    it('skips the example+deploy chain when the root is not standard-custom', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsSimulate: true,
      });
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });

      await buildService.startSimulate({});

      expect(executeOperatorCommand)
        .toHaveBeenCalledTimes(2);
      expect(getStandardCustomDeployTail)
        .not.toHaveBeenCalled();
    });

    it('throws simulationFailedThrow and notifies when the simulate command fails', async () => {
      setPluginBehavior({ supportsSimulate: true });
      setExecSequence([
        {
          code: 1,
          output: 'sim boom',
        },
      ]);

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('build.simulationFailedThrow');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.simulationFailed');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getSimulationCommandFailed');
    });

    it('throws when the simulate command is interrupted by the user', async () => {
      setPluginBehavior({ supportsSimulate: true });
      setExecSequence([
        {
          code: 1,
          interruptedByUserStop: true,
        },
      ]);

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('SOC configuration interrupted by user');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getSimulationCommandFailed');
    });

    it('notifies build.getSimulationCommandFailed and rethrows when command generation throws', async () => {
      setPluginBehavior({ supportsSimulate: true });
      (getSimulateCommand as jest.Mock)
        .mockImplementation(() => {
          throw new Error('no simulate script');
        });

      await expect(buildService.startSimulate({}))
        .rejects
        .toThrow('no simulate script');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getSimulationCommandFailed');
    });
  });

  describe('startOnBoard', () => {
    it('returns early when the project type is unsupported', async () => {
      (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
        .mockReturnValue(false);

      await buildService.startOnBoard({});

      expect(getOnBoardCommand)
        .not.toHaveBeenCalled();
    });

    it('warns when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      await buildService.startOnBoard({});

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('build.workspacePathNotFound');
    });

    it('returns without running when the plugin does not support on-board', async () => {
      await buildService.startOnBoard({});

      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('returns when triton dependencies are missing', async () => {
      setPluginBehavior({ supportsOnBoard: true }, 'triton');
      (probeTritonPythonDependencies as jest.Mock)
        .mockResolvedValue({
          ok: false,
          interpreter: '/py',
          stderr: 'no torch',
        });

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('sanitizer.tritonDepsFailed');
      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('returns (does not throw) when the active-file target cannot be captured', async () => {
      setPluginBehavior({
        requiresActiveFileCheck: true,
        activeFileExtension: '.py',
        supportsOnBoard: true,
      });
      (decidePythonTargetAction as jest.Mock)
        .mockReturnValue('no-target');

      await buildService.startOnBoard({});

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('build.openPyFirst');
      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('maps a failed pre-build to compileFailed and returns', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      setExecSequence([
        {
          code: 1,
          output: 'boom',
        },
      ]);

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.compileFailed');
      expect(getOnBoardCommand)
        .not.toHaveBeenCalled();
    });

    it('builds, deploys the run package and flashes performance data on success (standard-custom)', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      (getStandardCustomDeployTail as jest.Mock).mockReturnValueOnce('deploy-tail');

      await buildService.startOnBoard({});

      const execMock = executeOperatorCommand as jest.Mock;

      expect(execMock)
        .toHaveBeenCalledTimes(3);
      // The .run deploy tail (with --force) is embedded in the compile command,
      // so the operator is deployed before the example build runs.
      expect(execMock.mock.calls[0][0])
        .toBe('build-op-cmd && deploy-tail');
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.onBoardSuccess');
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(COMMAND_FLASH_PERFORMANCE_RUN_DATA, {
          focusIfNew: true,
          openIfNew: true,
        });
    });

    it('returns silently when the example build is interrupted by the user', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      setExecSequence([
        { code: 0 },
        {
          code: 1,
          interruptedByUserStop: true,
        },
      ]);

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
      expect(getOnBoardCommand)
        .not.toHaveBeenCalled();
    });

    it('maps a failed example build to executeFailed and returns', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      setExecSequence([
        { code: 0 },
        {
          code: 1,
          output: 'example boom',
        },
      ]);

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.executeFailed');
      expect(getOnBoardCommand)
        .not.toHaveBeenCalled();
    });

    it('returns silently when the on-board command is interrupted', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      setExecSequence([
        { code: 0 },
        { code: 0 },
        {
          code: 1,
          interruptedByUserStop: true,
        },
      ]);

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('maps a failed compile+deploy command to compileFailed and returns', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      setExecSequence([
        {
          code: 1,
          output: 'deploy boom',
        },
      ]);

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.compileFailed');
      expect(getOnBoardCommand)
        .not.toHaveBeenCalled();
    });

    it('runs the on-board command remotely when it is an msprof op command', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      (getOnBoardCommand as jest.Mock)
        .mockReturnValue('msprof op --profiling-target');

      await buildService.startOnBoard({});

      expect(buildRemoteOnBoardCommand)
        .toHaveBeenCalledWith('msprof op --profiling-target', 'remote-pull/opprof/');
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.onBoardSuccess');
    });

    it('keeps a simulator msprof op command local', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      (getOnBoardCommand as jest.Mock)
        .mockReturnValue('msprof op simulator --target');

      await buildService.startOnBoard({});

      expect(buildRemoteOnBoardCommand)
        .not.toHaveBeenCalled();
    });

    it('keeps a non-profiler command local', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });

      await buildService.startOnBoard({});

      expect(buildRemoteOnBoardCommand)
        .not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.onBoardSuccess');
    });

    it('writes the on-board run to its own onboard output channel', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });

      await buildService.startOnBoard({});

      // GC-73: the on-board run no longer shares the 'run' channel.
      expect(buildOperatorSpawnContext)
        .toHaveBeenCalledWith(expect.objectContaining({ toolOutputLabel: 'onboard' }));
      expect(buildOperatorSpawnContext)
        .not.toHaveBeenCalledWith(expect.objectContaining({ toolOutputLabel: 'run' }));
    });

    it('returns silently when the on-board command is interrupted by the user', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      setExecSequence([
        { code: 0 },
        { code: 0 },
        {
          code: 1,
          interruptedByUserStop: true,
        },
      ]);

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('maps a failed on-board command to build.onBoardFailed', async () => {
      setPluginBehavior({
        requiresBuildBeforeAnalysis: true,
        supportsOnBoard: true,
      });
      setExecSequence([
        { code: 0 },
        { code: 0 },
        {
          code: 1,
          output: 'onboard boom',
        },
      ]);

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.onBoardFailed');
    });

    it('notifies build.getOnBoardCommandFailed when command generation throws', async () => {
      setPluginBehavior({ supportsOnBoard: true });
      (getOnBoardCommand as jest.Mock)
        .mockImplementation(() => {
          throw new Error('no onboard script');
        });

      await buildService.startOnBoard({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getOnBoardCommandFailed');
    });
  });

  describe('startDumpTensor', () => {
    it('returns early when the project type is unsupported', async () => {
      (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock)
        .mockReturnValue(false);

      await buildService.startDumpTensor({});

      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('shows an error when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      await buildService.startDumpTensor({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.workspacePathNotFound');
      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('removes the temp data directory left by a previous run', async () => {
      const tempDataPath = path.join(root, '.vscode', 'dump_tensor_temp_data');

      fs.mkdirSync(tempDataPath, { recursive: true });
      fs.writeFileSync(path.join(tempDataPath, 'stale.bin'), 'x');

      await buildService.startDumpTensor({});

      expect(fs.existsSync(tempDataPath))
        .toBe(false);
      expect(executeOperatorCommand)
        .toHaveBeenCalled();
    });

    it('continues when removing the temp data directory fails', async () => {
      const tempDataPath = path.join(root, '.vscode', 'dump_tensor_temp_data');
      const error = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      fs.mkdirSync(tempDataPath, { recursive: true });
      (fs.rmSync as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('rm failed');
        });

      await buildService.startDumpTensor({});

      expect(executeOperatorCommand)
        .toHaveBeenCalled();
      expect(error)
        .toHaveBeenCalled();
    });

    it('maps a failed operator build to compileFailed and returns', async () => {
      setExecSequence([
        {
          code: 1,
          output: 'boom',
        },
      ]);

      await buildService.startDumpTensor({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.compileFailed');
      expect(vscode.window.showInformationMessage)
        .not.toHaveBeenCalled();
    });

    it('builds the example with the ASCEND env exports and refreshes the results tree (standard-custom)', async () => {
      await buildService.startDumpTensor({});

      const execMock = executeOperatorCommand as jest.Mock;
      const [
        buildCommand,
        exampleCommand,
      ] = [
        execMock.mock.calls[0][0],
        execMock.mock.calls[1][0],
      ];

      expect(buildCommand)
        .toBe('build-op-cmd');
      expect(String(exampleCommand))
        .toContain('export ASCEND_GLOBAL_LOG_LEVEL=1');
      expect(String(exampleCommand))
        .toContain('export ASCEND_DUMP_PATH=../.vscode');
      expect(String(exampleCommand))
        .toContain('example-cmd');
      expect(buildOperatorSpawnContext)
        .toHaveBeenCalledWith(expect.objectContaining({
          script: 'example-cmd',
          toolOutputLabel: 'dump tensor',
        }));
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.dumpTensorSuccess');
      // The webview panel is gone: the flow only refreshes the native tree.
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledTimes(1);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(COMMAND_FLASH_DUMP_TENSOR_DATA, { focusIfNew: true });
    });

    it('runs show_kernel_debug_data with the workspace environment script sourced', async () => {
      await buildService.startDumpTensor({});

      const command = executorExecute.mock.calls[0][0] as string;

      expect(command)
        .toContain('. /etc/profile');
      expect(command)
        .toContain('show_kernel_debug_data');
      expect(command)
        .toContain(path.join(root, '.vscode', 'DumpTensor'));
      expect(executorExecute)
        .toHaveBeenCalledWith(expect.any(String), [], [], { toolOutputLabel: 'dump tensor' }, true);
    });

    it('keeps the flow going when show_kernel_debug_data fails', async () => {
      executorExecute.mockResolvedValue({
        code: 1,
        output: 'kernel data failed',
      });

      await buildService.startDumpTensor({});

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.dumpTensorSuccess');
    });

    it('keeps the flow going when show_kernel_debug_data throws', async () => {
      executorExecute.mockRejectedValue(new Error('executor failed'));

      await buildService.startDumpTensor({});

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.dumpTensorSuccess');
    });

    it('keeps the flow going when refreshing the results tree throws', async () => {
      vscode.commands.executeCommand.mockRejectedValueOnce(new Error('refresh failed'));

      await buildService.startDumpTensor({});

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.dumpTensorSuccess');
    });

    it('returns silently when the example build is interrupted by the user', async () => {
      setExecSequence([
        { code: 0 },
        {
          code: 1,
          interruptedByUserStop: true,
        },
      ]);

      await buildService.startDumpTensor({});

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage)
        .not.toHaveBeenCalled();
    });

    it('maps a failed example build to executeFailed and returns', async () => {
      setExecSequence([
        { code: 0 },
        {
          code: 1,
          output: 'example boom',
        },
      ]);

      await buildService.startDumpTensor({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.executeFailed');
      expect(vscode.window.showInformationMessage)
        .not.toHaveBeenCalled();
    });

    it('runs the operator with the env prefix in a non-standard-custom workspace', async () => {
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });

      await buildService.startDumpTensor({});

      const execMock = executeOperatorCommand as jest.Mock;

      expect(execMock)
        .toHaveBeenCalledTimes(2);
      expect(String(execMock.mock.calls[1][0]))
        .toContain('run-cmd');
      expect(String(execMock.mock.calls[1][0]))
        .toContain('ASCEND_DUMP_PATH');
      expect(buildOperatorSpawnContext)
        .toHaveBeenCalledWith(expect.objectContaining({ script: expect.stringContaining('run-cmd') }));
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.dumpTensorSuccess');
    });

    it('returns silently when the run is interrupted by the user', async () => {
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });
      setExecSequence([
        { code: 0 },
        {
          code: 1,
          interruptedByUserStop: true,
        },
      ]);

      await buildService.startDumpTensor({});

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('maps a qemu segfault run output to runFailedQemuSegfault', async () => {
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });
      setExecSequence([
        { code: 0 },
        {
          code: 1,
          output: 'qemu: signal 11',
        },
      ]);

      await buildService.startDumpTensor({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.runFailedQemuSegfault');
    });

    it('maps any other run failure to runFailed', async () => {
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });
      setExecSequence([
        { code: 0 },
        {
          code: 1,
          output: 'make: error',
        },
      ]);

      await buildService.startDumpTensor({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.runFailed');
    });

    it('notifies build.getRunCommandFailed when run command generation throws', async () => {
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });
      (getRunCommand as jest.Mock)
        .mockImplementation(() => {
          throw new Error('no run script');
        });

      await buildService.startDumpTensor({});

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getRunCommandFailed');
    });
  });

  describe('startUtTest failure mapping', () => {
    it('returns silently when the user stops the ut test', async () => {
      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce({
          code: 1,
          output: '',
          interruptedByUserStop: true,
        });

      await buildService.startUtTest({ operatorNames: 'AddCustom' });

      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('maps a failed ut test to build.utTestFailed', async () => {
      const failure = {
        code: 1,
        output: 'assertion failed',
        interruptedByUserStop: false,
      };

      (executeOperatorCommand as jest.Mock)
        .mockResolvedValueOnce(failure);

      await buildService.startUtTest({ operatorNames: 'AddCustom' });

      expect(commandFailureMessage)
        .toHaveBeenCalledWith(failure, 'build.utTestFailed');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.utTestFailed');
    });

    it('reports success', async () => {
      await buildService.startUtTest({ operatorNames: 'AddCustom' });

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.utTestSuccess');
    });

    it('notifies build.getUtTestCommandFailed when command generation throws', async () => {
      (getUtTestCommand as jest.Mock)
        .mockImplementation(() => {
          throw new Error('no ut script');
        });

      await buildService.startUtTest({ operatorNames: 'AddCustom' });

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.getUtTestCommandFailed');
    });
  });

  describe('importDumpTensorBinFile', () => {
    it('shows an error when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      await buildService.importDumpTensorBinFile(path.join(root, 'dump.bin'));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.workspacePathNotFound');
    });

    it('copies the .bin into the temp dir, post-processes and refreshes the results tree', async () => {
      const binFilePath = path.join(root, 'dump.bin');

      fs.writeFileSync(binFilePath, 'bin-data');

      await buildService.importDumpTensorBinFile(binFilePath);

      const tempDataPath = path.join(root, '.vscode', 'dump_tensor_temp_data');

      expect(fs.existsSync(path.join(tempDataPath, 'dump.bin')))
        .toBe(true);
      expect(executorExecute.mock.calls[0][0] as string)
        .toContain('show_kernel_debug_data');
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.importDumpTensorBinSuccess');
      // The webview panel is gone: the flow only refreshes the native tree.
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledTimes(1);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(COMMAND_FLASH_DUMP_TENSOR_DATA, { focusIfNew: true });
    });

    it('continues when removing the stale temp directory fails', async () => {
      const binFilePath = path.join(root, 'dump.bin');
      const tempDataPath = path.join(root, '.vscode', 'dump_tensor_temp_data');
      const error = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      fs.writeFileSync(binFilePath, 'bin-data');
      fs.mkdirSync(tempDataPath, { recursive: true });
      fs.writeFileSync(path.join(tempDataPath, 'stale.bin'), 'old');
      (fs.rmSync as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('rm failed');
        });

      await buildService.importDumpTensorBinFile(binFilePath);

      expect(error)
        .toHaveBeenCalled();
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('build.importDumpTensorBinSuccess');
    });

    it('replaces the stale temp directory before copying', async () => {
      const binFilePath = path.join(root, 'fresh.bin');
      const tempDataPath = path.join(root, '.vscode', 'dump_tensor_temp_data');

      fs.writeFileSync(binFilePath, 'bin-data');
      fs.mkdirSync(tempDataPath, { recursive: true });
      fs.writeFileSync(path.join(tempDataPath, 'stale.bin'), 'old');

      await buildService.importDumpTensorBinFile(binFilePath);

      expect(fs.existsSync(path.join(tempDataPath, 'stale.bin')))
        .toBe(false);
      expect(fs.existsSync(path.join(tempDataPath, 'fresh.bin')))
        .toBe(true);
    });

    it('notifies extension.importDumpTensorBinFailed when the copy fails', async () => {
      // A missing source file makes copyFileSync throw ENOENT — no fs spy needed.
      await buildService.importDumpTensorBinFile(path.join(root, 'missing.bin'));

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('extension.importDumpTensorBinFailed');
      expect(vscode.window.showInformationMessage)
        .not.toHaveBeenCalled();
    });
  });
});
