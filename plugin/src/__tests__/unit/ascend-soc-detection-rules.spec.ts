/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { socFromCoreName } from '@plugin/domain/utils/ascend-util';
import { _resetDetectedChipCacheForTest } from '@shared/ascend-series-registry';

describe('socFromCoreName (chip → series → soc)', () => {
  beforeEach(() => {
    _resetDetectedChipCacheForTest();
  });

  it.each([
    'Ascend910_9362',
    'Ascend910_9372',
    'Ascend 910_9362 V1',
  ])('maps A3 chip %s to ascend910_93', (coreName) => {
    expect(socFromCoreName(coreName))
      .toBe('ascend910_93');
  });

  it.each([
    [
      'Ascend910B',
      'ascend910b',
    ],
    [
      'Ascend910B1',
      'ascend910b',
    ],
    [
      'Ascend 910B3',
      'ascend910b',
    ],
    [
      'Ascend910B4',
      'ascend910b',
    ],
  ])('maps A2 chip %s to %s', (coreName, slug) => {
    expect(socFromCoreName(coreName))
      .toBe(slug);
  });

  it('maps Ascend910A to ascend910b', () => {
    expect(socFromCoreName('Ascend910A'))
      .toBe('ascend910b');
  });

  it.each([
    'Ascend950PR_9589',
    'Ascend 950PR_9589',
  ])('maps A5 chip %s to ascend950', (coreName) => {
    expect(socFromCoreName(coreName))
      .toBe('ascend950');
  });

  it('maps Pro chip to ascend910b (A2)', () => {
    expect(socFromCoreName('Ascend910ProA'))
      .toBe('ascend910b');
  });
});
