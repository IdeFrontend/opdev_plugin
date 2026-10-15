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
  getStTestSelectionState,
  shouldShowStTestAction,
  shouldShowStTestHistoryView,
} from '@plugin/helpers/st-test-action';

describe('shouldShowStTestAction', () => {
  it.each([
    [
      true,
      true,
      true,
    ],
    [
      false,
      false,
      false,
    ],
    [
      false,
      true,
      false,
    ],
    [
      false,
      false,
      true,
    ],
  ])(
    'returns %s for canBuild=%s and standardCustom=%s',
    (expected, canBuild, isStandardCustom) => {
      expect(shouldShowStTestAction({
        canBuild,
        isStandardCustom,
      }))
        .toBe(expected);
    },
  );
});

describe('getStTestSelectionState', () => {
  it.each([
    [
      0,
      true,
      'none',
    ],
    [
      0,
      false,
      'none',
    ],
    [
      1,
      true,
      'ready',
    ],
    [
      1,
      false,
      'noNpu',
    ],
    [
      2,
      true,
      'multiple',
    ],
    [
      2,
      false,
      'multiple',
    ],
  ] as const)('maps %i selected operators with npuAvailable=%s to %s', (selectedCount, npuAvailable, expected) => {
    expect(getStTestSelectionState(selectedCount, npuAvailable))
      .toBe(expected);
  });
});

describe('shouldShowStTestHistoryView', () => {
  it.each([
    [
      true,
      true,
      true,
      0,
    ],
    [
      true,
      true,
      false,
      1,
    ],
    [
      false,
      true,
      false,
      0,
    ],
    [
      false,
      false,
      true,
      0,
    ],
  ])(
    'returns %s for hasOperateTree=%s isStandardCustomContext=%s historyWorkspaceCount=%i',
    (expected, hasOperateTree, isStandardCustomContext, historyWorkspaceCount) => {
      expect(shouldShowStTestHistoryView({
        hasOperateTree,
        isStandardCustomContext,
        historyWorkspaceCount,
      }))
        .toBe(expected);
    },
  );
});
