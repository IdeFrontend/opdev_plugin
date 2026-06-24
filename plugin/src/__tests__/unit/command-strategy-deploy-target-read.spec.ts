import * as vscode from 'vscode';

import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import { PyAscCommandStrategy } from '@plugin/domain/services/command-strategy/pyasc-strategy';
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import { ConfigService } from '@plugin/service/config-service';
import { getConfig, getConfigById } from '@plugin/domain/services/configuration';

jest.mock('@plugin/domain/services/configuration', () => ({
  getConfig: jest.fn(),
  getConfigById: jest.fn(),
}));

describe('command strategy deploy vs profiler target reads', () => {
  const getStore: Record<string, unknown> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(getStore).forEach((k) => delete getStore[k]);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(),
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
  });

  it('getRunTargetFile reads deploy target from workspace only', () => {
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'python run.py';
    const strategy = new CannCommandStrategy();
    const config = {
      project_id: 1,
      op: 'myop',
      target_file: 'stale-db-target',
    } as Parameters<CannCommandStrategy['getRunTargetFile']>[0];

    expect(strategy.getRunTargetFile(config, null)).toBe('python run.py');
  });

  it('Cann getProfilerTargetFile reads build_op target from legacy DB', () => {
    (getConfig as jest.Mock).mockReturnValue([{ target_file: 'build_out/*.run' }]);
    const strategy = new CannCommandStrategy();
    const config = { project_id: 1, op: 'myop' } as Parameters<CannCommandStrategy['getProfilerTargetFile']>[0];

    expect(strategy.getProfilerTargetFile(config, null, 99)).toBe('build_out/*.run');
    expect(getConfig).toHaveBeenCalledWith(1, 'build_op', 'myop');
  });

  it('Ascend getProfilerTargetFile reads build_example target from legacy DB by id', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      target_file: '/ws/op/build/test_aclnn_myop',
    });
    const strategy = new AscendCommandStrategy();
    const config = { project_id: 1, op: 'myop' } as Parameters<AscendCommandStrategy['getProfilerTargetFile']>[0];

    expect(strategy.getProfilerTargetFile(config, null, 42)).toBe('/ws/op/build/test_aclnn_myop');
    expect(getConfigById).toHaveBeenCalledWith(42);
  });

  it('Triton getProfilerTargetFile reads build_op target from legacy DB', () => {
    (getConfig as jest.Mock).mockReturnValue([{ target_file: 'python3 ./triton_vector_add.py' }]);
    const strategy = new TritonCommandStrategy();
    const config = { project_id: 1, op: 'myop' } as Parameters<TritonCommandStrategy['getProfilerTargetFile']>[0];

    expect(strategy.getProfilerTargetFile(config, null, 1)).toBe('python3 ./triton_vector_add.py');
    expect(getConfig).toHaveBeenCalledWith(1, 'build_op', 'myop');
  });

  it('PyAsc getProfilerTargetFile reads build_op target from legacy DB', () => {
    (getConfig as jest.Mock).mockReturnValue([{ target_file: 'python app.py' }]);
    const strategy = new PyAscCommandStrategy();
    const config = { project_id: 1, op: 'myop' } as Parameters<PyAscCommandStrategy['getProfilerTargetFile']>[0];

    expect(strategy.getProfilerTargetFile(config, null, 1)).toBe('python app.py');
  });

  it('returns empty deploy target when workspace setting is unset', () => {
    const strategy = new CannCommandStrategy();
    const config = { project_id: 1, op: 'x' } as Parameters<CannCommandStrategy['getRunTargetFile']>[0];
    expect(strategy.getRunTargetFile(config, null)).toBe('');
    expect(ConfigService.readBuildOpDeployTargetFromWorkspace()).toBeUndefined();
  });
});
