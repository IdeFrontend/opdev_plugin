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
  StTestCancelledError,
  isStTestCancelledError,
} from '@plugin/domain/services/st-test-errors';

describe('StTestCancelledError / isStTestCancelledError', () => {
  it('isStTestCancelledError matches the class instance via instanceof', () => {
    expect(isStTestCancelledError(new StTestCancelledError()))
      .toBe(true);
  });

  it('matches a structurally identical error carrying the marker name', () => {
    // Errors serialized across the task/terminal boundary lose their class but
    // keep the name — the name-based fallback must still recognize them.
    const revived = Object.assign(new Error('ST test cancelled'), { name: 'StTestCancelledError' });

    expect(isStTestCancelledError(revived))
      .toBe(true);
  });

  it('rejects a plain Error with a different name', () => {
    expect(isStTestCancelledError(new Error('boom')))
      .toBe(false);
  });

  it('rejects non-Error values', () => {
    expect(isStTestCancelledError('ST test cancelled'))
      .toBe(false);
    expect(isStTestCancelledError({ name: 'StTestCancelledError' }))
      .toBe(false);
    expect(isStTestCancelledError(undefined))
      .toBe(false);
    expect(isStTestCancelledError(null))
      .toBe(false);
  });

  it('StTestCancelledError carries its message and name', () => {
    const error = new StTestCancelledError();

    expect(error.message)
      .toBe('ST test cancelled');
    expect(error.name)
      .toBe('StTestCancelledError');
  });
});
