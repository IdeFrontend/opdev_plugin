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
 * Build the options for `vscode.openFolder` from the chosen window intent.
 *
 * `forceNewWindow: false` does NOT force the current window to be reused: when a folder
 * is already open VS Code falls back to the `window.openFoldersInNewWindow` setting, which
 * by default opens a NEW window — picking "Current Window" would still spawn a new
 * window. Passing `forceReuseWindow: true` reliably reuses the current window. The two
 * flags are mutually exclusive, so we emit exactly one.
 *
 * @param forceNewWindow true to open in a new window, false to reuse the current window
 * @returns the `vscode.openFolder` options object carrying exactly one of the two flags
 */
export function buildOpenFolderWindowOptions(forceNewWindow: boolean): { forceNewWindow: true } | { forceReuseWindow: true } {
  return forceNewWindow ? { forceNewWindow: true } : { forceReuseWindow: true };
}
