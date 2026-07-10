jest.mock('@plugin/domain/utils/ascend-detection-env', () => ({
  resolveCannSetEnvScriptForDetection: jest.fn(() => undefined),
  shellSourcePrefix: jest.fn((path: string) => `source '${path}' && `),
}));

jest.mock('child_process', () => ({ exec: jest.fn() }));

import { exec } from 'child_process';

import {
  _primeNpuHardwareProbeForTest,
  _probeNpuHardwareFromCommandOutputsForTest,
  _resetNpuHardwareProbeForTest,
  isNpuHardwareProbeAvailable,
  probeCommandResponded,
  startNpuHardwareProbe,
} from '@plugin/domain/utils/npu-hardware-probe';

const mockedExec = exec as unknown as jest.Mock;

describe('npu-hardware-probe', () => {
  beforeEach(() => {
    _resetNpuHardwareProbeForTest();
    mockedExec.mockReset();
  });

  describe('probeCommandResponded', () => {
    it('returns true for chip info output', () => {
      expect(probeCommandResponded({
        stdout: 'Chip Name: Ascend910B3\n',
        stderr: '',
      }, 'npu-smi'))
        .toBe(true);
    });

    it('returns true for dcmi/device-busy errors (NPU present, SOC parse may fail)', () => {
      expect(probeCommandResponded({
        stdout: '',
        stderr: 'dcmi model initialized failed, because the device is busy',
      }, 'npu-smi'))
        .toBe(true);
    });

    it('returns false when the shell binary is missing (bash)', () => {
      expect(probeCommandResponded({
        stdout: '',
        stderr: 'bash: npu-smi: command not found',
      }, 'npu-smi'))
        .toBe(false);
    });

    it('returns false when the shell binary is missing (PowerShell)', () => {
      expect(probeCommandResponded({
        stdout: '',
        stderr: "The term 'npu-smi' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.",
      }, 'npu-smi'))
        .toBe(false);
    });

    it('returns false for completely empty output', () => {
      expect(probeCommandResponded({
        stdout: '',
        stderr: '',
      }, 'npu-smi'))
        .toBe(false);
    });
  });

  describe('_probeNpuHardwareFromCommandOutputsForTest', () => {
    it('returns true when only npu-smi responds with a driver error', () => {
      expect(_probeNpuHardwareFromCommandOutputsForTest({
        npuSmi: {
          stdout: '',
          stderr: 'dcmi model initialized failed, because the device is busy',
        },
      }))
        .toBe(true);
    });

    it('returns true when asys responds even without chip name', () => {
      expect(_probeNpuHardwareFromCommandOutputsForTest({
        asys: {
          stdout: 'Ascend runtime status: busy\n',
          stderr: '',
        },
      }))
        .toBe(true);
    });

    it('returns false when both commands produce no usable output', () => {
      expect(_probeNpuHardwareFromCommandOutputsForTest({
        asys: {
          stdout: '',
          stderr: "The term 'asys' is not recognized as the name of a cmdlet, function, script file, or operable program.",
        },
        npuSmi: {
          stdout: '',
          stderr: "The term 'npu-smi' is not recognized as the name of a cmdlet, function, script file, or operable program.",
        },
      }))
        .toBe(false);
    });
  });

  describe('session cache', () => {
    it('treats pending probe as available (optimistic UI)', () => {
      expect(isNpuHardwareProbeAvailable())
        .toBe(true);
    });

    it('reflects primed unavailable state', () => {
      _primeNpuHardwareProbeForTest(false);

      expect(isNpuHardwareProbeAvailable())
        .toBe(false);
    });

    it('resolves startNpuHardwareProbe from primed cache without shell', async () => {
      _primeNpuHardwareProbeForTest(true);

      await expect(startNpuHardwareProbe()).resolves.toBe(true);
      expect(mockedExec).not.toHaveBeenCalled();
    });
  });
});
