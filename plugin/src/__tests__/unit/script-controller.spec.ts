const mockResolveEffectiveCannSoc = jest.fn();
const mockResolveAscendEnv = jest.fn();
const mockIsNpuHardwareProbeAvailable = jest.fn();
const mockStartNpuHardwareProbe = jest.fn();
const mockStartRemoteNpuHardwareProbe = jest.fn();
const mockIsSimulatorOptionalMetricSupported = jest.fn();

jest.mock('@plugin/domain/utils/ascend-util', () => ({
  resolveAscendEnv: mockResolveAscendEnv,
  resolveEffectiveCannSoc: mockResolveEffectiveCannSoc,
}));

jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({
  isNpuHardwareProbeAvailable: mockIsNpuHardwareProbeAvailable,
  startNpuHardwareProbe: mockStartNpuHardwareProbe,
  startRemoteNpuHardwareProbe: mockStartRemoteNpuHardwareProbe,
}));

jest.mock('@shared/msprof-simulator-metrics', () => ({ isSimulatorOptionalMetricSupported: mockIsSimulatorOptionalMetricSupported }));

import { scriptMethods } from '@plugin/controller/script-controller';

describe('scriptMethods.getProjectEnv', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveEffectiveCannSoc.mockReturnValue('ascend910b');
  });

  it('returns the effective Cann SoC resolved for the project environment', async () => {
    await expect(scriptMethods.getProjectEnv())
      .resolves
      .toEqual({ socVersion: 'ascend910b' });
  });
});

describe('scriptMethods.getNpuHardwareAvailable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports the local NPU probe availability result', async () => {
    mockIsNpuHardwareProbeAvailable.mockReturnValue(true);

    await expect(scriptMethods.getNpuHardwareAvailable())
      .resolves
      .toBe(true);
  });

  it('reports false when no local NPU probe is available', async () => {
    mockIsNpuHardwareProbeAvailable.mockReturnValue(false);

    await expect(scriptMethods.getNpuHardwareAvailable())
      .resolves
      .toBe(false);
  });
});

describe('scriptMethods.getOnBoardExecutionAvailable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when the local NPU probe succeeds', async () => {
    mockStartNpuHardwareProbe.mockResolvedValue(true);

    await expect(scriptMethods.getOnBoardExecutionAvailable())
      .resolves
      .toBe(true);
    expect(mockStartRemoteNpuHardwareProbe)
      .not.toHaveBeenCalled();
  });

  it('falls back to the remote probe when the local probe reports no NPU', async () => {
    mockStartNpuHardwareProbe.mockResolvedValue(false);
    mockStartRemoteNpuHardwareProbe.mockResolvedValue(true);

    await expect(scriptMethods.getOnBoardExecutionAvailable())
      .resolves
      .toBe(true);
  });

  it('returns false when both probes report no NPU', async () => {
    mockStartNpuHardwareProbe.mockResolvedValue(false);
    mockStartRemoteNpuHardwareProbe.mockResolvedValue(false);

    await expect(scriptMethods.getOnBoardExecutionAvailable())
      .resolves
      .toBe(false);
  });

  it('falls back to the remote probe when the local probe throws', async () => {
    mockStartNpuHardwareProbe.mockRejectedValue(new Error('probe crashed'));
    mockStartRemoteNpuHardwareProbe.mockResolvedValue(true);

    await expect(scriptMethods.getOnBoardExecutionAvailable())
      .resolves
      .toBe(true);
  });

  it('returns false when the local probe throws and the remote probe throws too', async () => {
    mockStartNpuHardwareProbe.mockRejectedValue(new Error('local down'));
    mockStartRemoteNpuHardwareProbe.mockRejectedValue(new Error('remote down'));

    await expect(scriptMethods.getOnBoardExecutionAvailable())
      .resolves
      .toBe(false);
  });
});

describe('scriptMethods.getSimulatorSupportedMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAscendEnv.mockReturnValue({ socVersion: 'ascend910b' });
  });

  it('computes the allow-list with the simulator SOC and reports both metrics', async () => {
    mockIsSimulatorOptionalMetricSupported
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    await expect(scriptMethods.getSimulatorSupportedMetrics())
      .resolves
      .toEqual({
        ResourceConflictRatio: true,
        PMSampling: false,
      });

    expect(mockResolveAscendEnv)
      .toHaveBeenCalledWith({ isSimulator: true });
    expect(mockIsSimulatorOptionalMetricSupported)
      .toHaveBeenCalledWith('ResourceConflictRatio', 'ascend910b');
    expect(mockIsSimulatorOptionalMetricSupported)
      .toHaveBeenCalledWith('PMSampling', 'ascend910b');
  });
});
