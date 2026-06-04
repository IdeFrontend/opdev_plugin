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
import {
  applyOperatorNamesPlaceholder,
  replaceOperatorScriptPlaceholders,
} from '@plugin/domain/utils/operator-script-placeholders';

const snapshot = (overrides: Partial<{ socVersion: string;
  simulatorType: string }> = {}) => ({
  socVersion: undefined,
  simulatorType: undefined,
  npuArch: undefined,
  ascendEnvScript: undefined,
  ...overrides,
});

describe('applyOperatorNamesPlaceholder', () => {
  it('removes --ops={operatorNames} when no operator is selected', () => {
    const script = 'bash build.sh --soc={soc_version} --ops={operatorNames} -u';
    expect(applyOperatorNamesPlaceholder(script))
      .toBe('bash build.sh --soc={soc_version} -u');
  });

  it('substitutes operator names into --ops={operatorNames}', () => {
    const script = 'bash build.sh --ops={operatorNames} --debug';
    expect(applyOperatorNamesPlaceholder(script, 'add,sub'))
      .toBe('bash build.sh --ops=add,sub --debug');
  });

  it('appends --ops for legacy standard-custom script without placeholder', () => {
    const script = 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom --onboard';
    expect(applyOperatorNamesPlaceholder(script, 'add'))
      .toBe('bash build.sh --pkg --soc={soc_version} --vendor_name=custom --ops=add --onboard');
  });

  it('does not append --ops for plain cann-style scripts', () => {
    expect(applyOperatorNamesPlaceholder('bash build.sh --onboard', 'add'))
      .toBe('bash build.sh --onboard');
  });

  it('does not duplicate --ops when placeholder is already present', () => {
    const script = 'bash build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}';
    expect(applyOperatorNamesPlaceholder(script, 'add').match(/--ops=/g)?.length)
      .toBe(1);
  });
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
