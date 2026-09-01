import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/operator-command-executor', () => ({
  buildOperatorSpawnContext: jest.fn(),
  executeOperatorCommand: jest.fn(),
  commandFailureMessage: jest.fn(),
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    writeBuildOpDeployTarget: jest.fn(),
    // buildCtx carries no operator input — the command chain
    // resolves it (selection → synthesized root record), never from settings.
    readOpDevtoolsSetting: jest.fn(),
    // startBuild noBuildConfig gate: the build_op script must be non-empty for
    // the command chain to be entered at all.
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
  getStandardCustomDeployCommand: jest.fn(),
  resolveExampleModeForBaseContext: jest.fn(),
  // Shape mocks so the service can hand the resolved context to a builder and
  // the assertions below see the exact section key the service resolved
  // (the op slot stays empty — prod call sites pass no operator name).
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

jest.mock('@plugin/domain/services/command-strategy/python-operator-strategy-shared', () => ({ buildPythonDeployTarget: jest.fn((relativePath: string) => relativePath) }));

jest.mock('@plugin/helpers/python-operator-editor-context', () => ({ resolveOrPickPythonOperatorUri: jest.fn() }));

jest.mock('@plugin/helpers/sidebar-context-refresh', () => ({ requestSidebarContextsRefresh: jest.fn(() => Promise.resolve()) }));

jest.mock('@plugin/helpers/sync-sanitizer-python-target', () => ({ decidePythonTargetAction: jest.fn() }));

jest.mock('@plugin/helpers/remote-command', () => ({
  createRemoteCommandWhenNoNpuTransformer: jest.fn((transformer: (cmd: string)=> string) => transformer),
  buildRemoteBuildExampleCommand: jest.fn(),
  buildRemoteExecCommand: jest.fn(),
  buildRemoteOnBoardCommand: jest.fn(),
  buildRemoteDumpTensorCommand: jest.fn(),
}));

import {
  getProjectByPath, normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import {
  getBuildOpCommand,
  getBuildExampleCommand,
  getRunCommand,
  getSimulateCommand,
  getOnBoardCommand,
  getUtTestCommand,
  getStandardCustomDeployCommand,
} from '@plugin/domain';
import {
  buildOperatorSpawnContext,
  executeOperatorCommand,
} from '@plugin/service/operator-command-executor';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { homeMethods } from '@plugin/controller/home-controller';
import { resolveOrPickPythonOperatorUri } from '@plugin/helpers/python-operator-editor-context';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import { buildPythonDeployTarget } from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import {
  readWorkspaceCache,
  updateFolderScanState,
} from '@plugin/helpers/workspace-cache';
import { buildService } from '@plugin/service/build-service';
import type {
  CreateOpsParams,
  StartBuildParams,
  StartRunParams,
  StartUtTestParams,
} from '@shared/api-types';

describe('build-service de-id', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-deid-'));
    jest.clearAllMocks();
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: root } } as vscode.WorkspaceFolder];
    vscode.workspace.getConfiguration.mockReturnValue({
      inspect: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
    });
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
    (getStandardCustomDeployCommand as jest.Mock).mockReturnValue('deploy-cmd');
    (executeOperatorCommand as jest.Mock).mockResolvedValue({
      code: 0,
      output: '',
    });
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  describe('startBuild (id-free)', () => {
    it('resolves the project from the workspace root and builds ctx without operator input', async () => {
      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(true);
      expect(getProjectByPath)
        .toHaveBeenCalledWith(root);
      expect(ConfigService.readOpDevtoolsSetting)
        .not.toHaveBeenCalled();
      expect(getBuildOpCommand)
        .toHaveBeenCalledWith(
          {
            projectPath: root,
            configType: 'build_op',
            op: '',
          },
          undefined,
          'AddCustom',
          undefined,
        );
      expect(buildOperatorSpawnContext)
        .toHaveBeenCalledWith({
          baseContext: {
            projectPath: root,
            configType: 'build_op',
            op: '',
          },
          projectPath: root,
          operatorNames: 'AddCustom',
          scriptField: undefined,
          script: 'build-op-cmd',
          toolOutputLabel: 'compile',
        });
    });

    it('propagates the passed compileOption and scriptField to the builder and spawn context', async () => {
      await buildService.startBuild({
        compileOption: '--fast',
        operatorNames: 'AddCustom',
        scriptField: 'script_field',
      });

      expect(getBuildOpCommand)
        .toHaveBeenCalledWith(
          {
            projectPath: root,
            configType: 'build_op',
            op: '',
          },
          '--fast',
          'AddCustom',
          'script_field',
        );
      expect(buildOperatorSpawnContext)
        .toHaveBeenCalledWith(expect.objectContaining({ scriptField: 'script_field' }));
    });

    it('falls back to the project_type DB record when the workspace setting is unset (cascade)', async () => {
      await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(OperatorPluginRegistry.isProjectTypeSupported)
        .toHaveBeenCalledWith('ascend');
      expect(vscode.window.showErrorMessage)
        .not.toHaveBeenCalled();
    });

    it('prefers the workspace projectType setting over the DB record', async () => {
      vscode.workspace.getConfiguration.mockReturnValue({
        inspect: jest.fn(() => ({ workspaceFolderValue: 'triton' })),
        get: jest.fn(),
        update: jest.fn(),
      });

      await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(OperatorPluginRegistry.isProjectTypeSupported)
        .toHaveBeenCalledWith('triton');
    });

    it('returns false and does not build when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(false);
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalled();
      expect(getBuildOpCommand)
        .not.toHaveBeenCalled();
    });

    it('shows exactly build.noBuildConfig and builds nothing in an unrecognized workspace', async () => {
      // The twin of the `getBuildConfigId()` gate — no build_op row (or an
      // empty compile script) → `build.noBuildConfig`, command never built.
      (getProjectByPath as jest.Mock).mockReturnValue(undefined);

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(false);
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.noBuildConfig');
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledTimes(1);
      expect(getBuildOpCommand)
        .not.toHaveBeenCalled();
      expect(executeOperatorCommand)
        .not.toHaveBeenCalled();
    });

    it('shows build.noBuildConfig when the build_op compile script is empty', async () => {
      (ConfigService.getBuildOpConfig as jest.Mock)
        .mockReturnValueOnce({
          script: '',
          cpuDebugScript: '',
          npuDebugScript: '',
          targetFile: null,
        });

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(false);
      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('build.noBuildConfig');
      expect(getBuildOpCommand)
        .not.toHaveBeenCalled();
    });

    it('writes compiledOpPaths into the workspace cache after a successful build', async () => {
      const opPath = path.join(root, 'AddCustom');

      await updateFolderScanState(root, {
        opsMeet: [],
        opsList: [
          {
            name: 'AddCustom',
            path: opPath,
          },
        ],
        experimentalOpsList: [],
      });

      const result = await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(result)
        .toBe(true);
      expect(readWorkspaceCache(root).project?.compiledOpPaths?.[opPath])
        .toBe(true);
      expect(requestSidebarContextsRefresh)
        .toHaveBeenCalledTimes(1);
    });

    it('creates the cache file even when no scan state exists (a writer is never a no-op)', async () => {
      await buildService.startBuild({ operatorNames: 'AddCustom' });

      const cache = readWorkspaceCache(root);

      expect(cache.schemaVersion)
        .toBe(1);
      expect(cache.project?.compiledOpPaths)
        .toEqual({});
    });

    it('skips compiled status for non-standard-custom projects', async () => {
      (OperatorPluginRegistry.detectProject as jest.Mock)
        .mockResolvedValue({ projectType: 'pyasc' });

      await buildService.startBuild({ operatorNames: 'AddCustom' });

      expect(readWorkspaceCache(root).project)
        .toBeUndefined();
    });
  });

  describe('startRun (id-free)', () => {
    it('builds the run ctx without operator input and spawns with projectPath', async () => {
      await buildService.startRun({});

      expect(getRunCommand)
        .toHaveBeenCalledWith({
          projectPath: root,
          configType: 'build_op',
          op: '',
        });
      expect(buildOperatorSpawnContext)
        .toHaveBeenCalledWith({
          baseContext: {
            projectPath: root,
            configType: 'build_op',
            op: '',
          },
          projectPath: root,
          script: 'run-cmd',
        });
    });

    it('writes the deploy target when the project is recognized (id-free)', async () => {
      // The write is gated on `buildConfigId` (a build_op config ROW exists) &&
      // `projectId` — the row exists for every recognized/created/imported
      // project. The id-free twin is `getProjectByPath` (non-null for
      // recognized projects).
      const behavior = {
        requiresActiveFileCheck: true,
        requiresBuildBeforeAnalysis: false,
        supportsSimulate: false,
        supportsOnBoard: false,
        activeFileExtension: '.py',
      };

      (OperatorPluginRegistry.getOpPlugin as jest.Mock)
        .mockReturnValue({
          buildBehavior: behavior,
          opType: 'pyasc',
        });
      (resolveOrPickPythonOperatorUri as jest.Mock)
        .mockResolvedValue({ fsPath: path.join(root, 'ops', 'AddCustom', 'op.py') });

      await buildService.startRun({});

      const relativePath = path.relative(root, path.join(root, 'ops', 'AddCustom', 'op.py'))
        .replace(/\\/g, '/');

      expect(buildPythonDeployTarget)
        .toHaveBeenCalledWith(relativePath);
      expect(ConfigService.writeBuildOpDeployTarget)
        .toHaveBeenCalledTimes(1);
    });

    it('writes the deploy target even when the build_op settings are empty (edge b)', async () => {
      // Edge (b): the user clears all build_op settings,
      // the config row still exists → the write proceeds (`buildConfigId &&
      // projectId` in build-service.ts:512-522 — values never gate the write).
      // The settings map must not gate the write here either.
      const behavior = {
        requiresActiveFileCheck: true,
        requiresBuildBeforeAnalysis: false,
        supportsSimulate: false,
        supportsOnBoard: false,
        activeFileExtension: '.py',
      };

      (OperatorPluginRegistry.getOpPlugin as jest.Mock)
        .mockReturnValue({
          buildBehavior: behavior,
          opType: 'pyasc',
        });
      (resolveOrPickPythonOperatorUri as jest.Mock)
        .mockResolvedValue({ fsPath: path.join(root, 'op.py') });

      await buildService.startRun({});

      expect(ConfigService.writeBuildOpDeployTarget)
        .toHaveBeenCalledTimes(1);
    });

    it('skips the deploy-target write when the workspace is not a recognized project (edge a)', async () => {
      // Edge (a): a from-disk folder without detection has no build_op row →
      // the write is skipped (build-service.ts:512-522). The synthesized
      // project record is undefined for such a workspace → skip.
      (getProjectByPath as jest.Mock).mockReturnValue(undefined);

      const behavior = {
        requiresActiveFileCheck: true,
        requiresBuildBeforeAnalysis: false,
        supportsSimulate: false,
        supportsOnBoard: false,
        activeFileExtension: '.py',
      };

      (OperatorPluginRegistry.getOpPlugin as jest.Mock)
        .mockReturnValue({
          buildBehavior: behavior,
          opType: 'pyasc',
        });
      (resolveOrPickPythonOperatorUri as jest.Mock)
        .mockResolvedValue({ fsPath: path.join(root, 'op.py') });

      await buildService.startRun({});

      expect(ConfigService.writeBuildOpDeployTarget)
        .not.toHaveBeenCalled();
    });

    it('uses build_example ctx when the plugin behavior requires a build before analysis', async () => {
      (OperatorPluginRegistry.getOpPlugin as jest.Mock)
        .mockReturnValue({
          buildBehavior: {
            requiresActiveFileCheck: false,
            requiresBuildBeforeAnalysis: true,
            supportsSimulate: false,
            supportsOnBoard: false,
            activeFileExtension: null,
          },
          opType: 'pyasc',
        });

      await buildService.startRun({});

      expect(getRunCommand)
        .toHaveBeenCalledWith({
          projectPath: root,
          configType: 'build_example',
          op: '',
        });
      expect(buildOperatorSpawnContext)
        .toHaveBeenCalledWith({
          baseContext: {
            projectPath: root,
            configType: 'build_example',
            op: '',
          },
          projectPath: root,
          script: 'run-cmd',
        });
    });
  });

  describe('startUtTest (id-free)', () => {
    it('resolves the ut_test ctx from the workspace project and spawns with projectPath', async () => {
      await buildService.startUtTest({
        operatorNames: 'AddCustom',
        compileOption: '--fast',
      });

      expect(ConfigService.readOpDevtoolsSetting)
        .not.toHaveBeenCalled();
      expect(getUtTestCommand)
        .toHaveBeenCalledWith(
          {
            projectPath: root,
            configType: 'ut_test',
            op: '',
          },
          'AddCustom',
          '--fast',
        );
      expect(buildOperatorSpawnContext)
        .toHaveBeenCalledWith({
          baseContext: {
            projectPath: root,
            configType: 'ut_test',
            op: '',
          },
          projectPath: root,
          operatorNames: 'AddCustom',
          script: 'ut-cmd',
          toolOutputLabel: 'test',
        });
    });

    it('returns early when no workspace folder is open', async () => {
      vscode.workspace.workspaceFolders = undefined;

      await buildService.startUtTest({ operatorNames: 'AddCustom' });

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
      expect(getUtTestCommand)
        .not.toHaveBeenCalled();
    });
  });

  describe('api-types (Start*Params are id-free, CreateOps* use projectPath)', () => {
    it('StartBuildParams accepts operator context without any id', () => {
      const params: StartBuildParams = { operatorNames: 'AddCustom' };

      expect(params.operatorNames)
        .toBe('AddCustom');
    });

    it('StartRunParams accepts only the file path', () => {
      const params: StartRunParams = { filePath: 'ops/AddCustom/op.py' };

      expect(params.filePath)
        .toBeDefined();
    });

    it('StartUtTestParams accepts operator context without any id', () => {
      const params: StartUtTestParams = { operatorNames: 'AddCustom' };

      expect(params.operatorNames)
        .toBe('AddCustom');
    });

    it('CreateOpsParams addresses the project by path', () => {
      const params: CreateOpsParams = { projectPath: '/workspace' };

      expect(params.projectPath)
        .toBe('/workspace');
    });

    it('rejects configId at the type level (not part of StartBuildParams)', () => {
      // @ts-expect-error — configId is not part of StartBuildParams (de-id)
      const buildWithConfigId: StartBuildParams = { configId: '1' };

      expect(buildWithConfigId)
        .toBeDefined();
    });
  });

  describe('normalizeProjectPath key used by compiledOpPaths matches the scan-state key', () => {
    it('marks the operator under the same root key the importer/scan uses', async () => {
      const opPath = path.join(root, 'Sub', 'Op');

      await updateFolderScanState(root, {
        opsMeet: [],
        opsList: [
          {
            name: 'Op',
            path: opPath,
          },
        ],
        experimentalOpsList: [],
      });

      const cacheKey = Object.keys(readWorkspaceCache(root).folders ?? {})[0];

      expect(cacheKey)
        .toBe(normalizeProjectPath(root));
    });
  });
});
