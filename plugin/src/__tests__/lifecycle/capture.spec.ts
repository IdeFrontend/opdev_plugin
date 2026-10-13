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
 * Lifecycle snapshot capture.
 *
 * Runs every creation/open case against the REAL stored-baseline flows and writes
 * the resulting snapshot to lifecycle/expected/<flow>-<caseId>.json. These files
 * are the committed parity baseline for the settings-native runtime.
 *
 * The snapshots are written ONLY when this spec is run explicitly
 * (`lifecycle:capture`, i.e. the spec file name is on the jest command line) or
 * when LIFECYCLE_CAPTURE=1 — a plain `jest` run never overwrites the baseline.
 */
import {
  CREATION_CASES,
  OPEN_CASES,
} from './fixtures';
import {
  runCreationFlow,
  runOpenFlow,
} from './flows';
import { writeSnapshot } from './helpers';

const CREATION_IDS = CREATION_CASES.map((c) => c.id);
const OPEN_IDS = OPEN_CASES.map((c) => c.id);

const captureRequested = process.env.LIFECYCLE_CAPTURE === '1'
  || process.argv.some((arg) => arg.includes('lifecycle/capture.spec'));

describe('lifecycle capture', () => {
  beforeAll(() => {
    if (!captureRequested) {
      // Guard: full `jest` runs must never rewrite the committed baseline.
      console.warn('[lifecycle] capture requested but not in capture mode; use lifecycle:capture');
    }
  });

  describe.each(CREATION_IDS)('creation %s', (caseId) => {
    it(`captures createdProject baseline for ${caseId}`, async () => {
      if (!captureRequested) {
        return;
      }

      const snapshot = await runCreationFlow(caseId);

      writeSnapshot(caseId, 'creation', snapshot);
    });
  });

  describe.each(OPEN_IDS)('open %s', (caseId) => {
    it(`captures open baseline for ${caseId}`, async () => {
      if (!captureRequested) {
        return;
      }

      const snapshot = await runOpenFlow(caseId);

      writeSnapshot(caseId, 'open', snapshot);
    });
  });
});
