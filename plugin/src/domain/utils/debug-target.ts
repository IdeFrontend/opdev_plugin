import fs from 'fs-extra';
import path from 'path';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

/**
 * Debug-target file names the build can emit for an operator, in priority order.
 *
 * These mirror the operator plugins' `getDefaultPaths().targetExampleFile`, the
 * only executables msdebug (NPU/CPU, C/C++) ever attaches to:
 *   - AscendC (`ascend.plugin`):       `build/test_aclnn_<op_name>`
 *   - standard-custom / cann
 *     (`abstract-operator-plugin`):    `build/<op_name>`
 * Python operators debug via `msdebug-python`, so no Python artifact belongs here.
 *
 * The `test_aclnn_<op>` example is preferred because, when an AscendC operator
 * builds both, it is the runnable end-to-end binary the debugger should attach to.
 */
export function debugTargetCandidates(operatorName?: string): string[] {
  const op = operatorName?.trim();

  if (!op) {
    return [];
  }

  return [
    `test_aclnn_${op}`,
    op,
  ];
}

/**
 * Resolve the debug-target executable deterministically — no guessing.
 *
 * Given the regular file names found directly under an operator's `build/`
 * directory and the plugin-declared candidate names (see `debugTargetCandidates`),
 * return the first candidate that was actually built. Returns `undefined` when no
 * candidate is present, so the caller leaves the existing target untouched rather
 * than pointing the debugger at a file that does not exist.
 */
export function resolveDebugTargetBinary(
  buildFiles: string[],
  candidateBasenames: string[],
): string | undefined {
  return candidateBasenames.find((name) => buildFiles.includes(name));
}

/** The untouched template target — a placeholder that rarely matches the binary. */
const DEFAULT_TARGET = '${workspaceFolder}/build/${workspaceFolderBasename}';

/**
 * Decide whether to overwrite a debug config's `target`. Replace the known-bad
 * default placeholder, a missing target, or one that points to a file that does
 * not exist. Never replace a user-set target that resolves to a real file.
 */
export function shouldReplaceDebugTarget(
  currentTarget: string | undefined,
  currentTargetExists: boolean,
): boolean {
  if (!currentTarget || currentTarget === DEFAULT_TARGET) {
    return true;
  }

  return !currentTargetExists;
}

/** Regular-file names directly under `buildDir` (empty when it is absent). */
export function listBuildFiles(buildDir: string): string[] {
  if (!fs.existsSync(buildDir)) {
    return [];
  }

  return fs.readdirSync(buildDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

/**
 * Express an absolute binary path as a `${workspaceFolder}`-relative launch.json
 * target. Falls back to an absolute (posix-separated) path when the binary lives
 * outside the workspace root.
 */
export function toWorkspaceRelativeTarget(
  workspaceRoot: string,
  absTargetPath: string,
): string {
  const rel = path.relative(workspaceRoot, absTargetPath);

  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return absTargetPath.split(path.sep)
      .join('/');
  }

  return `\${workspaceFolder}/${rel.split(path.sep)
    .join('/')}`;
}

function resolveTargetPath(target: string, workspaceRoot: string): string {
  return target
    .replace('${workspaceFolder}', workspaceRoot)
    .replace('${workspaceFolderBasename}', path.basename(workspaceRoot));
}

/**
 * Auto-adapt the `msdebug` / `msdebug-cpu` target in `<ide>/launch.json` to the
 * actual built binary, unless the user already set a valid target.
 *
 * The binary is resolved under the selected operator's own `build/` directory
 * (`<operator.path>/build`), not the workspace root: standard-custom operators
 * (e.g. ops-math) live in nested collection sub-folders and build there, so the
 * workspace-root `build/` is empty. No-op when launch.json is missing/unparseable,
 * no operator is given, or the operator's binary was not built.
 */
export async function updateMsdebugTarget(
  workspaceRoot: string,
  operator?: { name: string;
    path: string },
): Promise<void> {
  const launchJsonPath = joinIdeConfigPath(workspaceRoot, 'launch.json');

  if (!fs.existsSync(launchJsonPath) || !operator?.name || !operator?.path) {
    return;
  }

  const buildDir = path.join(operator.path, 'build');
  const binary = resolveDebugTargetBinary(
    listBuildFiles(buildDir),
    debugTargetCandidates(operator.name),
  );

  if (!binary) {
    return;
  }

  const newTarget = toWorkspaceRelativeTarget(workspaceRoot, path.join(buildDir, binary));

  let parsed: { configurations?: Array<Record<string, unknown>> };

  try {
    parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));
  }
  catch {
    return;
  }

  if (!Array.isArray(parsed.configurations)) {
    return;
  }

  let changed = false;

  for (const cfg of parsed.configurations) {
    if (cfg.name !== 'msdebug' && cfg.name !== 'msdebug-cpu') {
      continue;
    }

    const current = typeof cfg.target === 'string' ? cfg.target : undefined;
    const exists = !!current && fs.existsSync(resolveTargetPath(current, workspaceRoot));

    if (shouldReplaceDebugTarget(current, exists)) {
      cfg.target = newTarget;
      changed = true;
    }
  }

  if (changed) {
    await fs.writeFile(launchJsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
  }
}
