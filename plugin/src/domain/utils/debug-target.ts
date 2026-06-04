import fs from 'fs-extra';
import path from 'path';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

/**
 * Resolve the debug-target executable deterministically — no guessing.
 *
 * The debug build emits the operator's executable as `build/<operatorName>`:
 * the CMakeLists `add_executable(<target>)` target name equals the operator
 * name (the operator folder name), for both the AscendC templates and the
 * standard-custom (`AbstractOperatorPlugin`) `build/<op_name>` layout.
 *
 * The caller passes the regular file names found directly under `build/`. We
 * return the operator's binary only when it is actually present there; when the
 * operator name is unknown or its binary was not built, we return `undefined`
 * so the caller leaves the existing target untouched rather than pointing the
 * debugger at a file that does not exist.
 */
export function resolveDebugTargetBinary(
  fileNames: string[],
  operatorName?: string,
): string | undefined {
  const op = operatorName?.trim();

  if (!op) {
    return undefined;
  }

  return fileNames.includes(op) ? op : undefined;
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

function resolveTargetPath(target: string, workspaceRoot: string): string {
  return target
    .replace('${workspaceFolder}', workspaceRoot)
    .replace('${workspaceFolderBasename}', path.basename(workspaceRoot));
}

/**
 * Auto-adapt the `msdebug` / `msdebug-cpu` target in `<ide>/launch.json` to the
 * actual built binary in `build/`, unless the user already set a valid target.
 * No-op when launch.json is missing/unparseable or no binary is found.
 */
export async function updateMsdebugTarget(
  workspaceRoot: string,
  operatorName?: string,
): Promise<void> {
  const launchJsonPath = joinIdeConfigPath(workspaceRoot, 'launch.json');

  if (!fs.existsSync(launchJsonPath)) {
    return;
  }

  const binary = resolveDebugTargetBinary(
    listBuildFiles(path.join(workspaceRoot, 'build')),
    operatorName,
  );

  if (!binary) {
    return;
  }

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
      cfg.target = `\${workspaceFolder}/build/${binary}`;
      changed = true;
    }
  }

  if (changed) {
    await fs.writeFile(launchJsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
  }
}
