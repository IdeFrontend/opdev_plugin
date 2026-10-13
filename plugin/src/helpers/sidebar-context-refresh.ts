/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Lets {@link refreshSidebarContexts} in extension activation refresh both Operate and Operators trees
 * from code paths that do not have direct access to that closure (e.g. after a successful build).
 */
let refreshSidebarContextsImpl: (()=> Promise<void>) | null = null;

let pendingRefresh: Promise<void> | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 200;

export function registerSidebarContextsRefresh(fn: ()=> Promise<void>): void {
  refreshSidebarContextsImpl = fn;
}

export async function requestSidebarContextsRefresh(): Promise<void> {
  if (!refreshSidebarContextsImpl) {
    return;
  }

  if (pendingRefresh) {
    return pendingRefresh;
  }

  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }

  return new Promise((resolve) => {
    refreshTimeout = setTimeout(async () => {
      refreshTimeout = null;

      try {
        pendingRefresh = refreshSidebarContextsImpl!();
        await pendingRefresh;
      }
      finally {
        pendingRefresh = null;
        resolve();
      }
    }, DEBOUNCE_MS);
  });
}
