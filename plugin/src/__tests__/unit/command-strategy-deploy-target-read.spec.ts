import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import { PyAscCommandStrategy } from '@plugin/domain/services/command-strategy/pyasc-strategy';
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';
import { ConfigService } from '@plugin/service/config-service';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import { updateWorkspaceCache } from '@plugin/helpers/workspace-cache';
import type {
  BuildOpConfig, OnBoardConfig, SanitizerConfig, SimulateConfig,
} from '@plugin/service/config-service';

describe('command strategy deploy vs profiler target reads', () => {
  const getStore: Record<string, unknown> = {};
  const inspectFromStore = <T>(key: string): vscode.ConfigurationInspect<T> | undefined => {
    if (!(key in getStore)) {
      return undefined;
    }

    return {
      key,
      workspaceFolderValue: getStore[key] as T,
    };
  };

  const OP = {
    op_type: 'cann',
    op_path: '/ws/op',
    op_name: 'myop',
  } as const;

  const simulateConfig: SimulateConfig = {
    script: '',
    simulatorType: '',
    memoryThroughputWaveform: false,
    resourceConflictRatio: false,
    advanceParam: [],
    fileMapList: [],
  };

  const onBoardConfig: OnBoardConfig = {
    script: '',
    occupancy: false,
    roofline: false,
    source: false,
    arithmeticUtilization: false,
    l2Cache: false,
    memory: false,
    memoryL0: false,
    memoryUB: false,
    pipeUtilization: false,
    resourceConflictRatio: false,
    kernelScale: false,
    memoryDetail: false,
    pcSampling: false,
    operatorMetrics: false,
    advanceParam: [],
    fileMapList: [],
  };

  const sanitizerConfig = (overrides: Partial<SanitizerConfig> = {}): SanitizerConfig => ({
    script: '',
    tool: {
      memcheck: false,
      racecheck: false,
      initcheck: false,
    },
    memcheckOption: {
      'leak-check': false,
      'check-unused-memory': false,
    },
    logLevel: 'warn',
    maxDebuglogSize: 1024,
    useBlock: false,
    blockId: null,
    targetFile: null,
    fileMapList: [],
    ...overrides,
  });

  beforeAll(() => {
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    OperatorPluginRegistry.registerOpPlugin(new PyAscPlugin());
    OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: inspectFromStore,
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
  });

  it('ascend buildOpCommand appends the deploy tail ONLY for the build_op section (pre-builds end after compile)', () => {
    const strategy = new AscendCommandStrategy();

    // The simulate/on-board/sanitizer pre-builds resolve their OWN section DAO
    // (no targetFile field) — the base merge left target_file undefined for
    // those sections, so the command must end after the compile step.
    const preBuild = strategy.buildOpCommand({
      config: simulateConfig as unknown as BuildOpConfig,
      sourceCannCmd: '',
      cdCmd: 'cd /ws',
      compileOption: undefined,
      advance_cmd: undefined,
      operatorNames: undefined,
    });

    expect(preBuild)
      .not.toContain('RUN_FILE');

    const buildSection = strategy.buildOpCommand({
      config: {
        script: 'bash build.sh',
        cpuDebugScript: '',
        npuDebugScript: '',
        targetFile: '/ws/build_out/*.run',
      },
      sourceCannCmd: '',
      cdCmd: 'cd /ws',
      compileOption: undefined,
      advance_cmd: undefined,
      operatorNames: undefined,
    });

    expect(buildSection)
      .toContain('RUN_FILE=$(find /ws/build_out/*.run)');
  });

  it('getRunTargetFile reads deploy target from workspace only', () => {
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'python run.py';
    const strategy = new CannCommandStrategy();

    expect(strategy.getRunTargetFile(OP.op_name))
      .toBe('python run.py');
  });

  it('Cann getProfilerTargetFile prefers the workspace deploy setting', () => {
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'build_out/*.run';
    const strategy = new CannCommandStrategy();

    expect(strategy.getProfilerTargetFile(onBoardConfig, OP))
      .toBe('build_out/*.run');
  });

  it('Cann getProfilerTargetFile falls back to the operator default when the setting is unset', () => {
    const strategy = new CannCommandStrategy();

    expect(strategy.getProfilerTargetFile(onBoardConfig, OP))
      .toBe(path.join('/ws/op', 'build', 'myop'));
    expect(ConfigService.readBuildOpDeployTargetFromWorkspace())
      .toBeUndefined();
  });

  it('PyAsc getProfilerTargetFile prefers the workspace deploy setting', () => {
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'python3 ./app.py';
    const strategy = new PyAscCommandStrategy();

    expect(strategy.getProfilerTargetFile(simulateConfig, OP))
      .toBe('python3 ./app.py');
  });

  it('PyAsc getProfilerTargetFile falls back to the python entry default', () => {
    const strategy = new PyAscCommandStrategy();

    expect(strategy.getProfilerTargetFile(simulateConfig, OP))
      .toBe('python3 ./myop.py');
  });

  it('Triton getProfilerTargetFile prefers the workspace deploy setting outside sanitizer', () => {
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'python3 ./triton_vector_add.py';
    const strategy = new TritonCommandStrategy();

    expect(strategy.getProfilerTargetFile(simulateConfig, OP))
      .toBe('python3 ./triton_vector_add.py');
  });

  it('Triton getProfilerTargetFile falls back to the python entry default outside sanitizer', () => {
    const strategy = new TritonCommandStrategy();

    expect(strategy.getProfilerTargetFile(onBoardConfig, OP))
      .toBe('python3 ./myop.py');
  });

  it('Triton getProfilerTargetFile keeps the synced DAO targetFile for sanitizer', () => {
    const strategy = new TritonCommandStrategy();

    expect(strategy.getProfilerTargetFile(sanitizerConfig({ targetFile: 'python3 ./active.py' }), OP))
      .toBe('python3 ./active.py');
  });

  it('Ascend getProfilerTargetFile prefers the exampleBuildConfig.targetFile setting', () => {
    getStore['compileAndDeploy.exampleBuildConfig.targetFile'] = '/ws/op/build/test_aclnn_custom';
    const strategy = new AscendCommandStrategy();

    expect(strategy.getProfilerTargetFile(onBoardConfig, OP))
      .toBe('/ws/op/build/test_aclnn_custom');
  });

  it('Ascend getProfilerTargetFile falls back to build/test_aclnn_<op_name>', () => {
    const strategy = new AscendCommandStrategy();

    expect(strategy.getProfilerTargetFile(onBoardConfig, OP))
      .toBe(path.join('/ws/op', 'build', 'test_aclnn_myop'));
    expect(ConfigService.readBuildExampleTargetFromWorkspace())
      .toBeUndefined();
  });

  it('Ascend getProfilerTargetFile uses the same example target for the sanitizer config', () => {
    getStore['compileAndDeploy.exampleBuildConfig.targetFile'] = '/ws/op/build/test_aclnn_custom';
    const strategy = new AscendCommandStrategy();

    expect(strategy.getProfilerTargetFile(sanitizerConfig(), OP))
      .toBe('/ws/op/build/test_aclnn_custom');
  });

  it('falls back to the operator default run target when the workspace deploy setting is unset', () => {
    // The multi-operator seeder leaves deployCommandOrRunCommand empty; the
    // default-path fallback keeps the run command from degrading to a bare cd.
    const strategy = new CannCommandStrategy();

    expect(strategy.getRunTargetFile(OP.op_name, OP))
      .toBe(path.join('/ws/op', 'build', 'myop'));
    expect(ConfigService.readBuildOpDeployTargetFromWorkspace())
      .toBeUndefined();
  });

  it('Ascend single-op fallback uses the SCANNED operator name, not the directory basename', async () => {
    // A root-operator record synthesized for an empty `op`
    // carries the PROJECT basename — the default-path fallback must resolve the
    // operator the scan knows (folders[<root>].opsList[0]) instead, matching
    // the ops registry record (which knows the scanned name).
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-profiler-target-'));
    const opPath = path.join(root, 'scan_op');

    try {
      await updateWorkspaceCache(root, (cache) => {
        cache.folders = {
          [normalizeProjectPath(root)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'scan_op',
                path: opPath,
              },
            ],
            experimentalOpsList: [],
          },
        };
      });

      const strategy = new AscendCommandStrategy();

      // No workspace setting, no explicit op, root-operator record only.
      expect(strategy.getProfilerTargetFile(onBoardConfig, {
        op_type: 'ascend',
        op_name: path.basename(root),
        op_path: root,
      }, ''))
        .toBe(path.join(root, 'build', 'test_aclnn_scan_op'));

      // Cann twin: build/<op_name>.
      expect(new CannCommandStrategy()
        .getProfilerTargetFile(onBoardConfig, {
          op_type: 'cann',
          op_name: path.basename(root),
          op_path: root,
        }, ''))
        .toBe(path.join(root, 'build', 'scan_op'));
    }
    finally {
      fs.rmSync(root, {
        recursive: true,
        force: true,
      });
    }
  });
});
