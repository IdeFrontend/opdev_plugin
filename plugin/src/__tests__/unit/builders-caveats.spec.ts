import * as vscode from 'vscode';

// i18next is initialized only in the extension activate flow, so `t` would return
// an empty string in unit tests. Resolve keys (and the interpolated inner error)
// to their keys so error causes are assertable without loading the nls resources.
jest.mock('i18next', () => ({ t: (key: string, options?: { error?: string }) => (options?.error ? `${options.error}` : key) }));

jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn() }));

jest.mock('@plugin/domain/models/op-record', () => ({ resolveOpRecord: jest.fn() }));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    getBuildOpConfig: jest.fn(),
    getBuildExampleConfig: jest.fn(),
    getSanitizerConfig: jest.fn(),
    readBuildOpDeployTargetFromWorkspace: jest.fn(),
    readBuildExampleTargetFromWorkspace: jest.fn(),
  },
}));

import { getProjectByPath } from '@plugin/domain/models/project-model';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { ConfigService } from '@plugin/service/config-service';
import type {
  BuildExampleConfig, BuildOpConfig, SanitizerConfig,
} from '@plugin/service/config-service';
import {
  getBuildOpCommand,
  getSanitizerCommand,
  resolveBuildOpBaseContext,
  resolveSanitizerBaseContext,
  resolveBuildExampleBaseContext,
} from '@plugin/domain/services/command';

function buildOpConfig(overrides: Partial<BuildOpConfig> = {}): BuildOpConfig {
  return {
    script: '',
    cpuDebugScript: '',
    npuDebugScript: '',
    targetFile: null,
    ...overrides,
  };
}

function buildExampleConfig(overrides: Partial<BuildExampleConfig> = {}): BuildExampleConfig {
  return {
    script: '',
    executionMode: 'eager',
    eagerExamplePattern: undefined,
    graphExamplePattern: undefined,
    targetFile: null,
    ...overrides,
  };
}

function sanitizerConfig(overrides: Partial<SanitizerConfig> = {}): SanitizerConfig {
  return {
    script: '',
    tool: {
      memcheck: true,
      racecheck: true,
      initcheck: true,
    },
    memcheckOption: {
      'leak-check': true,
      'check-unused-memory': true,
    },
    logLevel: 'warn',
    maxDebuglogSize: 1024,
    useBlock: false,
    blockId: null,
    targetFile: null,
    fileMapList: [],
    ...overrides,
  };
}

describe('builder caveats (deploy-append + example splice)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ConfigService.getBuildOpConfig as jest.Mock)
      .mockReturnValue(buildOpConfig());
    (ConfigService.getSanitizerConfig as jest.Mock)
      .mockReturnValue(sanitizerConfig());
    (getProjectByPath as jest.Mock).mockReturnValue({
      id: 10,
      project_path: '/repo',
      ascend_env_script: '/cann/setenv.bash',
    });
    (resolveOpRecord as jest.Mock).mockReturnValue({
      op_name: 'myop',
      op_type: 'cann',
      op_path: '/repo/experimental/myop',
    });
  });

  describe('empty script behavior per project type', () => {
    it('cann buildOpCommand throws on an empty script', () => {
      (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue(buildOpConfig());
      (resolveOpRecord as jest.Mock).mockReturnValue({
        op_name: 'myop',
        op_type: 'cann',
        op_path: '/repo/experimental/myop',
      });

      expect(() => getBuildOpCommand(resolveBuildOpBaseContext('/repo', 'myop')))
        .toThrow();
    });

    it('ascend buildOpCommand skips the empty script instead of throwing', () => {
      (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue(buildOpConfig());
      (resolveOpRecord as jest.Mock).mockReturnValue({
        op_name: 'add',
        op_type: 'ascend',
        op_path: '/repo/experimental/add',
      });
      (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue(undefined);

      const command = getBuildOpCommand(resolveBuildOpBaseContext('/repo', 'add'));

      expect(command)
        .toContain('cd /repo/experimental/add');
      expect(command)
        .not.toContain('RUN_FILE');
    });

    it('pyasc buildOpCommand throws buildOpNotSupported', () => {
      (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue(buildOpConfig());
      (resolveOpRecord as jest.Mock).mockReturnValue({
        op_name: 'myop',
        op_type: 'pyasc',
        op_path: '/repo/myop',
      });

      expect(() => getBuildOpCommand(resolveBuildOpBaseContext('/repo', 'myop')))
        .toThrow(/pyasc\.buildOpNotSupported/);
    });

    it('triton buildOpCommand throws on an empty script', () => {
      (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue(buildOpConfig());
      (resolveOpRecord as jest.Mock).mockReturnValue({
        op_name: 'myop',
        op_type: 'triton',
        op_path: '/repo/myop',
      });

      expect(() => getBuildOpCommand(resolveBuildOpBaseContext('/repo', 'myop')))
        .toThrow();
    });
  });

  describe('ascend explicit deploy append', () => {
    const config = () => buildOpConfig({ script: 'bash /repo/experimental/add/build.sh --pkg' });

    it('omits the RUN_FILE fragment when the deploy setting is empty', () => {
      (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue(config());
      (resolveOpRecord as jest.Mock).mockReturnValue({
        op_name: 'add',
        op_type: 'ascend',
        op_path: '/repo/experimental/add',
      });
      (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue(undefined);

      const command = getBuildOpCommand(resolveBuildOpBaseContext('/repo', 'add'));

      expect(command)
        .not.toContain('RUN_FILE');
      expect(command)
        .toContain('bash /repo/experimental/add/build.sh --pkg');
    });

    it('appends the RUN_FILE fragment when the build_op section carries the deploy target', () => {
      // The deploy target reaches the strategy through the build_op DAO's
      // targetFile field (getBuildOpConfig reads the deploy setting) — the
      // strategy no longer consults the workspace setting directly, so the
      // simulate/on-board/sanitizer pre-build sections (no targetFile field)
      // never get the install tail.
      (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue(buildOpConfig({
        script: 'bash /repo/experimental/add/build.sh --pkg',
        targetFile: 'build_out/*.run',
      }));
      (resolveOpRecord as jest.Mock).mockReturnValue({
        op_name: 'add',
        op_type: 'ascend',
        op_path: '/repo/experimental/add',
      });

      const command = getBuildOpCommand(resolveBuildOpBaseContext('/repo', 'add'));

      expect(command)
        .toContain('RUN_FILE=$(find build_out/*.run)');
    });
  });

  describe('example target splice', () => {
    const ascendOp = () => ({
      op_name: 'add',
      op_type: 'ascend',
      op_path: '/repo/experimental/add',
    });

    it('splices the FIRST operator name of a multi-op selection into a test_aclnn_ example target', () => {
      (ConfigService.getSanitizerConfig as jest.Mock).mockReturnValue(sanitizerConfig());
      (ConfigService.getBuildExampleConfig as jest.Mock).mockReturnValue(buildExampleConfig());
      (resolveOpRecord as jest.Mock).mockReturnValue(ascendOp());
      (ConfigService.readBuildExampleTargetFromWorkspace as jest.Mock).mockReturnValue('/repo/experimental/add/build/test_aclnn_add');

      const command = getSanitizerCommand(
        resolveSanitizerBaseContext('/repo', 'add'),
        resolveBuildExampleBaseContext('/repo', 'add', 'add,sub'),
        'add,sub',
      );

      // One target names one binary: the first operator's — a comma can never
      // appear in a built example name.
      expect(command)
        .toContain('/repo/experimental/add/build/test_aclnn_add');
      expect(command)
        .not.toContain('test_aclnn_add,sub');
    });

    it('leaves a non-example target untouched', () => {
      (ConfigService.getSanitizerConfig as jest.Mock).mockReturnValue(sanitizerConfig());
      (ConfigService.getBuildExampleConfig as jest.Mock).mockReturnValue(buildExampleConfig());
      (resolveOpRecord as jest.Mock).mockReturnValue(ascendOp());
      (ConfigService.readBuildExampleTargetFromWorkspace as jest.Mock).mockReturnValue('/repo/experimental/add/build_out/*.run');

      const command = getSanitizerCommand(
        resolveSanitizerBaseContext('/repo', 'add'),
        resolveBuildExampleBaseContext('/repo', 'add', 'add,sub'),
        'add,sub',
      );

      expect(command)
        .toContain('/repo/experimental/add/build_out/*.run');
      expect(command)
        .not.toContain('add,sub');
    });
  });
});
