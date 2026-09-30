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
  registerSidebarContextsRefresh,
  requestSidebarContextsRefresh,
} from '@plugin/helpers/sidebar-context-refresh';

describe('sidebar context refresh (debounced bridge)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    registerSidebarContextsRefresh(null as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves immediately when no refresh handler is registered', async () => {
    await expect(requestSidebarContextsRefresh())
      .resolves.toBeUndefined();
  });

  it('invokes the registered handler after the debounce window', async () => {
    const refresh = jest.fn(async () => undefined);

    registerSidebarContextsRefresh(refresh);

    const request = requestSidebarContextsRefresh();

    expect(refresh)
      .not
      .toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(200);
    await request;

    expect(refresh)
      .toHaveBeenCalledTimes(1);
  });

  it('debounces: a second request while the timer is pending restarts it', async () => {
    const refresh = jest.fn(async () => undefined);

    registerSidebarContextsRefresh(refresh);

    const first = requestSidebarContextsRefresh();
    const second = requestSidebarContextsRefresh();

    await jest.advanceTimersByTimeAsync(100);
    expect(refresh)
      .not
      .toHaveBeenCalled();

    // The first request's timer was cleared by the second request; only one run.
    await jest.advanceTimersByTimeAsync(200);
    await second;

    expect(refresh)
      .toHaveBeenCalledTimes(1);
    // `first` never resolves (its timer was cleared) — intentionally not awaited.
  });

  it('reuses the in-flight refresh for overlapping requests', async () => {
    let release!: ()=> void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = jest.fn(async () => {
      await gate;
    });

    registerSidebarContextsRefresh(refresh);

    const first = requestSidebarContextsRefresh();

    await jest.advanceTimersByTimeAsync(200);
    expect(refresh)
      .toHaveBeenCalledTimes(1);

    const second = requestSidebarContextsRefresh();

    release();
    await first;
    await second;

    expect(refresh)
      .toHaveBeenCalledTimes(1);
  });

});
