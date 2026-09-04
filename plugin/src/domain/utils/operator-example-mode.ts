import * as fs from 'fs';
import * as path from 'path';

/**
 * Example execution modes understood by ops-math `build.sh --run_example <op> <mode>`:
 * `eager` compiles/runs the aclnn example (`test_aclnn_<op>.cpp`), `graph` the GE IR
 * example (`test_geir_<op>.cpp`). Which one an operator actually ships is a property of
 * the operator (its `examples/` directory), not a user preference — so a single
 * plugin-wide `executionMode` setting cannot be right for every operator in a project
 * (`pows` ships only a graph example, so a hard `eager` default made build.sh exit with
 * `ERROR: pows does not have eager examples`).
 */
export type ExampleMode = 'eager' | 'graph';

/**
 * Per-mode regular expressions matched against an example **filename** (basename) to decide
 * whether an operator ships an eager/graph example. The defaults encode the ops-math
 * `build.sh` contract (`test_aclnn_*.cpp` / `test_geir_*.cpp`), which the plugin's own
 * operator templates also follow. The `test_aclnn_`/`test_geir_` naming is specific to the
 * ops-math family of CANN operator repos (not a CANN-wide standard — e.g. cann-ops-adv
 * names aclnn examples `test_<op>.cpp`), so the patterns are configurable via the
 * `compileAndDeploy.exampleBuildConfig.{eager,graph}ExamplePattern` settings (RegExp).
 */
export interface ExampleMatchers {
  eager: RegExp;
  graph: RegExp;
}

export const DEFAULT_EXAMPLE_MATCHERS: ExampleMatchers = {
  eager: /^test_aclnn_.*\.cpp$/,
  graph: /^test_geir_.*\.cpp$/,
};

/** The prefix `build.sh` gives the example binary it builds for each mode. */
const EXAMPLE_BINARY_PREFIX: Record<ExampleMode, string> = {
  eager: 'test_aclnn_',
  graph: 'test_geir_',
};

const EXAMPLE_BINARY_PREFIXES = /test_aclnn_|test_geir_/;

/**
 * Whether `targetFile` names a build.sh example binary. cann, pyasc and triton point at their own
 * build output instead, and callers use this to keep the on-disk mode lookup off those flavors.
 */
export function isExampleTarget(targetFile: string | undefined): boolean {
  return !!targetFile && EXAMPLE_BINARY_PREFIXES.test(targetFile);
}

/**
 * Repoints a stored example target at `operatorNames`, keeping its directory and taking the
 * prefix from the mode that will actually be built.
 *
 * Rewriting the operator but not the prefix hands msprof and mssanitizer a path that was never
 * built: an operator shipping only a GE IR example (`pows`) forces graph mode, so the
 * pre-build produces `test_geir_pows` while the run still asks for
 * `test_aclnn_pows`. Nothing stats the path before it reaches the tool.
 *
 * A multi-op selection (`add,sub`) still names ONE binary — the first operator's — because the
 * run_example pre-build compiles only that example; a comma in the binary name could never
 * exist on disk.
 *
 * A target carrying neither prefix is not a build.sh example target — cann, pyasc and triton
 * point at their own build output — so it is returned untouched.
 */
export function rewriteExampleTarget(
  targetFile: string,
  operatorNames: string | undefined,
  mode: ExampleMode,
): string {
  if (!operatorNames || !targetFile) {
    return targetFile;
  }

  const firstOp = operatorNames.split(',')[0]?.trim() || '';

  if (!firstOp) {
    return targetFile;
  }

  // The binary name is the last path segment, so cut at the last prefix: a build directory that
  // itself carries one (`/ws/test_aclnn_demo/build/test_aclnn_add`) must keep its directory.
  const prefixCuts = Object.values(EXAMPLE_BINARY_PREFIX)
    .map((prefix) => targetFile.lastIndexOf(prefix));
  const cut = Math.max(...prefixCuts);

  if (cut < 0) {
    return targetFile;
  }

  return `${targetFile.slice(0, cut)}${EXAMPLE_BINARY_PREFIX[mode]}${firstOp}`;
}

/**
 * Compile a user-supplied pattern string into a matcher RegExp, falling back to `fallback`
 * when the pattern is empty or not a valid regular expression (so a typo never silently
 * disables detection — it just keeps the build.sh default).
 */
export function toExampleMatcher(pattern: string | undefined, fallback: RegExp): RegExp {
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return fallback;
  }

  try {
    return new RegExp(pattern.trim());
  }
  catch {
    return fallback;
  }
}

// Directories never worth descending into when locating an operator's examples.
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'build',
  'out',
  'output',
  'cmake-build',
  '.cache',
  'third_party',
]);

// `<root>/<category>/<op>/examples` is the common layout; cap the walk well above it.
const MAX_DEPTH = 8;

/** True if `dir` directly contains a file whose name matches `matcher`. */
function dirHasExampleFile(dir: string, matcher: RegExp): boolean {
  try {
    return fs
      .readdirSync(dir)
      .some((name) => matcher.test(name));
  }
  catch {
    return false;
  }
}

/**
 * Walk `projectRoot` for `<opName>/examples` and report which run_example modes ship a
 * source file. Mirrors build.sh's find pattern for `{collection}/<op>/examples/*`: a
 * bounded, noise-skipping walk that stops once the operator's own examples directory has
 * been inspected (operator names are unique in the tree). `experimental/` is skipped
 * unless requested, matching build.sh's default exclusion of experimental paths.
 *
 * Scope: only the operator's top-level `examples/` directory is inspected — the A2/A3
 * layout. build.sh additionally searches `examples/arch35/` for
 * `ascend950`; those arch35-only variants are intentionally not inspected here, so for
 * such operators the configured mode is kept and build.sh stays the source of truth.
 */
export function detectOperatorExampleModes(
  projectRoot: string,
  opName: string,
  includeExperimental = false,
  matchers: ExampleMatchers = DEFAULT_EXAMPLE_MATCHERS,
): { hasEager: boolean;
  hasGraph: boolean } {
  const result = {
    hasEager: false,
    hasGraph: false,
  };

  if (!projectRoot || !opName) {
    return result;
  }

  let done = false;

  const walk = (dir: string, depth: number): void => {
    if (done || depth > MAX_DEPTH) {
      return;
    }

    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
      return;
    }

    for (const entry of entries) {
      if (done) {
        return;
      }

      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
        continue;
      }

      if (!includeExperimental && entry.name === 'experimental') {
        continue;
      }

      const full = path.join(dir, entry.name);

      if (entry.name === opName) {
        const examplesDir = path.join(full, 'examples');

        result.hasEager = dirHasExampleFile(examplesDir, matchers.eager);
        result.hasGraph = dirHasExampleFile(examplesDir, matchers.graph);
        done = true;

        return;
      }

      walk(full, depth + 1);
    }
  };

  walk(projectRoot, 0);

  return result;
}

/**
 * Resolve the run_example mode for `opName`. The example file present on disk wins, since
 * passing a mode the operator has no example for makes build.sh exit with
 * `ERROR: <op> does not have <mode> examples`. `globalMode` (the plugin-wide
 * `executionMode` setting) is used only as a tiebreaker when both modes ship, and as the
 * fallback when neither does — in which case `exampleFound` is `false` so the caller can
 * warn before the build inevitably fails.
 */
export function resolveExampleMode(
  projectRoot: string,
  opName: string,
  globalMode: ExampleMode,
  includeExperimental = false,
  matchers: ExampleMatchers = DEFAULT_EXAMPLE_MATCHERS,
): { mode: ExampleMode;
  exampleFound: boolean } {
  const {
    hasEager, hasGraph,
  } = detectOperatorExampleModes(
    projectRoot,
    opName,
    includeExperimental,
    matchers,
  );

  if (hasEager && hasGraph) {
    return {
      mode: globalMode,
      exampleFound: true,
    };
  }

  if (hasEager) {
    return {
      mode: 'eager',
      exampleFound: true,
    };
  }

  if (hasGraph) {
    return {
      mode: 'graph',
      exampleFound: true,
    };
  }

  return {
    mode: globalMode,
    exampleFound: false,
  };
}
