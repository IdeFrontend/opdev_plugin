/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export function shouldShowStTestAction(params: {
  canBuild: boolean;
  isStandardCustom: boolean;
}): boolean {
  return params.canBuild && params.isStandardCustom;
}

export function shouldShowStTestHistoryView(params: {
  hasOperateTree: boolean;
  isStandardCustomContext: boolean;
  historyWorkspaceCount: number;
}): boolean {
  return params.hasOperateTree
    && (
      params.isStandardCustomContext
      || params.historyWorkspaceCount > 0
    );
}

export type StTestSelectionState = 'ready' | 'none' | 'multiple' | 'noNpu';

export function getStTestSelectionState(selectedCount: number, npuAvailable: boolean): StTestSelectionState {
  if (selectedCount === 0) {
    return 'none';
  }

  if (selectedCount > 1) {
    return 'multiple';
  }

  return npuAvailable ? 'ready' : 'noNpu';
}
