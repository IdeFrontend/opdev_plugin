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

import {
  getSocVersionWithWorkspaceOverride,
  getWorkspaceSimulatorType,
} from '@plugin/helpers/operator-project-workspace-config';
import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import {
  getNpuArchForCannSoc,
  getOperatorSpawnEnv,
  isSimulatorCompile,
  resolveAscendEnv,
  resolveEffectiveCannSoc,
  resolveSimulatorDir,
  simulatorTypeToCannSoc,
} from '@plugin/domain/utils/ascend-util';

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

  it('non-sim ascend spawn also emits NPU_ARCH (always derived from SOC)', () => {
    (getSocVersionWithWorkspaceOverride as jest.Mock).mockImplementation(() => 'ascend950');

    const env = getOperatorSpawnEnv({
      opType: 'ascend',
      projectId: 1,
      configType: 'build_op',
      script: 'bash build.sh --pkg --soc=ascend950',
    });

    expect(env)
      .toEqual({
        SOC_VERSION: 'ascend950',
        NPU_ARCH: 'dav-3510',
      });
  });

  it('sim spawn with workspace simulator derives matching SOC and NPU_ARCH', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend910B3');

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectId: 1,
      configType: 'simulate',
      script: 'bash build.sh --simulator {simulator_type}',
    });

    expect(env)
      .toEqual({
        SIMULATOR_TYPE: 'Ascend910B3',
        NPU_ARCH: 'dav-2201',
        SOC_VERSION: 'ascend910b',
      });
  });

  it('sim spawn with workspace simulator targeting A5 derives ascend950', () => {
    (getWorkspaceSimulatorType as jest.Mock).mockReturnValue('Ascend950PR_9589');

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectId: 1,
      configType: 'simulate',
      script: 'bash build.sh --simulator {simulator_type}',
    });

    expect(env)
      .toEqual({
        SIMULATOR_TYPE: 'Ascend950PR_9589',
        NPU_ARCH: 'dav-3510',
        SOC_VERSION: 'ascend950',
      });
  });

  it('sim spawn without workspace setting falls back to global env SOC then default sim', () => {
    (getGlobalEnvSnapshot as jest.Mock).mockReturnValue(snapshot({ socVersion: 'ascend950' }));

    const env = getOperatorSpawnEnv({
      opType: 'cann',
      projectId: 1,
      configType: 'simulate',
      script: 'bash build.sh --simulator {simulator_type}',
    });

    expect(env)
      .toEqual({
        SIMULATOR_TYPE: 'Ascend950PR_9589',
        NPU_ARCH: 'dav-3510',
        SOC_VERSION: 'ascend950',
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
});
