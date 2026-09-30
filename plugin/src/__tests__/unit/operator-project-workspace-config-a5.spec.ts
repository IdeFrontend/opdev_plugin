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

import { ConfigService } from '@plugin/service/config-service';

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveEffectiveCannSoc: jest.fn(() => '') }));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';

describe('ConfigService.getOnBoardConfig A5 on-board', () => {
  const getStore: Record<string, unknown> = {};

  beforeEach(() => {
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      // readOpDevtoolsSetting uses inspect() workspace* values, not get().
      inspect: jest.fn((key: string) => {
        if (!(key in getStore)) {
          return undefined;
        }

        return { workspaceValue: getStore[key] };
      }),
      get: <T>(key: string) => getStore[key] as T | undefined,
      update: jest.fn(),
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('applies pcSampling but not cacheHeatmap when workspace soc is ascend950', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const config = ConfigService.getOnBoardConfig('/workspace');

    expect(config.pcSampling)
      .toBe(true);
    // cacheHeatmap is gated off on A5 profilers — the DAO yields false, not undefined.
    expect(config.memoryDetail)
      .toBe(false);
  });

  it('applies cacheHeatmap but not pcSampling when workspace soc is not A5', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend910b');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = false;

    const config = ConfigService.getOnBoardConfig('/workspace');

    expect(config.memoryDetail)
      .toBe(false);
    // pcSampling is gated off on non-A5 profilers — the DAO yields false, not undefined.
    expect(config.pcSampling)
      .toBe(false);
  });

  it('applies A5 on-board metrics when effective soc is detected ascend950 without workspace override', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const config = ConfigService.getOnBoardConfig('/workspace');

    expect(config.pcSampling)
      .toBe(true);
    expect(config.memoryDetail)
      .toBe(false);
  });

  it.each([
    'ascend910b',
    'ascend910_93',
  ])('defaults sanitizer toolType to mssanitizer for A2/A3 SOC %s', (soc) => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue(soc);

    const config = ConfigService.getSanitizerConfig('/workspace');

    expect(config.toolType)
      .toBe('mssanitizer');
  });

  it('forces sanitizer toolType to mssanitizer for A2/A3 even when npu-check is configured', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend910b');
    getStore['sanitizer.toolType'] = 'npu-check';

    const config = ConfigService.getSanitizerConfig('/workspace');

    expect(config.toolType)
      .toBe('mssanitizer');
  });

  it('defaults sanitizer toolType to npu-check for non-A2/A3 SOC', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['projectType'] = 'ascend-c';

    const config = ConfigService.getSanitizerConfig('/workspace');

    expect(config.toolType)
      .toBe('npu-check');
  });

  it.each([
    'ascend-c',
    'cann',
    'torch-library',
  ])('defaults sanitizer toolType to npu-check for a <<<>>> project type %s on non-A2/A3 SOC', (projectType) => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['projectType'] = projectType;

    const config = ConfigService.getSanitizerConfig('/workspace');

    expect(config.toolType)
      .toBe('npu-check');
  });

  it.each([
    'standard-custom',
    'ascend',
    'pyasc',
    'triton',
  ])('defaults sanitizer toolType to mssanitizer for a non-<<<>>> project type %s even on non-A2/A3 SOC', (projectType) => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['projectType'] = projectType;

    const config = ConfigService.getSanitizerConfig('/workspace');

    expect(config.toolType)
      .toBe('mssanitizer');
  });

  it('forces sanitizer toolType to mssanitizer for a non-<<<>>> project even when npu-check is configured', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['projectType'] = 'standard-custom';
    getStore['sanitizer.toolType'] = 'npu-check';

    const config = ConfigService.getSanitizerConfig('/workspace');

    expect(config.toolType)
      .toBe('mssanitizer');
  });

  it('defaults sanitizer toolType to mssanitizer when no project type is known', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');

    const config = ConfigService.getSanitizerConfig('/workspace');

    expect(config.toolType)
      .toBe('mssanitizer');
  });

  it.each([
    'mssanitizer',
    'npu-check',
  ])('keeps configured sanitizer toolType %s for non-A2/A3 SOC on a <<<>>> project', (toolType) => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['projectType'] = 'ascend-c';
    getStore['sanitizer.toolType'] = toolType;

    const config = ConfigService.getSanitizerConfig('/workspace');

    expect(config.toolType)
      .toBe(toolType);
  });
});
