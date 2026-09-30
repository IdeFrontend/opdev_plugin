/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export function parse_cmd_options(optionsStr: string | null): Record<string, string> | null {
  if (!optionsStr) {
    return null;
  }

  const res: Record<string, string> = {};
  const parts = optionsStr
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const m = part.match(/^(?:--)?([a-zA-Z0-9_-]+)=(.*)$/);

    if (m) {
      res[m[1]] = m[2];
    }
  }

  return res;
}
