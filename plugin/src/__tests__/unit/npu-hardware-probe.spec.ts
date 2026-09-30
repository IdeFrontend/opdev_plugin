/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/domain/utils/ascend-detection-env', () => ({
  resolveCannSetEnvScriptForDetection: jest.fn(() => undefined),
  shellSourcePrefix: jest.fn((path: string) => `source '${path}' && `),
}));

jest.mock('child_process', () => ({ exec: jest.fn() }));

jest.mock('@plugin/helpers/remote-command', () => ({ getRemoteToolSeries: jest.fn() }));

import { exec } from 'child_process';

import { getRemoteToolSeries } from '@plugin/helpers/remote-command';
import { resolveCannSetEnvScriptForDetection } from '@plugin/domain/utils/ascend-detection-env';

import {
  _primeNpuHardwareProbeForTest,
  _primeRemoteNpuHardwareProbeForTest,
  _probeNpuHardwareFromCommandOutputsForTest,
  _resetNpuHardwareProbeForTest,
  _resetRemoteNpuHardwareProbeForTest,
  isNpuHardwareProbeAvailable,
  isNpuHardwareProbeResolved,
  isRemoteNpuHardwareProbeAvailable,
  isRemoteNpuHardwareProbeResolved,
  probeCommandResponded,
  startNpuHardwareProbe,
  startRemoteNpuHardwareProbe,
} from '@plugin/domain/utils/npu-hardware-probe';

const mockedExec = exec as unknown as jest.Mock;

type ShellOutput = { stdout: string;
  stderr: string };

function mockExecOutputs(outputs: Array<{ match: string;
  output: ShellOutput }>) {
  mockedExec.mockImplementation((
    cmd: string,
    _options: unknown,
    cb: (err: Error | null, result?: ShellOutput)=> void,
  ) => {
    const hit = outputs.find((entry) => cmd.includes(entry.match));

    cb(null, hit
      ? hit.output
      : {
        stdout: '',
        stderr: '',
      });
  });
}

function mockExecFailure(outputs: Array<{ match: string;
  output: ShellOutput }>) {
  mockedExec.mockImplementation((
    cmd: string,
    _options: unknown,
    cb: (err: Error | null, result?: ShellOutput)=> void,
  ) => {
    const hit = outputs.find((entry) => cmd.includes(entry.match));
    const error = new Error('command failed') as Error & { stdout?: string;
      stderr?: string };

    error.stdout = hit ? hit.output.stdout : '';
    error.stderr = hit ? hit.output.stderr : '';
    cb(error);
  });
}

describe('npu-hardware-probe', () => {
  beforeEach(() => {
    _resetNpuHardwareProbeForTest();
    _resetRemoteNpuHardwareProbeForTest();
    mockedExec.mockReset();
    mockedExec.mockImplementation((_cmd: string, _options: unknown, cb: (err: Error | null)=> void) => {
      cb(null);
    });
    (getRemoteToolSeries as jest.Mock).mockReset();
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

    it('returns false when the command itself is reported missing', () => {
      expect(probeCommandResponded({
        stdout: '',
        stderr: 'sh: npu-smi: not found',
      }, 'npu-smi'))
        .toBe(false);
      expect(probeCommandResponded({
        stdout: '',
        stderr: 'asys: command not found',
      }, 'asys'))
        .toBe(false);
      expect(probeCommandResponded({
        stdout: '',
        stderr: '/bin/sh: line 1: npu-smi: no such file or directory',
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

    it('returns false when outputs are missing entirely', () => {
      expect(_probeNpuHardwareFromCommandOutputsForTest({}))
        .toBe(false);
    });
  });

  describe('local session probe', () => {
    it('treats pending probe as available (optimistic UI)', () => {
      expect(isNpuHardwareProbeAvailable())
        .toBe(true);
      expect(isNpuHardwareProbeResolved())
        .toBe(false);
    });

    it('reflects primed unavailable state', () => {
      _primeNpuHardwareProbeForTest(false);

      expect(isNpuHardwareProbeAvailable())
        .toBe(false);
      expect(isNpuHardwareProbeResolved())
        .toBe(true);
    });

    it('resolves startNpuHardwareProbe from primed cache without shell', async () => {
      _primeNpuHardwareProbeForTest(true);

      await expect(startNpuHardwareProbe()).resolves.toBe(true);
      expect(mockedExec).not.toHaveBeenCalled();
    });

    it('runs asys and npu-smi probes and reports available when asys responds', async () => {
      mockExecOutputs([
        {
          match: 'which asys',
          output: {
            stdout: '/usr/bin/asys\n',
            stderr: '',
          },
        },
        {
          match: 'asys info',
          output: {
            stdout: 'status: running\n',
            stderr: '',
          },
        },
      ]);

      await expect(startNpuHardwareProbe()).resolves.toBe(true);
      expect(isNpuHardwareProbeResolved())
        .toBe(true);
      expect(isNpuHardwareProbeAvailable())
        .toBe(true);

      const commands = mockedExec.mock.calls.map((call) => call[0] as string);

      expect(commands)
        .toContain('which asys');
      expect(commands)
        .toContain('asys info -r=status');
    });

    it('uses bash with the configured timeouts for which/probe commands', async () => {
      mockExecOutputs([
        {
          match: 'which asys',
          output: {
            stdout: '/usr/bin/asys\n',
            stderr: '',
          },
        },
        {
          match: 'asys info',
          output: {
            stdout: 'status: running\n',
            stderr: '',
          },
        },
      ]);

      await startNpuHardwareProbe();

      const calls = mockedExec.mock.calls.map((call) => [
        call[0] as string,
        call[1] as { timeout?: number },
      ] as const);
      const optionsFor = (cmdFragment: string) => calls.find(([cmd]) => cmd.includes(cmdFragment))![1];

      expect(optionsFor('which asys'))
        .toEqual({
          encoding: 'utf8',
          shell: '/bin/bash',
          timeout: 2000,
        });
      expect(optionsFor('asys info'))
        .toEqual({
          encoding: 'utf8',
          shell: '/bin/bash',
          timeout: 8000,
        });
      expect(optionsFor('which npu-smi'))
        .toEqual({
          encoding: 'utf8',
          shell: '/bin/bash',
          timeout: 2000,
        });
    });

    it('prepends the sourced CANN set_env script to probe commands', async () => {
      (resolveCannSetEnvScriptForDetection as jest.Mock)
        .mockReturnValueOnce({
          path: '/ws/set_env.sh',
          source: 'workspace-setting',
        });
      mockExecOutputs([
        {
          match: 'which npu-smi',
          output: {
            stdout: '/usr/bin/npu-smi\n',
            stderr: '',
          },
        },
        {
          match: 'npu-smi info',
          output: {
            stdout: 'Chip Name: Ascend910B3\n',
            stderr: '',
          },
        },
      ]);

      await expect(startNpuHardwareProbe()).resolves.toBe(true);

      const commands = mockedExec.mock.calls.map((call) => call[0] as string);

      expect(commands[0])
        .toBe('source \'/ws/set_env.sh\' && which asys');
    });

    it('falls back to npu-smi when asys is not installed', async () => {
      mockExecOutputs([
        {
          match: 'which npu-smi',
          output: {
            stdout: '/usr/bin/npu-smi\n',
            stderr: '',
          },
        },
        {
          match: 'npu-smi info',
          output: {
            stdout: 'Chip Name: Ascend910B3\n',
            stderr: '',
          },
        },
      ]);

      await expect(startNpuHardwareProbe()).resolves.toBe(true);
    });

    it('reports unavailable when neither tool responds', async () => {
      await expect(startNpuHardwareProbe()).resolves.toBe(false);
      expect(isNpuHardwareProbeAvailable())
        .toBe(false);
    });

    it('does not probe further when which asys produced no output', async () => {
      mockExecOutputs([
        {
          match: 'asys info',
          output: {
            stdout: 'status: running\n',
            stderr: '',
          },
        },
      ]);

      await expect(startNpuHardwareProbe()).resolves.toBe(false);
      expect(mockedExec.mock.calls
        .some((call) => (call[0] as string).includes('asys info')))
        .toBe(false);
    });

    it('treats driver/tool errors on stderr as a successful probe', async () => {
      mockExecOutputs([
        {
          match: 'which asys',
          output: {
            stdout: '/usr/bin/asys\n',
            stderr: '',
          },
        },
        {
          match: 'asys info',
          output: {
            stdout: '',
            stderr: 'device busy',
          },
        },
      ]);

      await expect(startNpuHardwareProbe()).resolves.toBe(true);
    });

    it('uses stdout/stderr from the thrown exec error', async () => {
      mockExecFailure([
        {
          match: 'which npu-smi',
          output: {
            stdout: '/usr/bin/npu-smi\n',
            stderr: '',
          },
        },
        {
          match: 'npu-smi info',
          output: {
            stdout: '',
            stderr: 'Chip Name: Ascend910B3\n',
          },
        },
      ]);

      await expect(startNpuHardwareProbe()).resolves.toBe(true);
    });

    it('shares the in-flight probe between concurrent callers', async () => {
      const first = startNpuHardwareProbe();
      const second = startNpuHardwareProbe();

      expect(second)
        .toBe(first);

      await expect(first).resolves.toBe(false);
      expect(mockedExec)
        .toHaveBeenCalledTimes(2);
    });

    it('serves subsequent calls from the resolved cache without new shell work', async () => {
      mockExecOutputs([
        {
          match: 'which asys',
          output: {
            stdout: '/usr/bin/asys\n',
            stderr: '',
          },
        },
        {
          match: 'asys info',
          output: {
            stdout: 'ok\n',
            stderr: '',
          },
        },
      ]);

      await startNpuHardwareProbe();
      await expect(startNpuHardwareProbe()).resolves.toBe(true);

      // which asys + asys info + which npu-smi: the cached second call adds no shell work.
      expect(mockedExec)
        .toHaveBeenCalledTimes(3);
    });

    it('returns to pending state after reset', async () => {
      await startNpuHardwareProbe();
      _resetNpuHardwareProbeForTest();

      expect(isNpuHardwareProbeResolved())
        .toBe(false);
      expect(isNpuHardwareProbeAvailable())
        .toBe(true);
    });
  });

  describe('remote session probe', () => {
    it('treats pending remote probe as available', () => {
      expect(isRemoteNpuHardwareProbeAvailable())
        .toBe(true);
      expect(isRemoteNpuHardwareProbeResolved())
        .toBe(false);
    });

    it('reflects primed remote state', async () => {
      _primeRemoteNpuHardwareProbeForTest(false);

      expect(isRemoteNpuHardwareProbeAvailable())
        .toBe(false);
      expect(isRemoteNpuHardwareProbeResolved())
        .toBe(true);
      await expect(startRemoteNpuHardwareProbe()).resolves.toBe(false);
    });

    it('resolves true when a remote tool series is configured', async () => {
      (getRemoteToolSeries as jest.Mock)
        .mockResolvedValueOnce('a3');

      await expect(startRemoteNpuHardwareProbe()).resolves.toBe(true);
      expect(isRemoteNpuHardwareProbeAvailable())
        .toBe(true);
    });

    it('resolves false when no remote tool series is configured', async () => {
      (getRemoteToolSeries as jest.Mock)
        .mockResolvedValueOnce(undefined);

      await expect(startRemoteNpuHardwareProbe()).resolves.toBe(false);
      expect(isRemoteNpuHardwareProbeAvailable())
        .toBe(false);
    });

    it('serves repeated calls from the cached result', async () => {
      (getRemoteToolSeries as jest.Mock)
        .mockResolvedValueOnce('a3');

      await startRemoteNpuHardwareProbe();
      await expect(startRemoteNpuHardwareProbe()).resolves.toBe(true);
      expect(getRemoteToolSeries)
        .toHaveBeenCalledTimes(1);
    });

    it('returns to pending state after remote reset', async () => {
      await startRemoteNpuHardwareProbe();
      _resetRemoteNpuHardwareProbeForTest();

      expect(isRemoteNpuHardwareProbeResolved())
        .toBe(false);
    });
  });
});
