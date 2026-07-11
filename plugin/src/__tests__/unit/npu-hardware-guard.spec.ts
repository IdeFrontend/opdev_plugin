import * as vscode from 'vscode';

import {
  _primeNpuHardwareProbeForTest,
  _resetNpuHardwareProbeForTest,
} from '@plugin/domain/utils/npu-hardware-probe';
import {
  assertNpuHardwareAvailableOrNotify,
  isNpuHardwareAvailable,
} from '@plugin/helpers/npu-hardware-guard';

describe('npu-hardware-guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetNpuHardwareProbeForTest();
  });

  it('allows actions while probe is pending', () => {
    expect(isNpuHardwareAvailable())
      .toBe(true);
    expect(assertNpuHardwareAvailableOrNotify())
      .toBe(true);
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('blocks actions and notifies when NPU hardware is unavailable', () => {
    _primeNpuHardwareProbeForTest(false);

    expect(isNpuHardwareAvailable())
      .toBe(false);
    expect(assertNpuHardwareAvailableOrNotify())
      .toBe(false);
    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledTimes(1);
  });
});
