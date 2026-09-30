/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getOpDevtoolsWorkspaceConfiguration: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getOpDevtoolsWorkspaceConfiguration,
  getConfiguredValue: jest.requireActual('@plugin/helpers/operator-project-workspace-config').getConfiguredValue,

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
import type { AscendEnvResolution } from '@plugin/domain/utils/ascend-util';
import {
  applyOperatorNamesPlaceholder,
  ensureStandardCustomSocFlag,
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

  it('appends --ops for a stored standard-custom script without placeholder', () => {
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

    expect(applyOperatorNamesPlaceholder(script, 'add')
      .match(/--ops=/g)?.length)
      .toBe(1);
  });

  it('trims whitespace around the operator names', () => {
    const script = 'bash build.sh --ops={operatorNames} --debug';

    expect(applyOperatorNamesPlaceholder(script, '  add,sub  '))
      .toBe('bash build.sh --ops=add,sub --debug');
  });

  it('removes a bare {operatorNames} token when it is not part of --ops', () => {
    const script = 'bash build.sh --label={operatorNames} --ops={operatorNames}';

    expect(applyOperatorNamesPlaceholder(script))
      .toBe('bash build.sh --label=');
  });

  it('appends --ops after --pkg for a stored script without the placeholder', () => {
    expect(applyOperatorNamesPlaceholder('bash build.sh --pkg --onboard', 'add'))
      .toBe('bash build.sh --pkg --ops=add --onboard');
  });

  it('appends --ops before -u for an Ascend UT-style stored script', () => {
    expect(applyOperatorNamesPlaceholder('bash build.sh --soc=ascend910b -u', 'add'))
      .toBe('bash build.sh --soc=ascend910b --ops=add -u');
  });

  it('does not append --ops when the substituted script lacks --ops but is not standard-custom', () => {
    expect(applyOperatorNamesPlaceholder('bash build.sh --label={operatorNames}', 'add'))
      .toBe('bash build.sh --label=add');
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

  it('uses a precomputed resolution verbatim when provided', () => {
    const resolution: AscendEnvResolution = {
      socVersion: 'ascend910b',
      npuArch: 'dav-1001',
      simulatorType: 'Ascend910B3',
      source: {
        socVersion: 'workspace-setting',
        simulatorType: 'workspace-setting',
        npuArch: 'derived-from-soc',
      },
    };

    expect(replaceOperatorScriptPlaceholders(
      'bash build.sh --soc={soc_version} --simulator {simulator_type}',
      resolution,
    ))
      .toBe('bash build.sh --soc=ascend910b --simulator Ascend910B3');
  });

  it('substitutes an empty simulator from a resolution without simulatorType', () => {
    const resolution: AscendEnvResolution = {
      socVersion: 'ascend910b',
      npuArch: '',
      simulatorType: undefined,
      source: {
        socVersion: 'workspace-setting',
        simulatorType: 'n/a',
        npuArch: 'derived-from-soc',
      },
    };

    expect(replaceOperatorScriptPlaceholders(
      'bash build.sh --simulator {simulator_type}',
      resolution,
    ))
      .toBe('bash build.sh --simulator ');
  });
});

describe('ensureStandardCustomSocFlag (run_example --soc insertion)', () => {
  it('inserts --soc={soc_version} into a standard-custom run_example script that lacks --soc', () => {
    expect(ensureStandardCustomSocFlag('bash build.sh --vendor_name=custom --run_example'))
      .toBe('bash build.sh --soc={soc_version} --vendor_name=custom --run_example');
  });

  it('is a no-op when --soc is already present', () => {
    const script = 'bash build.sh --soc=ascend910_93 --vendor_name=custom --run_example';

    expect(ensureStandardCustomSocFlag(script))
      .toBe(script);
  });

  it('is a no-op for non standard-custom scripts (no --vendor_name=custom)', () => {
    expect(ensureStandardCustomSocFlag('bash build.sh --run_example'))
      .toBe('bash build.sh --run_example');
  });
});
