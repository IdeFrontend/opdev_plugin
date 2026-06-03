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

import {
  getSocVersionWithWorkspaceOverride,
  getWorkspaceSimulatorType,
} from '@plugin/helpers/operator-project-workspace-config';
import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import { replaceOperatorScriptPlaceholders } from '@plugin/domain/utils/operator-script-placeholders';

const snapshot = (overrides: Partial<{ socVersion: string;
  simulatorType: string }> = {}) => ({
  socVersion: undefined,
  simulatorType: undefined,
  npuArch: undefined,
  ascendEnvScript: undefined,
  ...overrides,
});

describe('replaceOperatorScriptPlaceholders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('');
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => '');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot());
  });

  it('uses workspace soc and default sim for placeholders when only workspace soc is set', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => 'ascend950');

    const script = 'bash build.sh --soc={soc_version} --simulator {simulator_type}';
    const resolved = replaceOperatorScriptPlaceholders(script);

    expect(resolved)
      .toContain('--soc=ascend950');
    expect(resolved)
      .toContain('--simulator Ascend950PR_9589');
  });

  it('falls back to empty soc when nothing is set', () => {
    const script = 'bash build.sh --soc={soc_version}';
    const resolved = replaceOperatorScriptPlaceholders(script);

    expect(resolved)
      .toBe('bash build.sh --soc=');
  });

  it('workspace simulator drives SOC for {soc_version} in simulator scripts', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');

    const script = 'bash build.sh --soc={soc_version} --simulator {simulator_type}';
    const resolved = replaceOperatorScriptPlaceholders(script);

    expect(resolved)
      .toBe('bash build.sh --soc=ascend910b --simulator Ascend910B3');
  });

  it('non-simulator script uses workspace soc when set', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => 'ascend950');
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');

    const script = 'bash build.sh --pkg --soc={soc_version} --onboard';
    const resolved = replaceOperatorScriptPlaceholders(script);

    expect(resolved)
      .toBe('bash build.sh --pkg --soc=ascend950 --onboard');
  });

  it('resolves cpu-debug style --simulator from global env SOC', () => {
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot({ socVersion: 'ascend950' }));

    const script = 'bash build.sh --simulator {simulator_type}';
    const resolved = replaceOperatorScriptPlaceholders(script);

    expect(resolved)
      .toBe('bash build.sh --simulator Ascend950PR_9589');
  });
});
