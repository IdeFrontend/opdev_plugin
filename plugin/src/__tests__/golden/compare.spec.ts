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
 * Golden-baseline COMPARE mode.
 *
 * Runs in CI and explicitly to re-capture: re-captures the current behavior and
 * asserts byte-level equality with the committed baseline. A non-empty diff in a commit
 * that claims "no behavior change" means the commit is broken.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  captureAll, GoldenState,
} from './harness';
import { FIXTURE_TYPES } from './fixtures';

function loadBaseline(): GoldenState {
  const baselinePath = path.join(__dirname, 'expected', 'golden.json');

  expect(fs.existsSync(baselinePath))
    .toBe(true);

  return JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as GoldenState;
}

/**
 * Path separators inside command strings are OS-native (`path.join` output) while the
 * committed baseline was captured on a specific OS. Collapse every backslash to a forward
 * slash on BOTH sides before the byte comparison so the gate is green on any host; every
 * other character stays byte-strict.
 */
function normalizeCommandSeparators(command: string): string {
  return command.replace(/\\/g, '/');
}

describe('golden compare', () => {
  it('capture.spec is gated — a plain jest run must not rewrite the baseline', () => {
    // `testMatch` picks up capture.spec.ts on every run and it sorts before this
    // file, so an ungated capture would overwrite the committed baseline with the
    // current code's output before compare reads it — the gate would pass by
    // construction. The guard is the only thing standing between a regression and
    // a baseline that silently absorbed it.
    const captureSource = fs.readFileSync(path.join(__dirname, 'capture.spec.ts'), 'utf8');

    expect(captureSource)
      .toContain('GOLDEN_CAPTURE');
    expect(captureSource)
      .toContain('if (!captureRequested)');
  });

  it('the committed baseline carries no machine-local paths', () => {
    const raw = fs.readFileSync(path.join(__dirname, 'expected', 'golden.json'), 'utf8');
    const violations = [
      /[A-Za-z]:(?![\\/]{2})[\\/](?!n)/,
      /(^|\\|\/)Users[\\/]/,
      /(^|\/)home\//,
      /opdevtools-golden-[a-z0-9]+/i,
    ].filter((pattern) => pattern.test(raw));

    expect(violations)
      .toEqual([]);
  });

  it('matches the committed baseline for every fixture', async () => {
    const baseline = loadBaseline();
    const current = await captureAll();

    for (const fixtureType of FIXTURE_TYPES) {
      const currentCommands: Record<string, unknown> = {};

      for (const [
        key,
        command,
      ] of Object.entries(current[fixtureType].commands)) {
        currentCommands[key] = typeof command === 'string' ? normalizeCommandSeparators(command) : command;
      }

      const baselineCommands: Record<string, unknown> = {};

      for (const [
        key,
        command,
      ] of Object.entries(baseline[fixtureType].commands)) {
        baselineCommands[key] = typeof command === 'string' ? normalizeCommandSeparators(command) : command;
      }

      expect(currentCommands)
        .toEqual(baselineCommands);
      expect(current[fixtureType].errors)
        .toEqual(baseline[fixtureType].errors);
      expect(current[fixtureType].merges)
        .toEqual(baseline[fixtureType].merges);
      expect(current[fixtureType].runtimeConfigs)
        .toEqual(baseline[fixtureType].runtimeConfigs);
      expect(current[fixtureType].sanitizerList)
        .toEqual(baseline[fixtureType].sanitizerList);
    }
  });
});
