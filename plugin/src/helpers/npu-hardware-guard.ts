import * as vscode from 'vscode';
import { t } from 'i18next';

import { isNpuHardwareProbeAvailable } from '@plugin/domain/utils/npu-hardware-probe';

export function isNpuHardwareAvailable(): boolean {
  return isNpuHardwareProbeAvailable();
}

/**
 * @returns true when NPU-only actions may run (pending or available).
 */
export function assertNpuHardwareAvailableOrNotify(): boolean {
  if (isNpuHardwareAvailable()) {
    return true;
  }

  void vscode.window.showWarningMessage(t('web.operate.npuHardwareRequired'));

  return false;
}
