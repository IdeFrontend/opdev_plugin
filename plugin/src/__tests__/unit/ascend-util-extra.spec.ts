/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getConfiguredValue: jest.fn(),
  getOpDevtoolsWorkspaceConfiguration: jest.fn(),
  getSocVersionWithWorkspaceOverride: jest.fn((value: string | null | undefined) => value),
  getWorkspaceSimulatorType: jest.fn(),
}));

jest.mock('@plugin/domain/utils/ascend-detection-env', () => ({
  execBashWithCannEnv: jest.fn(),
  resolveCannSetEnvScriptForDetection: jest.fn(),
}));

jest.mock('@plugin/helpers/remote-command', () => ({ getRemoteToolSeriesSync: jest.fn() }));

jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({ getGlobalEnvSnapshot: jest.fn() }));

jest.mock('@plugin/helpers/ascend-soc-warning', () => ({ maybeWarnSocNotDetected: jest.fn() }));

jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { filterSpawnEnv: jest.fn((env: unknown) => env) } }));

import {
  applyAscendPlaceholdersToScript,
  buildOperatorSpawnEnvFromResolution,
  computeAscendEnvResolution,
  enrichAscendResolutionForPlaceholders,
  getDefaultSimulatorTypeForCannSoc,
  getNpuArchForCannSoc,
  getOperatorSpawnEnv,
  getSeriesNpuArchForCannSoc,
  getSupportComputeUnitForCannSoc,
  getSupportTilingDirForCannSoc,
  getWorkspaceNpuArch,
  isSimulatorCompile,
  mergeTritonSanitizerSpawnEnv,
  normalizeCannSoc,
  patchAclnnCmakeSupportVars,
  patchCannSanitizerCmakeOptions,
  resolveAclnnCmakeDefaultsForGeneration,
  resolveAscendEnvForOperatorCommand,
  resolveEffectiveCannSoc,
  resolveRuntimeCannSoc,
  resolveSanitizerCmakeDefaultsForGeneration,
  resolveSimulatorDir,
  socFromCoreName,
  _primeSocDetectionFailedForTest,
  _resetSocDetectionCacheForTest,
  type AscendEnvResolution,
} from '@plugin/domain/utils/ascend-util';
import {
  DEFAULT_FALLBACK_CANN_SOC,
  DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME,
} from '@shared/cann-env-constants';
import {
  seriesToDefaultSoc,
  simulatorTypeToCannSocSlug,
} from '@shared/ascend-series-registry';
import { getRemoteToolSeriesSync } from '@plugin/helpers/remote-command';
import {
  getSocVersionWithWorkspaceOverride,
  getWorkspaceSimulatorType,
} from '@plugin/helpers/operator-project-workspace-config';
import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import {
  execBashWithCannEnv,
  resolveCannSetEnvScriptForDetection,
} from '@plugin/domain/utils/ascend-detection-env';
import { maybeWarnSocNotDetected } from '@plugin/helpers/ascend-soc-warning';
import { appendLog } from '@plugin/helpers/output-channel';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { TRITON_SANITIZER_SPAWN_ENV } from '@plugin/domain/constants/triton-sanitizer-env';

const execBash = execBashWithCannEnv as jest.Mock;
const resolveSetEnv = resolveCannSetEnvScriptForDetection as jest.Mock;
const remoteSeries = getRemoteToolSeriesSync as jest.Mock;
const envSnapshot = getGlobalEnvSnapshot as jest.Mock;
const workspaceSimType = getWorkspaceSimulatorType as jest.Mock;
const warnSoc = maybeWarnSocNotDetected as jest.Mock;
const filterSpawnEnv = OperatorPluginRegistry.filterSpawnEnv as jest.Mock;

function resolution(overrides: Partial<AscendEnvResolution> = {}): AscendEnvResolution {
  return {
    socVersion: 'ascend910b',
    npuArch: 'dav-2201',
    simulatorType: undefined,
    source: {
      socVersion: 'default',
      simulatorType: 'n/a',
      npuArch: 'derived-from-soc',
    },
    ...overrides,
  };
}

// jest.clearAllMocks() does not reset mockReturnValue/mockImplementation
// values, so restore the module-level defaults before every test.
beforeEach(() => {
  (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation((value: unknown) => value);
  workspaceSimType.mockReturnValue(undefined);
  envSnapshot.mockReturnValue({
    socVersion: undefined,
    simulatorType: undefined,
    npuArch: undefined,
  });
  execBash.mockReturnValue(undefined);
  resolveSetEnv.mockReturnValue(undefined);
  remoteSeries.mockReturnValue(undefined);
  warnSoc.mockResolvedValue(undefined);
});

describe('enrichAscendResolutionForPlaceholders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _primeSocDetectionFailedForTest();
  });

  it('keeps the resolution when the script has no simulator placeholder', () => {
    const base = resolution();

    expect(enrichAscendResolutionForPlaceholders({ isSimulator: false }, base, 'run {soc_version}'))
      .toBe(base);
  });

  it('keeps the resolution when the simulator type is already known', () => {
    const base = resolution({ simulatorType: 'Ascend910B3' });

    expect(enrichAscendResolutionForPlaceholders({ isSimulator: false }, base, '{simulator_type}'))
      .toBe(base);
  });

  it('fills the placeholder from the workspace simulator setting', () => {
    workspaceSimType.mockReturnValue('Ascend910B3');

    const enriched = enrichAscendResolutionForPlaceholders(
      { isSimulator: true },
      resolution(),
      '{simulator_type}',
    );

    expect(enriched.simulatorType)
      .toBe('Ascend910B3');
    expect(enriched.socVersion)
      .toBe('ascend910b');
  });

  it('fills the placeholder from the captured global simulator env', () => {
    envSnapshot.mockReturnValue({
      simulatorType: 'EnvSim',
      socVersion: undefined,
      npuArch: undefined,
    });

    const enriched = enrichAscendResolutionForPlaceholders(
      { isSimulator: true },
      resolution(),
      '{simulator_type}',
    );

    expect(enriched.simulatorType)
      .toBe('EnvSim');
  });

  it('falls back to the default simulator type for the resolved soc', () => {
    const enriched = enrichAscendResolutionForPlaceholders(
      { isSimulator: true },
      resolution(),
      '{simulator_type}',
    );

    expect(enriched.simulatorType)
      .toBe(getDefaultSimulatorTypeForCannSoc('ascend910b'));
  });
});

describe('getNpuArchForCannSoc / getSeriesNpuArchForCannSoc', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetSocDetectionCacheForTest();
    resolveSetEnv.mockReturnValue('/env.sh');
  });

  it('returns empty for a blank or unknown soc slug', () => {
    expect(getNpuArchForCannSoc(undefined))
      .toBe('');
    expect(getNpuArchForCannSoc('  '))
      .toBe('');
    expect(getNpuArchForCannSoc('nonsense-chips'))
      .toBe('');
    expect(getSeriesNpuArchForCannSoc(null))
      .toBe('');
  });

  it('returns the series arch when no chip is cached', () => {
    expect(getNpuArchForCannSoc('Ascend910B'))
      .toBe(getSeriesNpuArchForCannSoc('ascend910b'));
  });

  it('never leaks a cached chip arch across series', () => {
    // Cache an A5 chip through the real detection path.
    execBash.mockReturnValue('Ascend950PR_9589 status: running');

    computeAscendEnvResolution({ isSimulator: false });

    expect(getNpuArchForCannSoc('ascend910b'))
      .toBe(getSeriesNpuArchForCannSoc('ascend910b'));
  });

  it('uses the exact chip arch when the cached chip belongs to the resolved series', () => {
    // An A2 Pro chip caches dav-1001; the A2 slug must keep it.
    execBash.mockReturnValue('Ascend910ProA status: running');

    computeAscendEnvResolution({ isSimulator: false });

    expect(getNpuArchForCannSoc('ascend910b'))
      .toBe('dav-1001');
  });
});

describe('patch cmake placeholders', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-asc-'));
    jest.clearAllMocks();
    _primeSocDetectionFailedForTest();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('patchAclnnCmakeSupportVars is a no-op without CMakeLists.txt', () => {
    expect(() => patchAclnnCmakeSupportVars(tmpRoot, 'Ascend950'))
      .not
      .toThrow();
  });

  it('patchAclnnCmakeSupportVars replaces the support placeholders', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'CMakeLists.txt'),
      '__MSTT_SUPPORT_COMPUTE_UNIT__/__MSTT_SUPPORT_TILING_DIR__',
      'utf8',
    );

    patchAclnnCmakeSupportVars(tmpRoot, 'Ascend950');

    expect(fs.readFileSync(path.join(tmpRoot, 'CMakeLists.txt'), 'utf8'))
      .toBe(`${getSupportComputeUnitForCannSoc('Ascend950')}/${getSupportTilingDirForCannSoc('Ascend950')}`);
  });

  it('patchCannSanitizerCmakeOptions leaves files without placeholders untouched', () => {
    fs.writeFileSync(path.join(tmpRoot, 'CMakeLists.txt'), 'no placeholders here', 'utf8');

    patchCannSanitizerCmakeOptions(tmpRoot, 'Ascend910B');

    expect(fs.readFileSync(path.join(tmpRoot, 'CMakeLists.txt'), 'utf8'))
      .toBe('no placeholders here');
  });

  it('patchCannSanitizerCmakeOptions replaces A5 flags and strips the link suffix line', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'CMakeLists.txt'),
      'flags: __MSTT_SANITIZER_COMPILE_FLAGS__\n        __MSTT_SANITIZER_LINK_SUFFIX__\n',
      'utf8',
    );

    patchCannSanitizerCmakeOptions(tmpRoot, 'Ascend950');

    expect(fs.readFileSync(path.join(tmpRoot, 'CMakeLists.txt'), 'utf8'))
      .toBe('flags: -g\n');
  });

  it('patchCannSanitizerCmakeOptions replaces non-A5 flags and link suffix', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'CMakeLists.txt'),
      '__MSTT_SANITIZER_COMPILE_FLAGS__ + __MSTT_SANITIZER_LINK_SUFFIX__',
      'utf8',
    );

    patchCannSanitizerCmakeOptions(tmpRoot, 'Ascend910B');

    expect(fs.readFileSync(path.join(tmpRoot, 'CMakeLists.txt'), 'utf8'))
      .toBe('-g --cce-enable-sanitizer + --cce-enable-sanitizer');
  });
});

describe('resolveAscendEnvForOperatorCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _primeSocDetectionFailedForTest();
  });

  it('returns undefined when the user cancels the soc warning', async () => {
    warnSoc.mockResolvedValue('cancelled');

    await expect(resolveAscendEnvForOperatorCommand({ script: 'run.sh' }))
      .resolves
      .toBeUndefined();
  });

  it('returns undefined when the user opens settings', async () => {
    warnSoc.mockResolvedValue('open-settings');

    await expect(resolveAscendEnvForOperatorCommand({ script: 'run.sh' }))
      .resolves
      .toBeUndefined();
  });

  it('recomputes the resolution when the warning reports configured', async () => {
    warnSoc.mockResolvedValue('configured');

    const result = await resolveAscendEnvForOperatorCommand({ script: 'run.sh' });

    expect(result?.socVersion)
      .toBe(DEFAULT_FALLBACK_CANN_SOC);
    // Resolution is logged twice: before and after the warning.
    expect(appendLog)
      .toHaveBeenCalledWith('op-devtools/ascend-env', expect.stringContaining('Ascend Environment Resolved'));
    expect(appendLog)
      .toHaveBeenCalledTimes(2);
  });

  it('returns the resolution when the warning says continue', async () => {
    warnSoc.mockResolvedValue('continue');

    const result = await resolveAscendEnvForOperatorCommand({ script: 'run.sh' });

    expect(result?.socVersion)
      .toBe(DEFAULT_FALLBACK_CANN_SOC);
    expect(appendLog)
      .toHaveBeenCalledTimes(1);
  });
});

describe('isSimulatorCompile', () => {
  it('honors the explicit isSimulator flag, script field and --simulator script', () => {
    expect(isSimulatorCompile({ isSimulator: true }))
      .toBe(true);
    expect(isSimulatorCompile({ scriptField: 'cpu_debug_script' }))
      .toBe(true);
    expect(isSimulatorCompile({ script: 'bash build.sh --simulator' }))
      .toBe(true);
    expect(isSimulatorCompile({ script: 'bash build.sh' }))
      .toBe(false);
    expect(isSimulatorCompile({}))
      .toBe(false);
  });
});

describe('resolveRuntimeCannSoc', () => {
  it('prefers the project soc and normalizes both candidates', () => {
    expect(resolveRuntimeCannSoc(' Ascend910B ', 'Ascend950'))
      .toBe('ascend910b');
    expect(resolveRuntimeCannSoc(null, 'Ascend950'))
      .toBe('ascend950');
    expect(resolveRuntimeCannSoc('', ''))
      .toBe('');
  });
});

describe('computeAscendEnvResolution sources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetSocDetectionCacheForTest();
    resolveSetEnv.mockReturnValue('/env.sh');
  });

  it('resolves the soc from an asys probe when nothing else is configured', () => {
    execBash.mockReturnValue('Ascend910B1  status: running');

    const result = computeAscendEnvResolution({ isSimulator: false });

    expect(result.socVersion)
      .toBe('ascend910b');
    expect(result.source.socVersion)
      .toBe('detected');
  });

  it('falls back to npu-smi when asys reports nothing', () => {
    execBash.mockReturnValueOnce('no such tool')
      .mockReturnValueOnce('Ascend910B3 info: ok');

    const result = computeAscendEnvResolution({ isSimulator: false });

    expect(result.socVersion)
      .toBe('ascend910b');
    expect(result.source.socVersion)
      .toBe('detected');
  });

  it('resolves from the remote tool series when host probes fail', () => {
    execBash.mockReturnValue('no such tool');
    remoteSeries.mockReturnValue('a5');

    const result = computeAscendEnvResolution({ isSimulator: false });

    expect(result.socVersion)
      .toBe(seriesToDefaultSoc('a5'));
    expect(result.source.socVersion)
      .toBe('detected');
  });

  it('skips host detection entirely when allowHostDetection is false', () => {
    const result = computeAscendEnvResolution({ isSimulator: false }, { allowHostDetection: false });

    expect(result.socVersion)
      .toBe(DEFAULT_FALLBACK_CANN_SOC);
    expect(result.source.socVersion)
      .toBe('default');
    expect(execBash)
      .not
      .toHaveBeenCalled();
  });

  it('derives the soc from the workspace simulator type', () => {
    workspaceSimType.mockReturnValue('Ascend910B3');

    const result = computeAscendEnvResolution({ isSimulator: true });

    expect(result.socVersion)
      .toBe(simulatorTypeToCannSocSlug('Ascend910B3'));
    expect(result.source.socVersion)
      .toBe('derived-from-simulator');
    expect(result.simulatorType)
      .toBe('Ascend910B3');
  });

  it('prefers the workspace socVersion over the global env', () => {
    const { getSocVersionWithWorkspaceOverride } = jest.requireMock('@plugin/helpers/operator-project-workspace-config') as {
      getSocVersionWithWorkspaceOverride: jest.Mock;
    };

    getSocVersionWithWorkspaceOverride.mockReturnValue(' Ascend910B ');
    envSnapshot.mockReturnValue({
      socVersion: 'Ascend950',
      simulatorType: undefined,
      npuArch: undefined,
    });

    const result = computeAscendEnvResolution({ isSimulator: false });

    expect(result.socVersion)
      .toBe('ascend910b');
    expect(result.source.socVersion)
      .toBe('workspace-setting');
  });

  it('uses the global env soc when no workspace setting exists', () => {
    // The identity mock makes the workspace override empty, so the snapshot wins.
    envSnapshot.mockReturnValue({
      socVersion: 'Ascend950',
      simulatorType: undefined,
      npuArch: undefined,
    });

    const result = computeAscendEnvResolution({ isSimulator: false });

    expect(result.socVersion)
      .toBe('ascend950');
    expect(result.source.socVersion)
      .toBe('global-env');
  });

  it('defaults the simulator type from the resolved soc', () => {
    const result = computeAscendEnvResolution({ isSimulator: true });

    expect(result.simulatorType)
      .toBe(getDefaultSimulatorTypeForCannSoc(DEFAULT_FALLBACK_CANN_SOC));
    expect(result.source.simulatorType)
      .toBe('default-from-soc');
  });
});

describe('npuArch resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _primeSocDetectionFailedForTest();
  });

  it('reads the npuArch workspace setting through getConfiguredValue', () => {
    const { getConfiguredValue } = jest.requireMock('@plugin/helpers/operator-project-workspace-config') as {
      getConfiguredValue: jest.Mock;
    };

    getConfiguredValue.mockReturnValue(' dav-9000 ');

    expect(getWorkspaceNpuArch())
      .toBe('dav-9000');
  });

  it('returns empty when the npuArch setting is not set', () => {
    const { getConfiguredValue } = jest.requireMock('@plugin/helpers/operator-project-workspace-config') as {
      getConfiguredValue: jest.Mock;
    };

    getConfiguredValue.mockReturnValue(undefined);

    expect(getWorkspaceNpuArch())
      .toBe('');
  });

  it('prefers the global NPU_ARCH when the soc was not derived from the simulator', () => {
    envSnapshot.mockReturnValue({
      socVersion: undefined,
      simulatorType: undefined,
      npuArch: 'dav-9999',
    });

    const result = computeAscendEnvResolution({ isSimulator: false });

    expect(result.npuArch)
      .toBe('dav-9999');
    expect(result.source.npuArch)
      .toBe('global-env');
  });

  it('ignores the global NPU_ARCH for a soc derived from the simulator type', () => {
    workspaceSimType.mockReturnValue('Ascend910B3');
    envSnapshot.mockReturnValue({
      socVersion: undefined,
      simulatorType: undefined,
      npuArch: 'dav-9999',
    });

    const result = computeAscendEnvResolution({ isSimulator: true });

    expect(result.npuArch)
      .toBe(getNpuArchForCannSoc(simulatorTypeToCannSocSlug('Ascend910B3')));
    expect(result.source.npuArch)
      .toBe('derived-from-soc');
  });
});

describe('spawn env helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildOperatorSpawnEnvFromResolution uses the simulator type for simulator runs', () => {
    expect(buildOperatorSpawnEnvFromResolution(resolution({ simulatorType: 'Ascend910B3' }), true))
      .toEqual({
        SOC_VERSION: 'Ascend910B3',
        NPU_ARCH: 'dav-2201',
      });
    expect(buildOperatorSpawnEnvFromResolution(resolution(), false))
      .toEqual({
        SOC_VERSION: 'ascend910b',
        NPU_ARCH: 'dav-2201',
      });
  });

  it('mergeTritonSanitizerSpawnEnv merges the triton env only for triton sanitizer runs', () => {
    const base = { SOC_VERSION: 'ascend910b' };

    expect(mergeTritonSanitizerSpawnEnv(base, {
      opType: 'triton',
      sanitizerRun: true,
    }))
      .toEqual({
        ...base,
        ...TRITON_SANITIZER_SPAWN_ENV,
      });
    expect(mergeTritonSanitizerSpawnEnv(base, {
      opType: 'triton',
      sanitizerRun: false,
    }))
      .toBe(base);
    expect(mergeTritonSanitizerSpawnEnv(base, { opType: 'cann' }))
      .toBe(base);
  });

  it('getOperatorSpawnEnv filters the spawn env through the plugin registry', () => {
    filterSpawnEnv.mockReturnValue({ SOC_VERSION: 'filtered' });

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectType: 'standard-custom',
    }, resolution());

    expect(env)
      .toEqual({ SOC_VERSION: 'filtered' });
    expect(filterSpawnEnv)
      .toHaveBeenCalledWith({
        SOC_VERSION: 'ascend910b',
        NPU_ARCH: 'dav-2201',
      }, 'cann', 'standard-custom');
  });
});

describe('small helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _primeSocDetectionFailedForTest();
  });

  it('applyAscendPlaceholdersToScript substitutes both placeholders', () => {
    expect(applyAscendPlaceholdersToScript('{soc_version}/{simulator_type}', resolution()))
      .toBe('ascend910b/');
    expect(applyAscendPlaceholdersToScript('{simulator_type}', resolution({ simulatorType: 'Ascend910B3' })))
      .toBe('Ascend910B3');
  });

  it('getDefaultSimulatorTypeForCannSoc falls back for empty soc', () => {
    expect(getDefaultSimulatorTypeForCannSoc(''))
      .toBe(DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME);
  });

  it('normalizeCannSoc trims and lowercases, null stays empty', () => {
    expect(normalizeCannSoc(' Ascend950 '))
      .toBe('ascend950');
    expect(normalizeCannSoc(null))
      .toBe('');
  });

  it('socFromCoreName maps chip names and rejects blanks', () => {
    expect(socFromCoreName('Ascend910B1'))
      .toBe('ascend910b');
    expect(socFromCoreName(''))
      .toBeUndefined();
    expect(socFromCoreName(undefined))
      .toBeUndefined();
  });

  it('resolveEffectiveCannSoc and resolveSimulatorDir honor the default fallbacks', () => {
    expect(resolveEffectiveCannSoc())
      .toBe(DEFAULT_FALLBACK_CANN_SOC);
    expect(resolveSimulatorDir())
      .toBe(DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME);
  });

  it('resolveSanitizerCmakeDefaultsForGeneration alternates on A5', () => {
    expect(resolveSanitizerCmakeDefaultsForGeneration('Ascend950'))
      .toEqual({
        compileFlags: '-g',
        linkSuffix: '',
      });
    expect(resolveSanitizerCmakeDefaultsForGeneration('Ascend910B'))
      .toEqual({
        compileFlags: '-g --cce-enable-sanitizer',
        linkSuffix: '--cce-enable-sanitizer',
      });
  });

  it('resolveAclnnCmakeDefaultsForGeneration maps the soc to the aclnn constants', () => {
    expect(resolveAclnnCmakeDefaultsForGeneration('Ascend950'))
      .toEqual({
        supportComputeUnit: getSupportComputeUnitForCannSoc('Ascend950'),
        supportTilingDir: getSupportTilingDirForCannSoc('Ascend950'),
      });
    expect(getSupportComputeUnitForCannSoc(''))
      .toBe('');
  });
});
