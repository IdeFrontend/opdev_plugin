/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  applyNpuArchToTerminalEnv,
  getTerminalEnvCollection,
  NPU_ARCH_ENV_VAR,
} from '@plugin/helpers/terminal-npu-arch-env';

const makeCollection = () => ({
  replace: jest.fn(),
  delete: jest.fn(),
});

describe('applyNpuArchToTerminalEnv', () => {
  it('targets the variable the generated build.sh / CMakeLists read', () => {
    expect(NPU_ARCH_ENV_VAR)
      .toBe('NPU_ARCH');
  });

  it('injects a resolved arch, trimmed', () => {
    const collection = makeCollection();

    expect(applyNpuArchToTerminalEnv(collection, '  dav-3510  '))
      .toBe(true);
    expect(collection.replace)
      .toHaveBeenCalledWith(NPU_ARCH_ENV_VAR, 'dav-3510');
    expect(collection.delete)
      .not
      .toHaveBeenCalled();
  });

  it('clears the variable for a blank arch so terminals keep no stale chip profile', () => {
    for (const blank of [
      '',
      '   ',
      null,
      undefined,
    ]) {
      const collection = makeCollection();

      expect(applyNpuArchToTerminalEnv(collection, blank))
        .toBe(true);
      expect(collection.delete)
        .toHaveBeenCalledWith(NPU_ARCH_ENV_VAR);
      expect(collection.replace)
        .not
        .toHaveBeenCalled();
    }
  });

  it('is a no-op without an activated extension context', () => {
    expect(applyNpuArchToTerminalEnv(undefined, 'dav-2201'))
      .toBe(false);
  });
});

describe('getTerminalEnvCollection', () => {
  const globalRef = globalThis as unknown as { extensionContext?: unknown };
  const original = globalRef.extensionContext;

  afterEach(() => {
    globalRef.extensionContext = original;
  });

  it('reads the collection off the activated extension context', () => {
    const environmentVariableCollection = makeCollection();

    globalRef.extensionContext = { environmentVariableCollection };

    expect(getTerminalEnvCollection())
      .toBe(environmentVariableCollection);
  });

  it('returns undefined before activation', () => {
    globalRef.extensionContext = undefined;

    expect(getTerminalEnvCollection())
      .toBeUndefined();
  });
});
