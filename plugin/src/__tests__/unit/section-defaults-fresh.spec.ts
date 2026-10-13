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

import * as vscode from 'vscode';

import { ConfigService } from '@plugin/service/config-service';
import { getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveEffectiveCannSoc: jest.fn(() => 'ascend910b') }));

describe('on_board/simulate fall back to the base generateStructure defaults on fresh projects', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-sec-defaults-'));
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(() => undefined),
      get: jest.fn(),
      update: jest.fn(),
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('empty on_board settings → the full base metric seed (11 metrics + profiler flags)', () => {
    const config = ConfigService.getOnBoardConfig(tmpRoot);

    // generateStructure on_board payload (model.ts:436-470): 11 metrics +
    // MemoryDetail / PCSampling per SOC + advance_param.
    for (const metric of [
      'occupancy',
      'roofline',
      'source',
      'arithmeticUtilization',
      'l2Cache',
      'memory',
      'memoryL0',
      'memoryUB',
      'pipeUtilization',
      'resourceConflictRatio',
    ]) {
      expect(config[metric])
        .toBe(true);
    }

    expect(config.kernelScale)
      .toBe(false);
    expect(config.memoryDetail)
      .toBe(true);
    expect(config.pcSampling)
      .toBe(false);
    expect(config.advanceParam)
      .toEqual([]);
  });

  it('empty simulate settings → ResourceConflictRatio true / PMSampling false', () => {
    const config = ConfigService.getSimulateConfig(tmpRoot);

    // Simulate payload (model.ts:471-493).
    expect(config.resourceConflictRatio)
      .toBe(true);
    expect(config.memoryThroughputWaveform)
      .toBe(false);
    expect(config.advanceParam)
      .toEqual([]);
  });

  it('settings present in the section disable the fallback (no merge)', () => {
    const settingsPath = getIdeSettingsFilePath(tmpRoot);

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'op-devtools.performanceTuning.onBoard.cacheHeatmap': false }, null, 2)}\n`,
      'utf8',
    );
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn((key: string) => (key === 'performanceTuning.onBoard.cacheHeatmap'
        ? { workspaceValue: false }
        : undefined)),
      get: jest.fn(),
      update: jest.fn(),
    });

    const config = ConfigService.getOnBoardConfig(tmpRoot);

    expect(config.memoryDetail)
      .toBe(false);
    // The section has user state → the base metric seed is NOT merged in.
    expect(config.occupancy)
      .toBe(false);
  });
});
