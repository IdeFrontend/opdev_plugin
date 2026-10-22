/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { isSubOperatorCreation } from '@plugin/domain/utils/sub-operator-creation';

describe('isSubOperatorCreation', () => {
  const base = {
    subOpDir: '/repo/ops-math/math/add',
    workspaceRoot: '/repo/ops-math',
    isStandardCustomViewId: true,
    currentProjectType: 'standard-custom',
  };

  it('is true for a standard-custom view id nested under the current standard-custom workspace', () => {
    expect(isSubOperatorCreation(base))
      .toBe(true);
  });

  it('treats stored project_type=ascend as the current standard-custom workspace', () => {
    expect(isSubOperatorCreation({
      ...base,
      currentProjectType: 'ascend',
    }))
      .toBe(true);
  });

  it('is false when the requested view id is not standard-custom', () => {
    expect(isSubOperatorCreation({
      ...base,
      isStandardCustomViewId: false,
    }))
      .toBe(false);
  });

  it('is false when the current workspace is not standard-custom', () => {
    expect(isSubOperatorCreation({
      ...base,
      currentProjectType: 'cann',
    }))
      .toBe(false);
  });

  it('is false when the target directory is outside the current workspace', () => {
    expect(isSubOperatorCreation({
      ...base,
      subOpDir: '/repo/other/math/add',
    }))
      .toBe(false);
  });
});
