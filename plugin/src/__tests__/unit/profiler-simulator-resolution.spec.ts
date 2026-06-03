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
import { getWorkspaceSimulatorType } from '@plugin/helpers/operator-project-workspace-config';
import { SimulatorStrategy } from '@plugin/domain/services/profiler-service';

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
    jest.clearAllMocks();
  });

  it('derives msprof --soc-version from global env SOC when simulatorType is absent', () => {
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
  });

  it('uses workspace simulatorType for msprof --soc-version', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = {
      project_id: 10,
      user_options: { PMSampling: true },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=Ascend910B3');
  });
});
