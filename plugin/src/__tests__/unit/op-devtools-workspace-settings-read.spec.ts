import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@plugin/domain/utils/ascend-util', () => ({
  ...jest.requireActual('@plugin/domain/utils/ascend-util'),
  resolveEffectiveCannSoc: jest.fn(() => 'ascend950'),
}));

import * as vscode from 'vscode';
import { resolveBuildOpBaseContext } from '@plugin/domain/services/command';
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import {
  getConfiguredEnvironmentScriptPath,
  getEnvironmentScriptPathFromWorkspace,
  getEnvironmentSocVersionFromWorkspace,
  getSocVersionWithWorkspaceOverride,
  getWorkspaceSimulatorType,
  readWorkspaceProjectTypeSetting,
} from '@plugin/helpers/operator-project-workspace-config';
import { ConfigService } from '@plugin/service/config-service';

/**
 * Runtime configs are synthesized from workspace settings + cache.json only —
 * the per-section DAO factories.
 */
describe('ConfigService per-section DAO factories (settings + cache only)', () => {
  const getStore: Record<string, unknown> = {};
  const inspectStore: Record<string, vscode.ConfigurationInspect<unknown> | undefined> = {};
  let workspacePath: string;
  let cachePath: string;

  const inspectFromStore = <T>(key: string): vscode.ConfigurationInspect<T> | undefined => {
    if (!(key in getStore)) {
      return undefined;
    }

    return {
      key,
      workspaceFolderValue: getStore[key] as T,
    };
  };

  function seedCache(content: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify({
      schemaVersion: 1,
      ...content,
    }, null, 2)}\n`, 'utf8');
  }

  beforeEach(() => {
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    Object.keys(inspectStore)
      .forEach((k) => delete inspectStore[k]);
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-read-'));
    cachePath = path.join(workspacePath, '.vscode', 'cache.json');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: <T>(key: string) => (
        inspectStore[key] as vscode.ConfigurationInspect<T> | undefined
      ) ?? inspectFromStore<T>(key),
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspacePath } } as vscode.WorkspaceFolder];
  });

  afterEach(() => {
    fs.rmSync(workspacePath, {
      recursive: true,
      force: true,
    });
  });

  it('build_op script/target come from workspace settings only (no stored row)', () => {
    getStore['compileAndDeploy.buildConfig.compileCommand'] = 'from-settings';
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'from-settings-run';

    const config = ConfigService.getBuildOpConfig();

    expect(config.script)
      .toBe('from-settings');
    expect(config.targetFile)
      .toBe('from-settings-run');
  });

  it('does not surface user-scope (global) deploy target when the workspace scopes are unset', () => {
    inspectStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = {
      key: 'compileAndDeploy.buildConfig.deployCommandOrRunCommand',
      // User-level settings are reported by VS Code as `globalValue` on the
      // inspect result (there is no `userValue` field). The workspace config
      // read must NOT fall back to user scope — settings.json is the only source.
      globalValue: 'user-scope-run',
      workspaceValue: undefined,
      workspaceFolderValue: undefined,
    };

    expect(ConfigService.getBuildOpConfig().targetFile)
      .toBeNull();
  });

  it('workspace-folder deploy target wins over user/workspace scopes', () => {
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'workspace-folder-run';
    inspectStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = {
      key: 'compileAndDeploy.buildConfig.deployCommandOrRunCommand',
      globalValue: 'user-scope-run',
      workspaceValue: 'workspace-scope-run',
      workspaceFolderValue: 'workspace-folder-run',
    };

    expect(ConfigService.getBuildOpConfig().targetFile)
      .toBe('workspace-folder-run');
  });

  it('build_example script comes from settings, not a default', () => {
    getStore['compileAndDeploy.exampleBuildConfig.runCommand'] = 'example-from-settings';

    expect(ConfigService.getBuildExampleConfig().script)
      .toBe('example-from-settings');
  });

  it('build_example script is empty when runCommand setting is absent (no fallback)', () => {
    expect(ConfigService.getBuildExampleConfig().script)
      .toBe('');
  });

  it('build_example execution_mode defaults to eager when the setting is absent', () => {
    expect(ConfigService.getBuildExampleConfig().executionMode)
      .toBe('eager');
  });

  it('build_example execution_mode comes from settings when set', () => {
    getStore['compileAndDeploy.exampleBuildConfig.executionMode'] = 'graph';

    expect(ConfigService.getBuildExampleConfig().executionMode)
      .toBe('graph');
  });

  it('sanitizer script is empty when sanitizerCompileCommand setting is absent (no fallback)', () => {
    expect(ConfigService.getSanitizerConfig(workspacePath, 'op_add').script)
      .toBe('');
  });

  it('on_board script is empty when onBoardCompileCommand is absent (no compileCommand fallback)', () => {
    getStore['compileAndDeploy.buildConfig.compileCommand'] = 'general-compile';

    expect(ConfigService.getOnBoardConfig(workspacePath).script)
      .toBe('');
  });

  it('surfaces the synced sanitizer target_file from cache.sanitizerPythonTarget[op]', () => {
    seedCache({ sanitizerPythonTarget: { triton_vector_add: 'python3 ./triton_vector_add.py' } });

    // The sanitizer target surfaces on the DAO directly — command builders read
    // `targetFile` off the config.
    expect(ConfigService.getSanitizerConfig(workspacePath, 'triton_vector_add').targetFile)
      .toBe('python3 ./triton_vector_add.py');
  });

  it('does not leak another op sanitizer target into the config', () => {
    seedCache({ sanitizerPythonTarget: { other_op: 'python3 ./other.py' } });

    expect(ConfigService.getSanitizerConfig(workspacePath, 'triton_vector_add').targetFile)
      .toBeNull();
  });

  it('Triton getProfilerTargetFile resolves the synced sanitizer target end-to-end via getSanitizerConfig', () => {
    seedCache({ sanitizerPythonTarget: { triton_vector_add: 'python3 ./triton_vector_add.py' } });

    const config = ConfigService.getSanitizerConfig(workspacePath, 'triton_vector_add');
    const strategy = new TritonCommandStrategy();

    expect(strategy.getProfilerTargetFile(config, null, 'triton_vector_add'))
      .toBe('python3 ./triton_vector_add.py');
  });

  it('carries the persisted fileMapList from cache.fileMapLists[configType]', () => {
    seedCache({
      fileMapLists: {
        sanitizer: [
          {
            filePath: 'report.txt',
            reportTime: 42,
          },
        ],
        simulate: [],
        on_board: [],
      },
    });

    expect(ConfigService.getSanitizerConfig(workspacePath, 'op_add').fileMapList)
      .toEqual([
        {
          filePath: 'report.txt',
          reportTime: 42,
        },
      ]);
  });

  it('reads persisted npu-check toolType and npu check options from settings', () => {
    getStore['sanitizer.toolType'] = 'npu-check';
    getStore['sanitizer.memory'] = true;
    getStore['sanitizer.sync'] = false;
    getStore['sanitizer.race'] = true;
    getStore['sanitizer.uninitialized'] = false;
    getStore['sanitizer.soc'] = true;
    getStore['sanitizer.over'] = false;

    // resolveEffectiveCannSoc is mocked to 'ascend950' (non-A2/A3), so the
    // persisted toolType is honored.
    const config = ConfigService.getSanitizerConfig(workspacePath, 'op_add');

    expect(config.toolType)
      .toBe('npu-check');
    expect(config.tool)
      .toEqual({
        memcheck: true,
        synccheck: false,
        racecheck: true,
        initcheck: false,
        soccheck: true,
        overcheck: false,
      });
  });

  it('maps sanitizer detectionScope=singleBlock to useBlock=true and carries blockId', () => {
    getStore['sanitizer.detectionScope'] = 'singleBlock';
    getStore['sanitizer.blockId'] = 7;

    const config = ConfigService.getSanitizerConfig(workspacePath);

    expect(config.useBlock)
      .toBe(true);
    expect(config.blockId)
      .toBe(7);
  });

  it('maps sanitizer detectionScope=global to useBlock=false', () => {
    getStore['sanitizer.detectionScope'] = 'global';
    getStore['sanitizer.blockId'] = 7;

    expect(ConfigService.getSanitizerConfig(workspacePath).useBlock)
      .toBe(false);
  });

  it('null socVersion is unset on the workspace scope — readers fall through to empty', () => {
    getStore['environment.socVersion'] = null;

    expect(getSocVersionWithWorkspaceOverride(null))
      .toBe('');
    expect(getEnvironmentSocVersionFromWorkspace())
      .toBe('');
  });

  it('null simulatorType is unset — simulator type reader returns empty', () => {
    getStore['performanceTuning.simulation.simulatorType'] = null;

    expect(getWorkspaceSimulatorType())
      .toBe('');
  });

  it('null environmentScript is unset — script readers fall back to the default', () => {
    getStore['environment.environmentScript'] = null;

    expect(getConfiguredEnvironmentScriptPath())
      .toBeUndefined();
    expect(getEnvironmentScriptPathFromWorkspace())
      .toBe('/etc/profile');
  });

  it('null projectType is unset — project type reader returns undefined', () => {
    getStore['projectType'] = null;

    expect(readWorkspaceProjectTypeSetting())
      .toBeUndefined();
  });

  it('getBuildOpConfig reads op from the operatorNameToCompile setting', () => {
    getStore['compileAndDeploy.buildConfig.operatorNameToCompile'] = 'saved_op';

    expect(ConfigService.getBuildOpConfig().op)
      .toBe('saved_op');
  });

  it('resolveBuildOpBaseContext backfills the op from the operatorNameToCompile setting when the sidebar selection is empty', () => {
    getStore['projectType'] = 'ascend';
    getStore['compileAndDeploy.buildConfig.operatorNameToCompile'] = 'saved_op';

    const ctx = resolveBuildOpBaseContext(workspacePath);

    expect(ctx.op)
      .toBe('saved_op');
    expect(ctx.config.op)
      .toBe('saved_op');
  });

  it('resolveBuildOpBaseContext prefers the config-carried operator name over the sidebar selection', () => {
    getStore['projectType'] = 'ascend';
    getStore['compileAndDeploy.buildConfig.operatorNameToCompile'] = 'saved_op';

    const ctx = resolveBuildOpBaseContext(workspacePath, 'sidebar_op');

    // The config-carried name wins: a standard-custom collection carries the
    // ROOT name in its single config set, and the selection flows only into
    // the --ops={operatorNames} placeholder.
    expect(ctx.op)
      .toBe('saved_op');
    expect(ctx.config.op)
      .toBe('saved_op');
  });
});

describe('ConfigService ut_test / simulate / on_board DAOs', () => {
  const getStore: Record<string, unknown> = {};
  const inspectStore: Record<string, vscode.ConfigurationInspect<unknown> | undefined> = {};
  let workspacePath: string;
  let cachePath: string;

  const inspectFromStore = <T>(key: string): vscode.ConfigurationInspect<T> | undefined => {
    if (!(key in getStore)) {
      return undefined;
    }

    return {
      key,
      workspaceFolderValue: getStore[key] as T,
    };
  };

  function seedCache(content: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify({
      schemaVersion: 1,
      ...content,
    }, null, 2)}\n`, 'utf8');
  }

  beforeEach(() => {
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    Object.keys(inspectStore)
      .forEach((k) => delete inspectStore[k]);
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-read-'));
    cachePath = path.join(workspacePath, '.vscode', 'cache.json');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: <T>(key: string) => (
        inspectStore[key] as vscode.ConfigurationInspect<T> | undefined
      ) ?? inspectFromStore<T>(key),
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspacePath } } as vscode.WorkspaceFolder];
  });

  afterEach(() => {
    fs.rmSync(workspacePath, {
      recursive: true,
      force: true,
    });
  });

  it('getUtTestConfig is empty when the utTestCompileCommand setting is absent', () => {
    expect(ConfigService.getUtTestConfig())
      .toEqual({ script: '' });
  });

  it('getUtTestConfig carries the utTestCompileCommand setting', () => {
    getStore['compileAndDeploy.buildConfig.utTestCompileCommand'] = 'bash ut.sh';

    expect(ConfigService.getUtTestConfig())
      .toEqual({ script: 'bash ut.sh' });
  });

  it('getUtTestConfig treats a whitespace-only setting as unset', () => {
    getStore['compileAndDeploy.buildConfig.utTestCompileCommand'] = '   ';

    expect(ConfigService.getUtTestConfig())
      .toEqual({ script: '' });
  });

  it('getSimulateConfig returns the fresh-project defaults when nothing is set', () => {
    expect(ConfigService.getSimulateConfig(workspacePath))
      .toEqual({
        script: '',
        simulatorType: '',
        memoryThroughputWaveform: false,
        resourceConflictRatio: true,
        advanceParam: [],
        fileMapList: [],
      });
  });

  it('getSimulateConfig carries partial settings once any setting is set', () => {
    getStore['compileAndDeploy.buildConfig.simulationCompileCommand'] = 'sim.sh';

    expect(ConfigService.getSimulateConfig(workspacePath))
      .toEqual({
        script: 'sim.sh',
        simulatorType: '',
        memoryThroughputWaveform: false,
        resourceConflictRatio: false,
        advanceParam: [],
        fileMapList: [],
      });
  });

  it('getSimulateConfig maps a parameters object into advanceParam rows', () => {
    getStore['performanceTuning.simulation.parameters'] = {
      iter: 3,
      mem: null,
    };

    const config = ConfigService.getSimulateConfig(workspacePath);

    expect(config.script)
      .toBe('');
    expect(config.advanceParam)
      .toEqual([
        {
          name: 'iter',
          value: '3',
        },
        {
          name: 'mem',
          value: '',
        },
      ]);
  });

  it('getSimulateConfig passes a parameters array through as advanceParam', () => {
    getStore['performanceTuning.simulation.parameters'] = [
      {
        name: 'iter',
        value: 3,
      },
    ];

    expect(ConfigService.getSimulateConfig(workspacePath).advanceParam)
      .toEqual([
        {
          name: 'iter',
          value: 3,
        },
      ]);
  });

  it('getSimulateConfig carries the fileMapList from the cache', () => {
    getStore['compileAndDeploy.buildConfig.simulationCompileCommand'] = 'sim.sh';
    seedCache({
      fileMapLists: {
        simulate: [
          {
            filePath: '/ws/rep1.csv',
            reportTime: 1,
          },
        ],
      },
    });

    expect(ConfigService.getSimulateConfig(workspacePath).fileMapList)
      .toEqual([
        {
          filePath: '/ws/rep1.csv',
          reportTime: 1,
        },
      ]);
  });

  it('getOnBoardConfig returns the fresh-project defaults on a non-A5 profiler', () => {
    const config = ConfigService.getOnBoardConfig(workspacePath);

    expect(config.script)
      .toBe('');
    expect(config.memoryDetail)
      .toBe(true);
    expect(config.pcSampling)
      .toBe(false);
    expect(config.occupancy)
      .toBe(true);
    expect(config.kernelScale)
      .toBe(false);
    expect(config.operatorMetrics)
      .toBe(false);
    expect(config.advanceParam)
      .toEqual([]);
    expect(config.fileMapList)
      .toEqual([]);
  });

  it('getOnBoardConfig carries partial settings once any setting is set', () => {
    getStore['compileAndDeploy.buildConfig.onBoardCompileCommand'] = 'ob.sh';

    const config = ConfigService.getOnBoardConfig(workspacePath);

    expect(config.script)
      .toBe('ob.sh');
    expect(config.occupancy)
      .toBe(false);
    expect(config.roofline)
      .toBe(false);
    expect(config.kernelScale)
      .toBe(false);
    expect(config.memoryDetail)
      .toBe(false);
    expect(config.pcSampling)
      .toBe(false);
    expect(config.advanceParam)
      .toEqual([]);
  });

  it('getOnBoardConfig maps a parameters object into advanceParam rows', () => {
    getStore['performanceTuning.onBoard.parameters'] = { warmup: 1 };

    expect(ConfigService.getOnBoardConfig(workspacePath).advanceParam)
      .toEqual([
        {
          name: 'warmup',
          value: '1',
        },
      ]);
  });

  it('surfaces pcSampling and hides memoryDetail on an A5 profiler', () => {
    getStore['environment.socVersion'] = 'ascend950';
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const config = ConfigService.getOnBoardConfig(workspacePath);

    expect(config.pcSampling)
      .toBe(true);
    expect(config.memoryDetail)
      .toBe(false);
  });

  it('surfaces cacheHeatmap as memoryDetail on a non-A5 profiler', () => {
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const config = ConfigService.getOnBoardConfig(workspacePath);

    expect(config.memoryDetail)
      .toBe(true);
    expect(config.pcSampling)
      .toBe(false);
  });

  it('hasBuildExampleConfig is true when the run command is set', () => {
    getStore['compileAndDeploy.exampleBuildConfig.runCommand'] = 'bash run_example.sh';

    expect(ConfigService.hasBuildExampleConfig())
      .toBe(true);
  });

  it('hasBuildExampleConfig is true when only the example target file is set', () => {
    getStore['compileAndDeploy.exampleBuildConfig.targetFile'] = './run_example.sh';

    expect(ConfigService.hasBuildExampleConfig())
      .toBe(true);
  });

  it('hasBuildExampleConfig is false when script and target file are both empty', () => {
    expect(ConfigService.hasBuildExampleConfig())
      .toBe(false);
  });

  it('getSanitizerConfig carries partial tool and memcheck settings', () => {
    getStore['sanitizer.memory'] = true;
    getStore['sanitizer.race'] = false;
    getStore['sanitizer.uninitialized'] = true;
    getStore['sanitizer.memoryLeak'] = false;
    getStore['sanitizer.allocUnused'] = true;

    const config = ConfigService.getSanitizerConfig(workspacePath);

    expect(config.tool)
      .toEqual({
        memcheck: true,
        racecheck: false,
        initcheck: true,
      });
    expect(config.memcheckOption)
      .toEqual({
        'leak-check': false,
        'check-unused-memory': true,
      });
    expect(config.targetFile)
      .toBeNull();
    expect(config.fileMapList)
      .toEqual([]);
  });

  it('getBuildExampleConfig normalizes a whitespace-padded graph execution mode', () => {
    getStore['compileAndDeploy.exampleBuildConfig.executionMode'] = ' graph ';

    expect(ConfigService.getBuildExampleConfig().executionMode)
      .toBe('graph');
  });
});
