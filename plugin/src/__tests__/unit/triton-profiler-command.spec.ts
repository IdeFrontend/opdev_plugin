jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getFirstWorkspaceFolderPath: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getFirstWorkspaceFolderPath,
  getWorkspaceSimulatorType: jest.fn(() => ''),
  getSocVersionWithWorkspaceOverride: jest.fn(() => 'ascend910b'),
}));
jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({
  getGlobalEnvSnapshot: jest.fn(() => ({
    socVersion: 'ascend910b',
    simulatorType: undefined,
    npuArch: '910b',
    ascendEnvScript: undefined,
  })),
}));
// `msprof op simulator --soc-version` is the simulator directory resolved by
// resolveAscendEnv({ isSimulator: true }).simulatorType (profiler-service SimulatorStrategy),
// not the workspace soc override. Pin it so the generated command is deterministic.
jest.mock('@plugin/domain/utils/ascend-util', () => ({
  ...jest.requireActual('@plugin/domain/utils/ascend-util'),
  resolveAscendEnv: jest.fn(() => ({
    socVersion: 'ascend910b',
    simulatorType: 'ascend910b',
    npuArch: '910b',
  })),
}));

import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import type { ConfigRecord } from '@plugin/service/config-service';
import type { OpRecord } from '@plugin/domain/models/op-record';

describe('TritonCommandStrategy profiler commands', () => {
  const strategy = new TritonCommandStrategy();
  const config = {
    project_id: 1,
    op: 'triton_vector_add',
    user_options: { ResourceConflictRatio: true },
  } as ConfigRecord;
  const operator = {
    id: 1,
    project_id: 1,
    op_name: 'triton_vector_add',
    op_type: 'triton',
    op_path: '/ws/triton_vector_add',
  } as OpRecord;
  const project = {
    id: 1,
    project_path: '/ws/triton_vector_add',
    ascend_env_script: '/opt/cann/set_env.sh',
  };
  const targetFile = 'python3 ./triton_vector_add.py';

  it('buildSimulateCommand wraps msprof op simulator around the python entry', () => {
    const cmd = strategy.buildSimulateCommand({
      config,
      project,
      operator,
      sourceCannCmd: '. /opt/cann/set_env.sh',
      cdCmd: 'cd /ws/triton_vector_add',
      exampleTargetFile: targetFile,
      cdBuildCmd: 'cd /ws/triton_vector_add',
    });

    expect(cmd)
      .toContain('. /opt/cann/set_env.sh');
    expect(cmd)
      .toContain('cd /ws/triton_vector_add');
    expect(cmd)
      .toContain('msprof op simulator');
    expect(cmd)
      .toContain('--soc-version=ascend910b');
    expect(cmd)
      .toContain('python3 ./triton_vector_add.py');
    // Windows joins `.vscode/opprof` with `\`; keep the assertion OS-agnostic.
    expect(cmd)
      .toMatch(/\.vscode[/\\]opprof/);
  });

  it('buildOnBoardCommand wraps msprof op around the python entry', () => {
    const cmd = strategy.buildOnBoardCommand({
      config,
      project,
      operator,
      sourceCannCmd: '. /opt/cann/set_env.sh',
      cdCmd: 'cd /ws/triton_vector_add',
      exampleTargetFile: targetFile,
      cdBuildCmd: 'cd /ws/triton_vector_add',
    });

    expect(cmd)
      .toContain('. /opt/cann/set_env.sh');
    expect(cmd)
      .toContain('cd /ws/triton_vector_add');
    expect(cmd)
      .toContain('msprof op');
    expect(cmd).not.toContain('simulator');
    expect(cmd)
      .toContain('python3 ./triton_vector_add.py');
    expect(cmd)
      .toMatch(/\.vscode[/\\]opprof/);
  });
});
