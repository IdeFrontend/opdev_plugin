/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
