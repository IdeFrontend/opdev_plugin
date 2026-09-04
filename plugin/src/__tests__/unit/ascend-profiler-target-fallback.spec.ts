jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    readBuildExampleTargetFromWorkspace: jest.fn(),
    readBuildOpDeployTargetFromWorkspace: jest.fn(),
  },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';
import { ConfigService } from '@plugin/service/config-service';
import type { ProfilerTargetConfig } from '@plugin/domain/services/command-strategy';

const profilerConfig = {} as ProfilerTargetConfig;

describe('ascend profiler target fallback (operator name, not directory basename)', () => {
  let tmpRoot: string;

  beforeAll(() => {
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    OperatorPluginRegistry.registerOpPlugin(new PyAscPlugin());
    OperatorPluginRegistry.registerOpPlugin(new TritonPlugin());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-ascend-profiler-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('builds build/test_aclnn_<selection> when the example target is unset', () => {
    (ConfigService.readBuildExampleTargetFromWorkspace as jest.Mock).mockReturnValue(undefined);

    const strategy = new AscendCommandStrategy();

    // A root-synthesized record (op_name = project basename) with an EMPTY scan
    // state: the explicit selection must win — the old fallback named the
    // target after the project directory instead of the operator.
    expect(strategy.getProfilerTargetFile(profilerConfig, {
      op_type: 'ascend',
      op_name: path.basename(tmpRoot),
      op_path: tmpRoot,
    }, 'add_custom'))
      .toBe(path.join(tmpRoot, 'build', 'test_aclnn_add_custom'));
  });

  it('cann twin resolves the ascend artifact layout for a standard-custom project', () => {
    (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue(undefined);

    const strategy = new CannCommandStrategy();
    const add = path.join(tmpRoot, 'math', 'add');

    // Plain cann project → cann layout (build/<op>).
    expect(strategy.getProfilerTargetFile(profilerConfig, {
      op_type: 'cann',
      op_name: 'add',
      op_path: add,
    }, 'add'))
      .toBe(path.join(add, 'build', 'add'));

    // standard-custom project (project_type 'ascend') → ascend artifact layout
    // with the cann profiler target: the packaged `.run` artifact the base
    // build_op row carried (build_out/*.run), not the example binary.
    expect(strategy.getProfilerTargetFile(profilerConfig, {
      op_type: 'cann',
      op_name: 'add',
      op_path: add,
    }, 'add', { project_type: 'ascend' } as any))
      .toBe(path.join(add, 'build_out', '*.run'));
  });
});
