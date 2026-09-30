/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { TRITON_SANITIZER_SPAWN_ENV } from '@plugin/domain/constants/triton-sanitizer-env';

// Allowlist of keys that are emitted as shell `export`s. Other spawn-env values
// (e.g. SUPPORT_COMPUTE_UNIT / SUPPORT_TILING_DIR) are passed via CMake, not the shell.
const ASCEND_EXPORT_KEYS: readonly string[] = [
  'SOC_VERSION',
  'NPU_ARCH',
  ...Object.keys(TRITON_SANITIZER_SPAWN_ENV),
];

const SOURCE_PREFIX_RE = /^\.\s+[^&]+\s+&&\s+/;

export function shellQuoteBash(value: string): string {
  return `'${value.replace(/'/g, '\'\\\'\'')}'`;
}

export function formatAscendEnvExports(env: Record<string, string>): string {
  const parts: string[] = [];

  for (const key of ASCEND_EXPORT_KEYS) {
    const value = env[key];

    if (value === undefined || value.trim() === '') {
      continue;
    }

    parts.push(`export ${key}=${shellQuoteBash(value)}`);
  }

  return parts.join(' && ');
}

export function injectAscendEnvExports(command: string, env: Record<string, string>): string {
  const exports = formatAscendEnvExports(env);

  if (!exports) {
    return command;
  }

  const match = command.match(SOURCE_PREFIX_RE);

  if (match) {
    const prefix = match[0];
    const rest = command.slice(prefix.length);

    return `${exports} && ${prefix}${rest}`;
  }

  return `${exports} && ${command}`;
}
