/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { CommandStrategyFactory } from '@plugin/domain/services/command-strategy/factory';
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import { PyAscCommandStrategy } from '@plugin/domain/services/command-strategy/pyasc-strategy';
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';

describe('CommandStrategyFactory.getStrategy', () => {
  it('returns the strategy registered for each known op type', () => {
    expect(CommandStrategyFactory.getStrategy('ascend'))
      .toBeInstanceOf(AscendCommandStrategy);
    expect(CommandStrategyFactory.getStrategy('cann'))
      .toBeInstanceOf(CannCommandStrategy);
    expect(CommandStrategyFactory.getStrategy('pyasc'))
      .toBeInstanceOf(PyAscCommandStrategy);
    expect(CommandStrategyFactory.getStrategy('triton'))
      .toBeInstanceOf(TritonCommandStrategy);
  });

  it('returns the cann strategy for a null or undefined op type', () => {
    expect(CommandStrategyFactory.getStrategy(null))
      .toBeInstanceOf(CannCommandStrategy);
    expect(CommandStrategyFactory.getStrategy(undefined))
      .toBeInstanceOf(CannCommandStrategy);
  });

  it('returns the cann strategy for an empty op type', () => {
    expect(CommandStrategyFactory.getStrategy(''))
      .toBeInstanceOf(CannCommandStrategy);
  });

  it('falls back to the cann strategy for an unknown op type', () => {
    expect(CommandStrategyFactory.getStrategy('unknown-op-type'))
      .toBeInstanceOf(CannCommandStrategy);
  });
});
