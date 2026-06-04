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

  it('passes the CANN SOC slug (not the simulator device) from global env', () => {
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
      .toContain('--soc-version=ascend950');
  });

  it('passes the CANN SOC slug derived from a workspace simulatorType', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    const config = {
      project_id: 10,
      user_options: { PMSampling: true },
    };

    const cmd = strategy.generate(config as any, operator as any, '/tmp/op.bin');

    expect(cmd)
      .toContain('--soc-version=ascend910b');
  });

  it('passes ascend910_93 from the workspace SOC setting (issue #18 regression)', () => {
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
      .toContain('--soc-version=ascend910_93');
  });
});
