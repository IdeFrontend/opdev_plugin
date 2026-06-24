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

const operator = {
  id: 1,
  project_id: 10,
  op_name: 'op',
  op_type: 'ascend',
  op_path: '/tmp/op',
};

function resetEnvMocks(): void {
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
}

describe('SimulatorStrategy SOC resolution', () => {
  const strategy = new SimulatorStrategy();

  beforeEach(resetEnvMocks);

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

describe('SimulatorStrategy aic-metrics SOC gating (GC-22 / plugin_release #32)', () => {
  const strategy = new SimulatorStrategy();

  beforeEach(resetEnvMocks);

  it('drops ResourceConflictRatio and PMSampling on A3 with default simulate settings (issue #32)', () => {
    // The exact field scenario from plugin_release issue #32: A3 host, default
    // simulate config (both options on). msopprof rejects ResourceConflictRatio
    // on this platform, so the plugin must emit only the mandatory PipeUtilization.
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
      .toContain('--aic-metrics=PipeUtilization');
    expect(cmd)
      .not.toContain('ResourceConflictRatio');
    expect(cmd)
      .not.toContain('PMSampling');
  });

  it('drops the optional metrics on A2 too — conservative gating until verified', () => {
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
      .toContain('--aic-metrics=PipeUtilization');
    expect(cmd)
      .not.toContain('ResourceConflictRatio');
    expect(cmd)
      .not.toContain('PMSampling');
  });

  it('always emits the mandatory PipeUtilization base metric, even with no user options', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = {
      project_id: 10,
      user_options: {},
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--aic-metrics=PipeUtilization');
    // No trailing/empty value such as `--aic-metrics= ` or a dangling comma.
    expect(cmd)
      .not.toContain('--aic-metrics= ');
    expect(cmd)
      .not.toContain('--aic-metrics=,');
  });

  it('emits PipeUtilization alone when optional metrics are disabled', () => {
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
});

describe('getSimulationAicMetrics (SOC gating + mutual exclusion)', () => {
  // An allow-list that enables both optional metrics on a single dummy SOC, so the
  // gating/mutual-exclusion branches are reachable without shipping a non-empty
  // production list. Slugs must be the lowercase normalized form (normalizeCannSoc).
  const allowBoth = {
    ResourceConflictRatio: new Set(['ascend999']),
    PMSampling: new Set(['ascend999']),
  };

  it('keeps only PipeUtilization when the SOC is not allow-listed', () => {
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
      'ascend910b',
      allowBoth,
    ))
      .toEqual(['PipeUtilization']);
  });

  it('replaces PipeUtilization with ResourceConflictRatio when allow-listed and enabled', () => {
    expect(getSimulationAicMetrics(
      { ResourceConflictRatio: true },
      'ascend999',
      allowBoth,
    ))
      .toEqual(['ResourceConflictRatio']);
  });

  it('appends PMSampling after ResourceConflictRatio when both are allow-listed and enabled', () => {
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
      'ascend999',
      allowBoth,
    ))
      .toEqual([
        'ResourceConflictRatio',
        'PMSampling',
      ]);
  });

  it('uses PipeUtilization with PMSampling when conflict ratio is off but PMSampling is allow-listed', () => {
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: false,
        PMSampling: true,
      },
      'ascend999',
      allowBoth,
    ))
      .toEqual([
        'PipeUtilization',
        'PMSampling',
      ]);
  });

  it('normalizes the SOC slug before the allow-list lookup (case/whitespace insensitive)', () => {
    expect(getSimulationAicMetrics(
      { ResourceConflictRatio: true },
      '  Ascend999 ',
      allowBoth,
    ))
      .toEqual(['ResourceConflictRatio']);
  });

  it('never emits both PipeUtilization and ResourceConflictRatio together', () => {
    const metrics = getSimulationAicMetrics(
      {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
      'ascend999',
      allowBoth,
    );

    expect(metrics)
      .toContain('ResourceConflictRatio');
    expect(metrics)
      .not.toContain('PipeUtilization');
  });

  it('gates with the empty production allow-list by default — A3 gets only PipeUtilization', () => {
    // Guards the shipped default: no SOC is allow-listed, so the issue #32 command
    // can never be regenerated regardless of user options.
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
      'ascend910_93',
    ))
      .toEqual(['PipeUtilization']);
  });
});
