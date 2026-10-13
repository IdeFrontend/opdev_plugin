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
 * Lifecycle parity compare.
 *
 * Re-runs every creation/open case against the CURRENT code and compares the
 * result with the committed baseline (lifecycle/expected/*.json) through the
 * delta manifest: differences are tolerated ONLY for
 * settings structure (`op-devtools.*` keys). The source stores are compared
 * strictly — the importer never deletes them.
 * Everything else must match byte-for-byte.
 */
import {
  CREATION_CASES,
  OPEN_CASES,
} from './fixtures';
import {
  runCreationFlow,
  runOpenFlow,
} from './flows';
import {
  compareSnapshots,
  loadSnapshot,
} from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const CREATION_IDS = CREATION_CASES.map((c) => c.id);
const OPEN_IDS = OPEN_CASES.map((c) => c.id);

/**
 * Committed baselines must never contain machine-local paths (temp roots, home
 * dirs, user names) — the capture normalization rewrites them to `<root>` /
 * `<home>` / `<ts>` placeholders BEFORE the baseline is written. A leak here
 * means a recapture on some machine committed its own paths.
 */
const LOCAL_PATH_PATTERNS = [
  /[A-Za-z]:(?![\\/]{2})[\\/](?!n)/, // Windows drive paths (C:\..., C:/...); no https:// URLs, no JSON-escaped \n
  /(^|\\|\/)Users[\\/]/, // Windows user profile segment
  /(^|\/)home\//, // POSIX home segment
  /(^|\/)Users?\//, // macOS /Users/...
  /opdevtools-(golden|lifecycle|switch|importer|creation|open)-[a-z0-9]+/i, // temp roots
];

describe('committed baselines carry no machine-local paths', () => {
  it('every lifecycle expected/*.json is free of local paths', () => {
    const expectedDir = path.resolve(__dirname, 'expected');
    const violations: string[] = [];

    for (const file of fs.readdirSync(expectedDir)) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const content = fs.readFileSync(path.join(expectedDir, file), 'utf8');

      for (const pattern of LOCAL_PATH_PATTERNS) {
        const matches = content.match(pattern);

        if (matches) {
          violations.push(`${file}: ${pattern} at "${content.slice(Math.max(0, (matches.index ?? 0) - 30), (matches.index ?? 0) + 60)}"`);
        }
      }
    }

    expect(violations)
      .toEqual([]);
  });
});

describe('lifecycle parity', () => {
  describe.each(CREATION_IDS)('creation %s', (caseId) => {
    it(`matches the committed baseline for ${caseId}`, async () => {
      const expected = loadSnapshot(caseId, 'creation');
      const actual = await runCreationFlow(caseId);
      const result = compareSnapshots(expected, actual, 'creation');

      for (const delta of result.tolerated) {
        console.warn(`[lifecycle] tolerated delta (${caseId}): ${delta}`);
      }

      expect({
        pass: result.pass,
        diffs: result.diffs,
      })
        .toEqual({
          pass: true,
          diffs: [],
        });
    });
  });

  describe.each(OPEN_IDS)('open %s', (caseId) => {
    it(`matches the committed baseline for ${caseId}`, async () => {
      const expected = loadSnapshot(caseId, 'open');
      const actual = await runOpenFlow(caseId);
      const result = compareSnapshots(expected, actual, 'open');

      for (const delta of result.tolerated) {
        console.warn(`[lifecycle] tolerated delta (${caseId}): ${delta}`);
      }

      expect({
        pass: result.pass,
        diffs: result.diffs,
      })
        .toEqual({
          pass: true,
          diffs: [],
        });
    });
  });
});
