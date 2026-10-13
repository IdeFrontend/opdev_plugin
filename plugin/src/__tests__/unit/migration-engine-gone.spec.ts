/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as path from 'path';

const PLUGIN_SRC = path.resolve(__dirname, '..', '..');

/**
 * The legacy registries and the migration-engine modules are absent —
 * nothing may import them, and the modules themselves must not exist on disk.
 * Comments may mention the old names (e.g. "the RemoteConfig file is gone"),
 * so code lines are compared after stripping comment lines.
 */
const DELETED_MODULES = [
  '@plugin/core/storage/json-storage',
  '@plugin/domain/models/config-model',
  '@plugin/domain/models/config',
  '@plugin/domain/models/model',
  '@plugin/domain/services/configuration',
  '@plugin/domain/services/ops',
  '@plugin/domain/utils/filter-by-project-id',
  '@plugin/helpers/remote-config',
] as const;

function collectSrcFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      }
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  };

  walk(PLUGIN_SRC);

  return files;
}

function codeLines(content: string): string {
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();

      return !(
        trimmed.startsWith('//')
        || trimmed.startsWith('/*')
        || trimmed.startsWith('*')
      );
    })
    .join('\n');
}

describe('legacy registries / migration engine are absent from src', () => {
  it('zero imports of the deleted modules remain anywhere under src', () => {
    const offenders: string[] = [];

    for (const file of collectSrcFiles()) {
      const content = fs.readFileSync(file, 'utf8');

      for (const mod of DELETED_MODULES) {
        if (content.includes(`from '${mod}'`) || content.includes(`require('${mod}'`)) {
          offenders.push(`${path.relative(PLUGIN_SRC, file)} -> ${mod}`);
        }
      }
    }

    expect(offenders)
      .toEqual([]);
  });

  it('the deleted module files themselves are absent', () => {
    for (const mod of DELETED_MODULES) {
      const rel = mod.replace('@plugin/', '');

      expect(fs.existsSync(path.join(PLUGIN_SRC, `${rel}.ts`)))
        .toBe(false);
    }
  });

  it('registry-era API identifiers are absent from the runtime surface (comments allowed)', () => {
    const forbidden = [
      /\bgetRuntimeConfigById\b/,
      /\bRemoteConfig\b/,
      /\bresetLegacyConfig\b/,
      /\bfilterByProjectId\b/,
    ];
    const offenders: string[] = [];

    for (const file of collectSrcFiles()) {
      if (file.includes('__tests__')) {
        continue;
      }

      const content = codeLines(fs.readFileSync(file, 'utf8'));

      if (forbidden.some((re) => re.test(content))) {
        offenders.push(path.relative(PLUGIN_SRC, file));
      }
    }

    expect(offenders)
      .toEqual([]);
  });
});
