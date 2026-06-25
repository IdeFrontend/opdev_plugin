import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  detectOperatorExampleModes,
  resolveExampleMode,
  toExampleMatcher,
  DEFAULT_EXAMPLE_MATCHERS,
} from '@plugin/domain/utils/operator-example-mode';

/**
 * plugin_release #171: the run_example mode (eager → test_aclnn_*.cpp, graph →
 * test_geir_*.cpp) is a property of the operator, not a plugin-wide preference. `pows`
 * ships only a graph example, so a hard `eager` default made build.sh exit with
 * `ERROR: pows does not have eager examples`. These cover the on-disk detection that lets
 * the plugin pick the right mode per operator.
 */
describe('operator-example-mode (plugin_release #171)', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-math-'));

    // eager + graph (abs-style)
    fs.mkdirSync(path.join(root, 'math', 'abs', 'examples'), { recursive: true });
    fs.writeFileSync(path.join(root, 'math', 'abs', 'examples', 'test_aclnn_abs.cpp'), '');
    fs.writeFileSync(path.join(root, 'math', 'abs', 'examples', 'test_geir_abs.cpp'), '');

    // graph only (pows-style, the #171 operator)
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
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('detectOperatorExampleModes', () => {
    it('detects both modes for an operator that ships aclnn + geir examples', () => {
      expect(detectOperatorExampleModes(root, 'abs'))
        .toEqual({ hasEager: true, hasGraph: true });
    });

    it('detects only graph for pows', () => {
      expect(detectOperatorExampleModes(root, 'pows'))
        .toEqual({ hasEager: false, hasGraph: true });
    });

    it('ignores experimental examples by default and finds them when asked', () => {
      expect(detectOperatorExampleModes(root, 'expop'))
        .toEqual({ hasEager: false, hasGraph: false });
      expect(detectOperatorExampleModes(root, 'expop', true))
        .toEqual({ hasEager: true, hasGraph: false });
    });

    it('skips build/ and other noise directories', () => {
      expect(detectOperatorExampleModes(root, 'decoy'))
        .toEqual({ hasEager: false, hasGraph: false });
    });

    it('returns nothing for an unknown operator or empty inputs', () => {
      expect(detectOperatorExampleModes(root, 'nope'))
        .toEqual({ hasEager: false, hasGraph: false });
      expect(detectOperatorExampleModes('', 'abs'))
        .toEqual({ hasEager: false, hasGraph: false });
    });

    it('honors custom RegExp matchers for projects with a different naming convention', () => {
      // The default (build.sh) matchers do not match demo_graph_customop.cpp.
      expect(detectOperatorExampleModes(root, 'customop'))
        .toEqual({ hasEager: false, hasGraph: false });
      expect(detectOperatorExampleModes(root, 'customop', false, {
        eager: /^demo_eager_.*\.cpp$/,
        graph: /^demo_graph_.*\.cpp$/,
      }))
        .toEqual({ hasEager: false, hasGraph: true });
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
        .toEqual({ mode: 'graph', exampleFound: true });
      expect(resolveExampleMode(root, 'abs', 'eager'))
        .toEqual({ mode: 'eager', exampleFound: true });
    });

    it('forces graph for pows even when the global setting is eager', () => {
      expect(resolveExampleMode(root, 'pows', 'eager'))
        .toEqual({ mode: 'graph', exampleFound: true });
    });

    it('flags exampleFound=false and keeps the global mode when nothing ships', () => {
      expect(resolveExampleMode(root, 'nope', 'eager'))
        .toEqual({ mode: 'eager', exampleFound: false });
    });
  });
});
