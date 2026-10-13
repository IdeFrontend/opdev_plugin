/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Unit tests for the A5 new-tool selectors on ConfigService:
 * getOnBoardTool / getSimulationTool and the shouldUseNewOnBoardTool /
 * shouldUseNewSimulationTool gates that decide whether the on-board / simulation
 * entry opens the new "数据采集配置" dialog. The new tools only run on A5
 * (ascend950) inside <<<>>> (kernel direct-call) operator projects
 * ('ascend-c' / 'cann' / 'torch-library'): an explicit workspace setting pins
 * each tool, otherwise A5 defaults to `npu-compute` / `npu-emulate` and every
 * other SOC — and every non-<<<>>> project type — resolves to the legacy msprof.
 */

import { ConfigService } from '@plugin/service/config-service';
import {
  isKernelDirectCallProjectType,
  isNewProfilerToolSupportedForProject,
} from '@shared/cann-env-constants';

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveEffectiveCannSoc: jest.fn(() => '') }));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';

const resolveSocMock = resolveEffectiveCannSoc as jest.Mock;

describe('shared <<<>>> project / new-tool eligibility predicates', () => {
  describe('isKernelDirectCallProjectType', () => {
    it.each([
      'ascend-c',
      'cann',
      'torch-library',
      '  Torch-Library ',
    ])('recognizes %p as a <<<>>> operator project', (projectType) => {
      expect(isKernelDirectCallProjectType(projectType))
        .toBe(true);
    });

    it.each([
      undefined,
      null,
      '',
      'standard-custom',
      'ascend',
      'pyasc',
      'triton',
    ])('rejects %p as a non-<<<>>> project', (projectType) => {
      expect(isKernelDirectCallProjectType(projectType))
        .toBe(false);
    });
  });

  describe('isNewProfilerToolSupportedForProject', () => {
    it('is true only for ascend950 SOC plus a <<<>>> project type', () => {
      expect(isNewProfilerToolSupportedForProject('ascend950', 'ascend-c'))
        .toBe(true);
      expect(isNewProfilerToolSupportedForProject(' Ascend950 ', 'cann'))
        .toBe(true);
    });

    it('is false on non-950 SOC even for <<<>>> projects', () => {
      expect(isNewProfilerToolSupportedForProject('ascend910b', 'ascend-c'))
        .toBe(false);
      expect(isNewProfilerToolSupportedForProject('', 'torch-library'))
        .toBe(false);
    });

    it('is false on ascend950 for non-<<<>>> / unknown project types', () => {
      expect(isNewProfilerToolSupportedForProject('ascend950', 'standard-custom'))
        .toBe(false);
      expect(isNewProfilerToolSupportedForProject('ascend950', undefined))
        .toBe(false);
    });
  });
});

describe('ConfigService new-tool selectors', () => {
  let readSettingSpy: jest.SpyInstance;

  beforeEach(() => {
    resolveSocMock.mockReturnValue('');
    // Default: no explicit tool setting configured (undefined).
    readSettingSpy = jest.spyOn(ConfigService, 'readOpDevtoolsSetting')
      .mockReturnValue(undefined);
  });

  afterEach(() => {
    readSettingSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('getOnBoardTool', () => {
    it('defaults to npu-compute on A5 (ascend950) with no explicit setting', () => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.getOnBoardTool())
        .toBe('npu-compute');
    });

    it('defaults to msprof on non-A5 SOC', () => {
      resolveSocMock.mockReturnValue('ascend910b');

      expect(ConfigService.getOnBoardTool())
        .toBe('msprof');
    });

    it('honors an explicit msprof setting even on A5', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('msprof');

      expect(ConfigService.getOnBoardTool())
        .toBe('msprof');
    });

    it('honors an explicit npu-compute setting regardless of SOC', () => {
      resolveSocMock.mockReturnValue('ascend910b');
      readSettingSpy.mockReturnValue('npu-compute');

      expect(ConfigService.getOnBoardTool())
        .toBe('npu-compute');
    });

    it('ignores an unrecognized setting value and falls back to SOC default', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('garbage');

      expect(ConfigService.getOnBoardTool())
        .toBe('npu-compute');
    });
  });

  describe('getSimulationTool', () => {
    it('defaults to npu-emulate on A5 (ascend950) with no explicit setting', () => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.getSimulationTool())
        .toBe('npu-emulate');
    });

    it('defaults to msprof on non-A5 SOC', () => {
      resolveSocMock.mockReturnValue('ascend910b');

      expect(ConfigService.getSimulationTool())
        .toBe('msprof');
    });

    it('honors an explicit msprof setting even on A5', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('msprof');

      expect(ConfigService.getSimulationTool())
        .toBe('msprof');
    });

    it('honors an explicit npu-emulate setting regardless of SOC', () => {
      resolveSocMock.mockReturnValue('ascend910b');
      readSettingSpy.mockReturnValue('npu-emulate');

      expect(ConfigService.getSimulationTool())
        .toBe('npu-emulate');
    });

    it('ignores an unrecognized setting value and falls back to SOC default', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('garbage');

      expect(ConfigService.getSimulationTool())
        .toBe('npu-emulate');
    });
  });

  describe('shouldUseNewOnBoardTool', () => {
    it.each([
      'ascend-c',
      'cann',
      'torch-library',
      'ASCEND-C',
    ])('is true on A5 (ascend950) with a <<<>>> project type (%s)', (projectType) => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.shouldUseNewOnBoardTool(projectType))
        .toBe(true);
    });

    it.each([
      undefined,
      null,
      '',
      'standard-custom',
      'ascend',
      'pyasc',
      'triton',
    ])('is false on A5 for a non-<<<>>> / unknown project type (%p)', (projectType) => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.shouldUseNewOnBoardTool(projectType))
        .toBe(false);
    });

    it('is false on non-A5 SOC even for a <<<>>> project', () => {
      resolveSocMock.mockReturnValue('ascend910b');

      expect(ConfigService.shouldUseNewOnBoardTool('ascend-c'))
        .toBe(false);
    });

    it('is false on A5 + <<<>>> project when the user pins the legacy msprof', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('msprof');

      expect(ConfigService.shouldUseNewOnBoardTool('ascend-c'))
        .toBe(false);
    });
  });

  describe('shouldUseNewSimulationTool', () => {
    it.each([
      'ascend-c',
      'cann',
      'torch-library',
    ])('is true on A5 (ascend950) with a <<<>>> project type (%s)', (projectType) => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.shouldUseNewSimulationTool(projectType))
        .toBe(true);
    });

    it.each([
      undefined,
      null,
      '',
      'standard-custom',
      'ascend',
      'pyasc',
      'triton',
    ])('is false on A5 for a non-<<<>>> / unknown project type (%p)', (projectType) => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.shouldUseNewSimulationTool(projectType))
        .toBe(false);
    });

    it('is false on non-A5 SOC even for a <<<>>> project', () => {
      resolveSocMock.mockReturnValue('ascend910b');

      expect(ConfigService.shouldUseNewSimulationTool('ascend-c'))
        .toBe(false);
    });

    it('is false on A5 + <<<>>> project when the user pins the legacy msprof', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('msprof');

      expect(ConfigService.shouldUseNewSimulationTool('ascend-c'))
        .toBe(false);
    });

    it('is false on non-A5 SOC even with an explicit npu-emulate setting', () => {
      resolveSocMock.mockReturnValue('ascend910b');
      readSettingSpy.mockReturnValue('npu-emulate');

      expect(ConfigService.shouldUseNewSimulationTool('ascend-c'))
        .toBe(false);
    });
  });
});
