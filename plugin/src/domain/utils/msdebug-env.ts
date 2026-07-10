import fs from 'fs-extra';
import path from 'path';

import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { getConfiguredEnvironmentScriptPath } from '@plugin/helpers/operator-project-workspace-config';

/**
 * Keep the generated `<ide>/.env` usable by the `msdebug-mi` debug adapter.
 *
 * The adapter's `msdebug` binary is LLDB-based and needs the CANN
 * `tools/msdebug/lib` folder on `LD_LIBRARY_PATH`; the plain `env` dump the
 * plugin writes at project creation does not contain it (GH-87), so debug
 * sessions fail to start. The helpers here locate that folder from the dump
 * itself (or from the configured CANN `set_env.sh`) and splice it into the
 * `LD_LIBRARY_PATH` line of the dump.
 */

/** `msdebug` (LLDB) runtime libs, relative to a CANN toolkit root. */
const MSDEBUG_LIB_SUBPATH = 'tools/msdebug/lib';

const LD_LIBRARY_PATH_PREFIX = 'LD_LIBRARY_PATH=';

/**
 * Add `libDir` to the `LD_LIBRARY_PATH` line of an env dump (appending the
 * line when absent). Returns the content unchanged when `libDir` is already a
 * path component. The result always ends with a newline.
 */
export function upsertLdLibraryPath(envContent: string, libDir: string): string {
  const lines = envContent.split('\n');

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const index = lines.findIndex((line) => line.startsWith(LD_LIBRARY_PATH_PREFIX));

  if (index === -1) {
    lines.push(`${LD_LIBRARY_PATH_PREFIX}${libDir}`);
  }
  else {
    const value = lines[index].slice(LD_LIBRARY_PATH_PREFIX.length);

    if (value.split(':')
      .includes(libDir)) {
      return envContent;
    }

    lines[index] = value
      ? `${lines[index]}:${libDir}`
      : `${LD_LIBRARY_PATH_PREFIX}${libDir}`;
  }

  return `${lines.join('\n')}\n`;
}

/**
 * First existing `tools/msdebug/lib` dir, probing the CANN roots from the env
 * dump (`ASCEND_TOOLKIT_HOME`, then `ASCEND_HOME_PATH`), then the directory of
 * the configured `set_env.sh` — both the `cann-<ver>/set_env.sh` layout and
 * the `ascend-toolkit/set_env.sh` + `latest/` layout.
 */
export function resolveMsdebugLibDir(
  envVars: Record<string, string | undefined>,
  setEnvScriptPath?: string,
  dirExists: (dir: string)=> boolean = fs.existsSync,
): string | undefined {
  const candidates: string[] = [];

  for (const name of [
    'ASCEND_TOOLKIT_HOME',
    'ASCEND_HOME_PATH',
  ]) {
    const home = envVars[name]?.trim();

    if (home) {
      candidates.push(path.posix.join(home, MSDEBUG_LIB_SUBPATH));
    }
  }

  const script = setEnvScriptPath?.trim();

  if (script) {
    const scriptDir = path.posix.dirname(script);

    candidates.push(
      path.posix.join(scriptDir, MSDEBUG_LIB_SUBPATH),
      path.posix.join(scriptDir, 'latest', MSDEBUG_LIB_SUBPATH),
    );
  }

  return candidates.find((dir) => dirExists(dir));
}

/**
 * Cheap `set_env.sh` lookup for {@link ensureMsdebugLibInEnvFile} callers:
 * explicit workspace setting → `ASCEND_ENV_SCRIPT` snapshot. Unlike
 * `resolveCannSetEnvScriptForDetection` it never runs `find /`, so it is safe
 * on the debug-start path.
 */
export function getKnownSetEnvScriptPath(): string | undefined {
  return getConfiguredEnvironmentScriptPath() ?? getGlobalEnvSnapshot().ascendEnvScript;
}

function parseEnvAssignments(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

/**
 * Splice the msdebug lib dir into `LD_LIBRARY_PATH` of `<ide>/.env` under
 * `workspaceRoot`. No-op (returns false) when the file is missing, no
 * existing lib dir can be resolved, or the dir is already on the path.
 */
export async function ensureMsdebugLibInEnvFile(
  workspaceRoot: string,
  setEnvScriptPath?: string,
  dirExists: (dir: string)=> boolean = fs.existsSync,
): Promise<boolean> {
  const envFilePath = joinIdeConfigPath(workspaceRoot, '.env');

  if (!fs.existsSync(envFilePath)) {
    return false;
  }

  const content = await fs.readFile(envFilePath, 'utf-8');
  const libDir = resolveMsdebugLibDir(
    parseEnvAssignments(content),
    setEnvScriptPath,
    dirExists,
  );

  if (!libDir) {
    return false;
  }

  const updated = upsertLdLibraryPath(content, libDir);

  if (updated === content) {
    return false;
  }

  await fs.writeFile(envFilePath, updated, 'utf-8');

  return true;
}

/**
 * GH-87: best-effort backfill before a debug session; never throws.
 */
export async function backfillMsdebugLibInEnvFile(workspaceRoot: string): Promise<void> {
  try {
    await ensureMsdebugLibInEnvFile(workspaceRoot, getKnownSetEnvScriptPath());
  }
  catch (e) {
    console.warn('ensureMsdebugLibInEnvFile failed (continuing):', e);
  }
}
