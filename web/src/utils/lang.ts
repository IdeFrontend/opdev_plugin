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
 * Language code injected by the plugin (replaces {{lang}} in HTML).
 * Normalized to lowercase so "zh-CN" matches i18n resource key "zh-cn".
 */
export function getWebviewLang(): string {
  const win = typeof window !== 'undefined' ? (window as unknown as { __VSCODE_LANG__?: string }) : null;
  const raw = win?.__VSCODE_LANG__;
  const resolved = (raw || 'en').toLowerCase();

  // Debug: in Extension Development Host, open Webview DevTools (right-click webview → "Open Webview Developer Tools") to see this
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[OP DevTools i18n]', {
      __VSCODE_LANG__: raw,
      resolved,
      note: 'If __VSCODE_LANG__ is undefined or "{{lang}}", the plugin did not inject the locale.',
    });
  }

  return resolved;
}
