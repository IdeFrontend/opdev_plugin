jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getWorkspaceSimulatorType: jest.fn(() => ''),
  getSocVersionWithWorkspaceOverride: jest.fn(),
}));
jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({
  getGlobalEnvSnapshot: jest.fn(() => ({
    socVersion: undefined,
    simulatorType: undefined,
    npuArch: undefined,
    ascendEnvScript: undefined,
  })),
}));

import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  getSocVersionWithWorkspaceOverride,
  getWorkspaceSimulatorType,
} from '@plugin/helpers/operator-project-workspace-config';
import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import {
  _primeSocDetectionFailedForTest,
  _resetSocDetectionCacheForTest,
  buildOperatorSpawnEnvFromResolution,
  getNpuArchForCannSoc,
  getOperatorSpawnEnv,
  getSupportComputeUnitForCannSoc,
  getSupportTilingDirForCannSoc,
  isSimulatorCompile,
  resolveAscendEnv,
  resolveEffectiveCannSoc,
  resolveSimulatorDir,
  simulatorTypeToCannSoc,
} from '@plugin/domain/utils/ascend-util';
import { cacheDetectedChipName } from '@shared/ascend-series-registry';
import { NPU_ARCH_DAV_1001 } from '@shared/cann-env-constants';
import { _resetSocUndetectedWarningForTest } from '@plugin/helpers/ascend-soc-warning';
import {
  SUPPORT_COMPUTE_UNIT_ASCEND_910_95,
  SUPPORT_COMPUTE_UNIT_ASCEND_950,
  SUPPORT_TILING_DIR_ARCH22,
  SUPPORT_TILING_DIR_ARCH35,
} from '@shared/cann-aclnn-build-defaults';
import * as fs from 'fs';
import * as path from 'path';

const snapshot = (overrides: Partial<{
  socVersion: string;
  simulatorType: string;
  npuArch: string;
  ascendEnvScript: string;
}> = {}) => ({
  socVersion: undefined,
  simulatorType: undefined,
  npuArch: undefined,
  ascendEnvScript: undefined,
  ...overrides,
});

describe('operator spawn env', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
    _resetSocDetectionCacheForTest();
    _primeSocDetectionFailedForTest();
    _resetSocUndetectedWarningForTest();
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('');
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => '');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot());
  });

  it('resolveSimulatorDir prefers workspace simulatorType', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');

    expect(resolveSimulatorDir())
      .toBe('Ascend910B3');
  });

  it('resolveSimulatorDir uses fallback name when SOC is unresolved', () => {
    expect(resolveSimulatorDir())
      .toBe('');
  });

  it('simulatorTypeToCannSoc inverts the default sim map', () => {
    expect(simulatorTypeToCannSoc('Ascend950PR_9589'))
      .toBe('ascend950');
    expect(simulatorTypeToCannSoc('Ascend910B3'))
      .toBe('ascend910b');
    expect(simulatorTypeToCannSoc('totally-unknown'))
      .toBeUndefined();
  });

  it('getNpuArchForCannSoc is the single source for NPU arch', () => {
    expect(getNpuArchForCannSoc('ascend950'))
      .toBe('dav-3510');
    expect(getNpuArchForCannSoc('ascend910b'))
      .toBe('dav-2201');
    expect(getNpuArchForCannSoc(''))
      .toBe('');
    expect(getNpuArchForCannSoc(null))
      .toBe('');
  });

  it('getNpuArchForCannSoc uses dav-1001 when cached chip is Pro/Premium/901', () => {
    cacheDetectedChipName('Ascend910ProA');
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => 'ascend910b');

    expect(getNpuArchForCannSoc('ascend910b'))
      .toBe(NPU_ARCH_DAV_1001);

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectType: OperatorProjectType.ASCEND_C,
      projectId: 1,
      configType: 'build_op',
      script: 'bash build.sh --onboard',
    });

    expect(env.NPU_ARCH)
      .toBe(NPU_ARCH_DAV_1001);
  });

  it('unresolved SOC emits empty spawn env (no silent 910-class defaults)', () => {
    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectType: OperatorProjectType.ASCEND_C,
      projectId: 1,
      configType: 'build_op',
      script: 'bash build.sh --onboard',
    });

    expect(env)
      .toEqual({});
  });

  it('getSupportComputeUnitForCannSoc and getSupportTilingDirForCannSoc map A2/A3 vs A5', () => {
    expect(getSupportComputeUnitForCannSoc('ascend910b'))
      .toBe(SUPPORT_COMPUTE_UNIT_ASCEND_910_95);
    expect(getSupportTilingDirForCannSoc('ascend910b'))
      .toBe(SUPPORT_TILING_DIR_ARCH22);
    expect(getSupportComputeUnitForCannSoc('ascend950'))
      .toBe(SUPPORT_COMPUTE_UNIT_ASCEND_950);
    expect(getSupportTilingDirForCannSoc('ascend950'))
      .toBe(SUPPORT_TILING_DIR_ARCH35);
  });

  it('resolveEffectiveCannSoc uses explicit workspace soc', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => 'ascend910b');

    expect(resolveEffectiveCannSoc())
      .toBe('ascend910b');
  });

  it('non-sim cann spawn always emits SOC_VERSION and NPU_ARCH from the same SOC', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => 'ascend950');

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectType: OperatorProjectType.ASCEND_C,
      projectId: 1,
      configType: 'build_op',
      script: 'bash build.sh --onboard',
    });

    expect(env)
      .toEqual({
        SOC_VERSION: 'ascend950',
        NPU_ARCH: 'dav-3510',
      });
  });

  it('standard-custom ascend spawn does not export SOC_VERSION or NPU_ARCH', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => 'ascend950');

    const env = getOperatorSpawnEnv({
      opType: 'ascend',
      projectType: OperatorProjectType.STANDARD_CUSTOM,
      projectId: 1,
      configType: 'build_op',
      script: 'bash build.sh --pkg --soc=ascend950',
    });

    expect(env)
      .toEqual({});
  });

  it('sim spawn sets SOC_VERSION to simulator device dir and NPU_ARCH from resolved slug', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectType: OperatorProjectType.ASCEND_C,
      projectId: 1,
      configType: 'simulate',
      script: 'bash build.sh --simulator {simulator_type}',
    });

    expect(env)
      .toEqual({
        SOC_VERSION: 'Ascend910B3',
        NPU_ARCH: 'dav-2201',
      });
  });

  it('sim spawn with workspace simulator targeting A5 uses device dir in SOC_VERSION', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend950PR_9589');

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectType: OperatorProjectType.ASCEND_C,
      projectId: 1,
      configType: 'simulate',
      script: 'bash build.sh --simulator {simulator_type}',
    });

    expect(env)
      .toEqual({
        SOC_VERSION: 'Ascend950PR_9589',
        NPU_ARCH: 'dav-3510',
      });
  });

  it('sim spawn without workspace setting falls back to global env SOC then default sim dir', () => {
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot({ socVersion: 'ascend950' }));

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectType: OperatorProjectType.ASCEND_C,
      projectId: 1,
      configType: 'simulate',
      script: 'bash build.sh --simulator {simulator_type}',
    });

    expect(env)
      .toEqual({
        SOC_VERSION: 'Ascend950PR_9589',
        NPU_ARCH: 'dav-3510',
      });
  });

  it('SOC chain falls through workspace → global env → default', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => 'ascend910b');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot({ socVersion: 'ascend310p' }));
    expect(resolveAscendEnv({ isSimulator: false }).socVersion)
      .toBe('ascend910b');

    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => '');
    expect(resolveAscendEnv({ isSimulator: false }).socVersion)
      .toBe('ascend310p');

    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot());
    expect(resolveAscendEnv({ isSimulator: false }).socVersion)
      .toBe('');
    expect(resolveAscendEnv({ isSimulator: false }).source.socVersion)
      .toBe('default');
  });

  it('SIMULATOR_TYPE precedence: workspace → global env → default-from-soc', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');
    let r = resolveAscendEnv({ isSimulator: true });

    expect(r.simulatorType)
      .toBe('Ascend910B3');
    expect(r.source.simulatorType)
      .toBe('workspace-setting');
    expect(r.source.socVersion)
      .toBe('derived-from-simulator');

    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('');
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot({
      simulatorType: 'Ascend910B3',
      socVersion: 'ascend950',
    }));
    r = resolveAscendEnv({ isSimulator: true });
    expect(r.simulatorType)
      .toBe('Ascend910B3');
    expect(r.source.simulatorType)
      .toBe('global-env');
    expect(r.socVersion)
      .toBe('ascend950');
    expect(r.source.socVersion)
      .toBe('global-env');

    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot());
    r = resolveAscendEnv({ isSimulator: true });
    expect(r.simulatorType)
      .toBe('');
    expect(r.source.simulatorType)
      .toBe('default-from-soc');
  });

  it('isSimulatorCompile detects --simulator in script', () => {
    expect(isSimulatorCompile({ script: 'bash build.sh --simulator Ascend910B3' }))
      .toBe(true);
    expect(isSimulatorCompile({ script: 'bash build.sh --onboard' }))
      .toBe(false);
  });

  it('buildOperatorSpawnEnvFromResolution uses simulator dir as SOC_VERSION for sim runs', () => {
    const env = buildOperatorSpawnEnvFromResolution({
      socVersion: 'ascend950',
      npuArch: 'dav-3510',
      simulatorType: 'Ascend950PR_9589',
      source: {
        socVersion: 'derived-from-simulator',
        simulatorType: 'workspace-setting',
        npuArch: 'derived-from-soc',
      },
    }, true);

    expect(env)
      .toEqual({
        SOC_VERSION: 'Ascend950PR_9589',
        NPU_ARCH: 'dav-3510',
      });
  });

  it('ascend add_custom CMakeLists uses generation placeholders', () => {
    const cmakePath = path.join(
      __dirname,
      '../../../templates/code_template/ascend_template/add_custom/CMakeLists.txt',
    );
    const cmake = fs.readFileSync(cmakePath, 'utf8');

    expect(cmake).toContain('set(SUPPORT_COMPUTE_UNIT "__MSTT_SUPPORT_COMPUTE_UNIT__")');
    expect(cmake).toContain('set(SUPPORT_TILING_DIR "__MSTT_SUPPORT_TILING_DIR__")');
    expect(cmake).not.toContain('ENV{SUPPORT_COMPUTE_UNIT}');
    expect(cmake).not.toContain('ENV{SUPPORT_TILING_DIR}');
  });
});
