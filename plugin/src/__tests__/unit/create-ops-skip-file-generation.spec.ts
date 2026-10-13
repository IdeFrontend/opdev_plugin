/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({ t: (key: string) => key }));

const checkVscode = jest.fn();
const parseMeta = jest.fn();
const executeGeneration = jest.fn();

jest.mock('@plugin/core/project/project-manager', () => ({
  ProjectManager: {
    getInstance: () => ({
      projectPath: '/repo/math',
      checkVscode,
    }),
  },
}));

jest.mock('@plugin/domain/services/op-generator-factory', () => ({
  OpGeneratorFactory: {
    getGenerator: jest.fn(() => ({
      parseMeta,
      executeGeneration,
    })),
  },
}));

jest.mock('@plugin/domain/utils/project-utils', () => ({ ensureLaunchJsonExists: jest.fn(async () => {}) }));

import { OpGeneratorFactory } from '@plugin/domain/services/op-generator-factory';
import { projectService } from '@plugin/service/project-service';

describe('createOpsByPrototype: skipFileGeneration threading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { extensionContext: { extensionPath: string } }).extensionContext = { extensionPath: '/ext' };
  });

  const baseParams = {
    opsPrototypeFile: '/repo/math/add/add.json',
    opType: 'ascend' as const,
    opName: 'add',
    opPath: '/repo/math/add',
    projectPath: '/repo/math',
  };

  it('skips generator.executeGeneration when skipFileGeneration is true', async () => {
    await projectService.createOpsByPrototype({
      ...baseParams,
      skipFileGeneration: true,
    });

    expect(OpGeneratorFactory.getGenerator)
      .toHaveBeenCalledTimes(1);
    expect(executeGeneration)
      .not.toHaveBeenCalled();
  });

  it('runs generator.executeGeneration when skipFileGeneration is absent (fallback parity)', async () => {
    await projectService.createOpsByPrototype({ ...baseParams });

    expect(OpGeneratorFactory.getGenerator)
      .toHaveBeenCalledTimes(1);
    expect(executeGeneration)
      .toHaveBeenCalledTimes(1);
  });
});
