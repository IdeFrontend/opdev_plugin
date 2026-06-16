jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getWorkspaceSimulatorType: jest.fn(() => ''),
  getSocVersionWithWorkspaceOverride: jest.fn(() => ''),
}));
jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({
  getGlobalEnvSnapshot: jest.fn(() => ({
    socVersion: undefined,
    simulatorType: undefined,
    npuArch: undefined,
    ascendEnvScript: undefined,
  })),
}));

import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import {
  getWorkspaceSimulatorType,
  getSocVersionWithWorkspaceOverride,
} from '@plugin/helpers/operator-project-workspace-config';
import {
  SimulatorStrategy,
  getSimulationAicMetrics,
} from '@plugin/domain/services/profiler-service';

describe('SimulatorStrategy SOC resolution', () => {
  const strategy = new SimulatorStrategy();
  const operator = {
    id: 1,
    project_id: 10,
    op_name: 'op',
    op_type: 'ascend',
    op_path: '/tmp/op',
  };

  beforeEach(() => {
    // clearAllMocks resets call records but NOT mockReturnValue, so re-establish
    // the factory defaults each test to prevent leakage across tests in file order
    // (e.g. an explicit simulatorType from one test driving SOC in the next).
    jest.clearAllMocks();
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('');
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      socVersion: undefined,
      simulatorType: undefined,
      npuArch: undefined,
      ascendEnvScript: undefined,
    });
  });

  it('passes the default simulator directory for A5 from global env SOC', () => {
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      socVersion: 'ascend950',
      simulatorType: undefined,
      npuArch: undefined,
      ascendEnvScript: undefined,
    });
    const config = {
      project_id: 10,
      user_options: { PMSampling: true },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend950PR_9589');
    expect(cmd)
      .not.toContain('--soc-version=ascend950');
  });

  it('passes the workspace simulator directory (not the CANN slug)', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = {
      project_id: 10,
      user_options: { PMSampling: true },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend910B3');
    expect(cmd)
      .not.toContain('--soc-version=ascend910b');
  });

  it('passes the default A3 simulator directory when workspace SOC is ascend910_93', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910_93');
    const config = {
      project_id: 10,
      user_options: {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend910C');
    expect(cmd)
      .not.toContain('--soc-version=ascend910_93');
  });
});

describe('SimulatorStrategy aic-metrics', () => {
  const strategy = new SimulatorStrategy();
  const operator = {
    id: 1,
    project_id: 10,
    op_name: 'op',
    op_type: 'ascend',
    op_path: '/tmp/op',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('');
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      socVersion: undefined,
      simulatorType: undefined,
      npuArch: undefined,
      ascendEnvScript: undefined,
    });
  });

  it('omits PipeUtilization when ResourceConflictRatio is enabled (msprof mutual exclusion)', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = {
      project_id: 10,
      user_options: {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend910B3');
    expect(cmd)
      .toContain('--aic-metrics=ResourceConflictRatio,PMSampling');
    expect(cmd)
      .not.toContain('PipeUtilization');
  });

  it('uses PipeUtilization when ResourceConflictRatio is disabled', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = {
      project_id: 10,
      user_options: {
        ResourceConflictRatio: false,
        PMSampling: true,
      },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--aic-metrics=PipeUtilization,PMSampling');
    expect(cmd)
      .not.toContain('ResourceConflictRatio');
  });

  it('uses PipeUtilization alone when optional metrics are disabled', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = {
      project_id: 10,
      user_options: {
        ResourceConflictRatio: false,
        PMSampling: false,
      },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--aic-metrics=PipeUtilization');
    expect(cmd)
      .not.toContain('ResourceConflictRatio');
    expect(cmd)
      .not.toContain('PMSampling');
  });

  it('emits ResourceConflictRatio and PMSampling on A3 with default simulate settings', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910_93');
    const config = {
      project_id: 10,
      user_options: {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend910C');
    expect(cmd)
      .toContain('--aic-metrics=ResourceConflictRatio,PMSampling');
    expect(cmd)
      .not.toContain('PipeUtilization');
  });
});

describe('getSimulationAicMetrics (mutual exclusion)', () => {
  it('replaces PipeUtilization with ResourceConflictRatio when enabled', () => {
    expect(getSimulationAicMetrics({ ResourceConflictRatio: true }))
      .toEqual(['ResourceConflictRatio']);
  });

  it('appends PMSampling after ResourceConflictRatio when both are enabled', () => {
    expect(getSimulationAicMetrics({
      ResourceConflictRatio: true,
      PMSampling: true,
    }))
      .toEqual([
        'ResourceConflictRatio',
        'PMSampling',
      ]);
  });

  it('uses PipeUtilization with PMSampling when conflict ratio is off', () => {
    expect(getSimulationAicMetrics({
      ResourceConflictRatio: false,
      PMSampling: true,
    }))
      .toEqual([
        'PipeUtilization',
        'PMSampling',
      ]);
  });

  it('never emits both PipeUtilization and ResourceConflictRatio together', () => {
    const metrics = getSimulationAicMetrics({
      ResourceConflictRatio: true,
      PMSampling: true,
    });

    expect(metrics)
      .toContain('ResourceConflictRatio');
    expect(metrics)
      .not.toContain('PipeUtilization');
  });
});
