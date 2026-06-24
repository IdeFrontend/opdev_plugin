jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getWorkspaceSimulatorType: jest.fn(() => 'Ascend910B3'),
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
// Populate the shared allow-list for ascend910b so the multi-metric path through
// SimulatorStrategy.generate is exercised. With the empty production list the
// strategy is always single-metric, so the `separators: { 'aic-metrics': ',' }`
// comma-join is otherwise never asserted end-to-end — a regression to a repeated
// `--aic-metrics=… --aic-metrics=…` flag would pass every other test.
jest.mock('@shared/msprof-simulator-metrics', () => ({
  ...jest.requireActual('@shared/msprof-simulator-metrics'),
  SIMULATOR_OPTIONAL_METRIC_SOCS: {
    ResourceConflictRatio: new Set(['ascend910b']),
    PMSampling: new Set(['ascend910b']),
  },
}));

import { SimulatorStrategy } from '@plugin/domain/services/profiler-service';

describe('SimulatorStrategy aic-metrics comma-join (allow-listed SOC)', () => {
  const strategy = new SimulatorStrategy();
  const operator = {
    id: 1,
    project_id: 10,
    op_name: 'op',
    op_type: 'ascend',
    op_path: '/tmp/op',
  };

  it('joins multiple allow-listed metrics into one comma-separated --aic-metrics arg', () => {
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
    // Single comma-joined argument, NOT a repeated flag.
    expect(cmd)
      .not.toContain('--aic-metrics=ResourceConflictRatio --aic-metrics=PMSampling');
  });
});
