jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getOpDevtoolsWorkspaceConfiguration: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getOpDevtoolsWorkspaceConfiguration,
  getConfiguredValue: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getConfiguredValue,

  getFirstWorkspaceFolderPath: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getFirstWorkspaceFolderPath,
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
import { isSimulatorOptionalMetricSupported } from '@shared/msprof-simulator-metrics';
import type { SimulateConfig } from '@plugin/service/config-service';

const operator = {
  id: 1,
  project_id: 10,
  op_name: 'op',
  op_type: 'ascend',
  op_path: '/tmp/op',
};

// The fresh-project simulate DAO seed (getSimulateConfig defaults branch).
function simulateConfig(overrides: Partial<SimulateConfig> = {}): SimulateConfig {
  return {
    script: '',
    simulatorType: '',
    memoryThroughputWaveform: false,
    resourceConflictRatio: true,
    advanceParam: [],
    fileMapList: [],
    ...overrides,
  };
}

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
    const config = simulateConfig({ memoryThroughputWaveform: true });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend950PR_9589');
    expect(cmd)
      .not.toContain('--soc-version=ascend950');
  });

  it('passes the workspace simulator directory (not the CANN slug)', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = simulateConfig({ memoryThroughputWaveform: true });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend910B3');
    expect(cmd)
      .not.toContain('--soc-version=ascend910b');
  });

  it('passes the default A3 simulator directory when workspace SOC is ascend910_93', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910_93');
    const config = simulateConfig({
      resourceConflictRatio: true,
      memoryThroughputWaveform: true,
    });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend910_9362');
    expect(cmd)
      .not.toContain('--soc-version=ascend910_93');
  });
});

describe('SimulatorStrategy aic-metrics SOC gating (GC-22)', () => {
  const strategy = new SimulatorStrategy();

  beforeEach(resetEnvMocks);

  it('drops ResourceConflictRatio and PMSampling on A3 with default simulate settings', () => {
    // A3 host, default simulate config (both options on). msopprof rejects
    // ResourceConflictRatio on this platform, so the plugin must emit only the
    // mandatory PipeUtilization.
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockReturnValue('ascend910_93');
    const config = simulateConfig({
      resourceConflictRatio: true,
      memoryThroughputWaveform: true,
    });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend910_9362');
    expect(cmd)
      .toContain('--aic-metrics=PipeUtilization');
    expect(cmd)
      .not.toContain('ResourceConflictRatio');
    expect(cmd)
      .not.toContain('PMSampling');
  });

  it('drops the optional metrics on A2 too — conservative gating until verified', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = simulateConfig({
      resourceConflictRatio: true,
      memoryThroughputWaveform: true,
    });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

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
    const config = simulateConfig({ resourceConflictRatio: false });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

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
    const config = simulateConfig({
      resourceConflictRatio: false,
      memoryThroughputWaveform: false,
    });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

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

  it('gates A3 with production allow-list — ascend910_93 not allow-listed (GC-22)', () => {
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

describe('getSimulationAicMetrics (production allow-list — A5 ascend950 §8.1)', () => {
  it('emits ResourceConflictRatio for A5 defaults (RC on, PMSampling off)', () => {
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: true,
        PMSampling: false,
      },
      'ascend950',
    ))
      .toEqual(['ResourceConflictRatio']);
  });

  it('appends PMSampling when both enabled on allow-listed A5', () => {
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
      'ascend950',
    ))
      .toEqual([
        'ResourceConflictRatio',
        'PMSampling',
      ]);
  });

  it('falls back to PipeUtilization when ResourceConflictRatio is unchecked on A5', () => {
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: false,
        PMSampling: false,
      },
      'ascend950',
    ))
      .toEqual(['PipeUtilization']);
  });

  it('appends PMSampling to PipeUtilization when RC off and PMSampling on (A5)', () => {
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: false,
        PMSampling: true,
      },
      'ascend950',
    ))
      .toEqual([
        'PipeUtilization',
        'PMSampling',
      ]);
  });

  it('keeps A2 on PipeUtilization only — ascend910b not in production allow-list', () => {
    expect(getSimulationAicMetrics(
      {
        ResourceConflictRatio: true,
        PMSampling: true,
      },
      'ascend910b',
    ))
      .toEqual(['PipeUtilization']);
  });

  it('getSimulatorSupportedMetrics equivalent — both true on A5, false on A2/A3', () => {
    expect(isSimulatorOptionalMetricSupported('ResourceConflictRatio', 'ascend950'))
      .toBe(true);
    expect(isSimulatorOptionalMetricSupported('PMSampling', 'ascend950'))
      .toBe(true);
    expect(isSimulatorOptionalMetricSupported('ResourceConflictRatio', 'ascend910b'))
      .toBe(false);
    expect(isSimulatorOptionalMetricSupported('PMSampling', 'ascend910_93'))
      .toBe(false);
  });
});

describe('SimulatorStrategy A5 production allow-list (§8.1)', () => {
  const strategy = new SimulatorStrategy();

  beforeEach(resetEnvMocks);

  it('emits ResourceConflictRatio for A5 default simulate settings', () => {
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      socVersion: 'ascend950',
      simulatorType: undefined,
      npuArch: undefined,
      ascendEnvScript: undefined,
    });
    const config = simulateConfig({
      resourceConflictRatio: true,
      memoryThroughputWaveform: false,
    });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend950PR_9589');
    expect(cmd)
      .toContain('--aic-metrics=ResourceConflictRatio');
    expect(cmd)
      .not.toContain('PipeUtilization');
    expect(cmd)
      .not.toContain('PMSampling');
  });

  it('appends PMSampling when enabled on A5', () => {
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue({
      socVersion: 'ascend950',
      simulatorType: undefined,
      npuArch: undefined,
      ascendEnvScript: undefined,
    });
    const config = simulateConfig({
      resourceConflictRatio: true,
      memoryThroughputWaveform: true,
    });

    const cmd = strategy.generate(config, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('ResourceConflictRatio');
    expect(cmd)
      .toContain('PMSampling');
  });
});
