/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { buildOpenFolderWindowOptions } from '@plugin/helpers/open-folder-window-options';

describe('buildOpenFolderWindowOptions (window reuse semantics)', () => {
  it('forces a new window when forceNewWindow is true', () => {
    expect(buildOpenFolderWindowOptions(true))
      .toEqual({ forceNewWindow: true });
  });

  it('forces reuse of the current window when forceNewWindow is false', () => {
    // Must NOT emit { forceNewWindow: false } (VS Code would then
    // defer to window.openFoldersInNewWindow and spawn a new window). It must force reuse.
    expect(buildOpenFolderWindowOptions(false))
      .toEqual({ forceReuseWindow: true });
  });

  it('never sets forceNewWindow to false', () => {
    const reuse = buildOpenFolderWindowOptions(false) as Record<string, unknown>;

    expect(reuse.forceNewWindow)
      .toBeUndefined();
  });

  it('emits exactly one mutually-exclusive flag', () => {
    for (const forceNew of [
      true,
      false,
    ]) {
      const opts = buildOpenFolderWindowOptions(forceNew) as Record<string, unknown>;

      expect(Object.keys(opts))
        .toHaveLength(1);
    }
  });
});
