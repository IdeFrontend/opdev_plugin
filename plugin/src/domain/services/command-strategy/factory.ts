/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { CommandStrategy } from './types';
import { AscendCommandStrategy } from './ascend-strategy';
import { CannCommandStrategy } from './cann-strategy';
import { PyAscCommandStrategy } from './pyasc-strategy';
import { TritonCommandStrategy } from './triton-strategy';

/**
 * command strategy factory
 *
 * Used to manage and obtain different types of command strategies
 *
 * @example
 * // Get strategy
 * const strategy = CommandStrategyFactory.getStrategy('ascend');
 */
export class CommandStrategyFactory {
  private static strategies = new Map<string, CommandStrategy>([
    [
      'ascend',
      new AscendCommandStrategy(),
    ],
    [
      'cann',
      new CannCommandStrategy(),
    ],
    [
      'pyasc',
      new PyAscCommandStrategy(),
    ],
    [
      'triton',
      new TritonCommandStrategy(),
    ],
  ]);

  /**
   * Get command strategy
   * @param opType operator type, if null or does not exist, returns cann strategy
   * Command strategy instance corresponding to @returns
   *
   * @example
   * const strategy = CommandStrategyFactory.getStrategy('ascend');
   * const defaultStrategy = CommandStrategyFactory.getStrategy(null); // Return cann strategy
   */
  static getStrategy(opType: string | null | undefined): CommandStrategy {
    if (!opType) {
      return this.strategies.get('cann')!;
    }

    return this.strategies.get(opType) || this.strategies.get('cann')!;
  }
}
