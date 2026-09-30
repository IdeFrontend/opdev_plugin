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
import * as os from 'os';
import * as path from 'path';

import {
  detectOperatorExampleModes,
  resolveExampleMode,
  toExampleMatcher,
  DEFAULT_EXAMPLE_MATCHERS,
  isExampleTarget,
  rewriteExampleTarget,
} from '@plugin/domain/utils/operator-example-mode';

/**
 * The run_example mode (eager → test_aclnn_*.cpp, graph → test_geir_*.cpp) is a
 * property of the operator, not a plugin-wide preference. `pows`
 * ships only a graph example, so a hard `eager` default made build.sh exit with
 * `ERROR: pows does not have eager examples`. These cover the on-disk detection that lets
 * the plugin pick the right mode per operator.
 */
describe('operator-example-mode (per-operator run_example modes)', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-math-'));

    // eager + graph (abs-style)
    fs.mkdirSync(path.join(root, 'math', 'abs', 'examples'), { recursive: true });
    fs.writeFileSync(path.join(root, 'math', 'abs', 'examples', 'test_aclnn_abs.cpp'), '');
    fs.writeFileSync(path.join(root, 'math', 'abs', 'examples', 'test_geir_abs.cpp'), '');

    // graph only (pows-style)
    fs.mkdirSync(path.join(root, 'math', 'pows', 'examples'), { recursive: true });
    fs.writeFileSync(path.join(root, 'math', 'pows', 'examples', 'test_geir_pows.cpp'), '');

    // experimental ops live under a top-level experimental/ tree (build.sh search_path="../experimental")
    fs.mkdirSync(path.join(root, 'experimental', 'math', 'expop', 'examples'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'experimental', 'math', 'expop', 'examples', 'test_aclnn_expop.cpp'),
      '',
    );

    // noise dir that must never be descended into
    fs.mkdirSync(path.join(root, 'build', 'decoy', 'examples'), { recursive: true });
    fs.writeFileSync(path.join(root, 'build', 'decoy', 'examples', 'test_aclnn_decoy.cpp'), '');

    // operator using a non-build.sh example naming convention
    fs.mkdirSync(path.join(root, 'ops', 'customop', 'examples'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ops', 'customop', 'examples', 'demo_graph_customop.cpp'), '');
  });

  afterAll(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  describe('detectOperatorExampleModes', () => {
    it('detects both modes for an operator that ships aclnn + geir examples', () => {
      expect(detectOperatorExampleModes(root, 'abs'))
        .toEqual({
          hasEager: true,
          hasGraph: true,
        });
    });

    it('detects only graph for pows', () => {
      expect(detectOperatorExampleModes(root, 'pows'))
        .toEqual({
          hasEager: false,
          hasGraph: true,
        });
    });

    it('ignores experimental examples by default and finds them when asked', () => {
      expect(detectOperatorExampleModes(root, 'expop'))
        .toEqual({
          hasEager: false,
          hasGraph: false,
        });
      expect(detectOperatorExampleModes(root, 'expop', true))
        .toEqual({
          hasEager: true,
          hasGraph: false,
        });
    });

    it('skips build/ and other noise directories', () => {
      expect(detectOperatorExampleModes(root, 'decoy'))
        .toEqual({
          hasEager: false,
          hasGraph: false,
        });
    });

    it('returns nothing for an unknown operator or empty inputs', () => {
      expect(detectOperatorExampleModes(root, 'nope'))
        .toEqual({
          hasEager: false,
          hasGraph: false,
        });
      expect(detectOperatorExampleModes('', 'abs'))
        .toEqual({
          hasEager: false,
          hasGraph: false,
        });
    });

    it('honors custom RegExp matchers for projects with a different naming convention', () => {
      // The default (build.sh) matchers do not match demo_graph_customop.cpp.
      expect(detectOperatorExampleModes(root, 'customop'))
        .toEqual({
          hasEager: false,
          hasGraph: false,
        });
      expect(detectOperatorExampleModes(root, 'customop', false, {
        eager: /^demo_eager_.*\.cpp$/,
        graph: /^demo_graph_.*\.cpp$/,
      }))
        .toEqual({
          hasEager: false,
          hasGraph: true,
        });
    });
  });

  describe('toExampleMatcher', () => {
    it('falls back to the default for empty/undefined/invalid patterns', () => {
      expect(toExampleMatcher(undefined, DEFAULT_EXAMPLE_MATCHERS.eager))
        .toBe(DEFAULT_EXAMPLE_MATCHERS.eager);
      expect(toExampleMatcher('   ', DEFAULT_EXAMPLE_MATCHERS.eager))
        .toBe(DEFAULT_EXAMPLE_MATCHERS.eager);
      // invalid regex (unterminated character class) → fallback, never throws
      expect(toExampleMatcher('test_aclnn_[', DEFAULT_EXAMPLE_MATCHERS.eager))
        .toBe(DEFAULT_EXAMPLE_MATCHERS.eager);
    });

    it('compiles a valid pattern string into a RegExp', () => {
      const matcher = toExampleMatcher('^demo_.*\\.cc$', DEFAULT_EXAMPLE_MATCHERS.eager);

      expect(matcher.test('demo_foo.cc'))
        .toBe(true);
      expect(matcher.test('test_aclnn_foo.cpp'))
        .toBe(false);
    });
  });

  describe('resolveExampleMode', () => {
    it('uses the global setting as a tiebreaker when both modes ship', () => {
      expect(resolveExampleMode(root, 'abs', 'graph'))
        .toEqual({
          mode: 'graph',
          exampleFound: true,
        });
      expect(resolveExampleMode(root, 'abs', 'eager'))
        .toEqual({
          mode: 'eager',
          exampleFound: true,
        });
    });

    it('forces graph for pows even when the global setting is eager', () => {
      expect(resolveExampleMode(root, 'pows', 'eager'))
        .toEqual({
          mode: 'graph',
          exampleFound: true,
        });
    });

    it('flags exampleFound=false and keeps the global mode when nothing ships', () => {
      expect(resolveExampleMode(root, 'nope', 'eager'))
        .toEqual({
          mode: 'eager',
          exampleFound: false,
        });
    });
  });

  describe('rewriteExampleTarget', () => {
    it('takes the prefix from the mode, so a graph-only operator profiles what was built', () => {
      expect(rewriteExampleTarget('/ws/build/test_aclnn_add_custom', 'pows', 'graph'))
        .toBe('/ws/build/test_geir_pows');
    });

    it('keeps the eager prefix for an eager run', () => {
      expect(rewriteExampleTarget('/ws/build/test_aclnn_add_custom', 'abs', 'eager'))
        .toBe('/ws/build/test_aclnn_abs');
    });

    it('repoints a graph target back at an eager one', () => {
      expect(rewriteExampleTarget('/ws/build/test_geir_pows', 'abs', 'eager'))
        .toBe('/ws/build/test_aclnn_abs');
    });

    it('leaves a target that names no example binary alone', () => {
      expect(rewriteExampleTarget('/ws/build/libcustom_opapi.so', 'abs', 'graph'))
        .toBe('/ws/build/libcustom_opapi.so');
      expect(isExampleTarget('/ws/build/libcustom_opapi.so'))
        .toBe(false);
      expect(isExampleTarget(undefined))
        .toBe(false);
    });

    it('recognises both example prefixes, so the rewrite gate stays open for them', () => {
      expect(isExampleTarget('/ws/build/test_aclnn_add_custom'))
        .toBe(true);
      expect(isExampleTarget('/ws/build/test_geir_pows'))
        .toBe(true);
    });

    it('leaves the target alone when no operator is selected', () => {
      expect(rewriteExampleTarget('/ws/build/test_aclnn_add_custom', '', 'graph'))
        .toBe('/ws/build/test_aclnn_add_custom');
    });

    it('keeps a directory that carries the prefix itself', () => {
      expect(rewriteExampleTarget('/ws/test_aclnn_demo/build/test_aclnn_add_custom', 'pows', 'graph'))
        .toBe('/ws/test_aclnn_demo/build/test_geir_pows');
    });
  });
});
