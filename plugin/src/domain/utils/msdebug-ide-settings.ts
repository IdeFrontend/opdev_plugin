/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';
import { guardedPersistIdeSettingsFile } from '@plugin/helpers/ide-settings-persist';

/** MindStudio Debug expects kernel sources (e.g. Triton `.cce`/`.asc`) as C++ for breakpoints. */
export const MSDEBUG_KERNEL_FILE_ASSOCIATIONS: Readonly<Record<string, string>> = {
  '*.cce': 'cpp',
  '*.asc': 'cpp',
};

/**
 * Merge msdebug-related `files.associations` into workspace `<ide>/settings.json`
 * without removing existing user settings. Goes through the shared guarded persist
 * (serialized with other settings.json writers, content-diff guard, tolerant read —
 * a corrupt settings.json is never overwritten, the write backs off instead of throwing).
 */
export async function ensureMsdebugBreakpointFileAssociations(workspaceRoot: string): Promise<void> {
  const settingsPath = getIdeSettingsFilePath(workspaceRoot);

  await guardedPersistIdeSettingsFile(settingsPath, (current) => {
    const associations = {
      ...MSDEBUG_KERNEL_FILE_ASSOCIATIONS,
      ...(typeof current['files.associations'] === 'object' && current['files.associations'] !== null
        ? current['files.associations'] as Record<string, string>
        : {}),
    };

    return {
      next: {
        ...current,
        'files.associations': associations,
      },
    };
  });
}
