import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

import {
  resolveCannSetEnvScriptWithoutScan,
  shellSourcePrefix,
} from '@plugin/domain/utils/ascend-detection-env';

const ASCEND_HOME_TIMEOUT_MS = 8000;

const ASCEND_HOME_MARKER = '__OP_DEVTOOLS_ASCEND_HOME__';

const execAsync = promisify(exec);

export const CPP_INCLUDE_PATH_SETTING = 'C_Cpp.default.includePath';

export const CPP_BROWSE_PATH_SETTING = 'C_Cpp.default.browse.path';

/**
 * CANN header roots, relative to `ASCEND_HOME_PATH`. Mirrors the
 * `${env:ASCEND_HOME_PATH}` entries of `contributes.configurationDefaults` in
 * `package.json`; `cann-cpp-include-paths.spec.ts` fails when the two drift.
 */
export const CANN_INCLUDE_PATH_SUFFIXES = [
  'include',
  'include/aclnn',
  'compiler/tikcpp',
  'compiler/tikcpp/tikcfw',
  'compiler/tikcpp/tikcfw/interface',
  'compiler/tikcpp/tikcfw/impl',
  'tools/tikicpulib/lib/include',
];

/** Recursively indexed subset of {@link CANN_INCLUDE_PATH_SUFFIXES}. */
export const CANN_BROWSE_PATH_SUFFIXES = [
  'include',
  'compiler/tikcpp/tikcfw',
  'tools/tikicpulib/lib/include',
];

export type CannCppPaths = {
  includePath: string[];
  browsePath: string[];
};

/** Absolute counterpart of the manifest defaults for one CANN install. */
export function buildCannCppPaths(ascendHomePath: string): CannCppPaths {
  const home = ascendHomePath.trim()
    .replace(/[/\\]+$/, '');

  return {
    includePath: [
      '${workspaceFolder}/**',
      ...CANN_INCLUDE_PATH_SUFFIXES.map((suffix) => `${home}/${suffix}`),
    ],
    browsePath: [
      '${workspaceFolder}',
      ...CANN_BROWSE_PATH_SUFFIXES.map((suffix) => `${home}/${suffix}`),
    ],
  };
}

/**
 * True when `value` is exactly what {@link buildCannCppPaths} would have
 * produced for some CANN install, i.e. a value this helper wrote earlier and
 * may overwrite. Anything else belongs to the user and is left alone.
 */
export function isGeneratedCannCppPathValue(value: unknown, kind: keyof CannCppPaths): boolean {
  const suffix = `/${(kind === 'includePath' ? CANN_INCLUDE_PATH_SUFFIXES : CANN_BROWSE_PATH_SUFFIXES)[0]}`;

  if (!Array.isArray(value) || typeof value[1] !== 'string' || !value[1].endsWith(suffix)) {
    return false;
  }

  const home = value[1].slice(0, -suffix.length);

  return JSON.stringify(value) === JSON.stringify(buildCannCppPaths(home)[kind]);
}

/**
 * `ASCEND_HOME_PATH` as the CANN environment script defines it, for extension
 * hosts that were not launched from a shell that sourced it (desktop launcher,
 * Remote-SSH without a login shell). Returns undefined when no script is found
 * or it does not export the variable.
 */
export async function resolveAscendHomePathFromEnvScript(): Promise<string | undefined> {
  const setEnv = resolveCannSetEnvScriptWithoutScan();

  if (!setEnv) {
    return undefined;
  }

  try {
    const { stdout } = await execAsync(
      `${shellSourcePrefix(setEnv.path)}printf '\\n${ASCEND_HOME_MARKER}%s\\n' "$ASCEND_HOME_PATH"`,
      {
        shell: '/bin/bash',
        timeout: ASCEND_HOME_TIMEOUT_MS,
      },
    );

    // A chatty set_env.sh writes its own banner to stdout, so read the marked
    // line instead of the whole output.
    const marked = stdout.split('\n')
      .find((line) => line.startsWith(ASCEND_HOME_MARKER));

    return marked?.slice(ASCEND_HOME_MARKER.length)
      .trim() || undefined;
  }
  catch {
    return undefined;
  }
}

async function writeGeneratedPathSetting(
  key: string,
  value: string[],
  kind: keyof CannCppPaths,
  logDebug: (message: string, payload?: unknown)=> void,
  onlyRefreshExisting = false,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration();
  const inspected = cfg.inspect<string[]>(key);

  if (inspected?.globalValue !== undefined || inspected?.workspaceFolderValue !== undefined) {
    logDebug('cannCppPaths:skip:userOwned', { key });

    return;
  }

  const current = inspected?.workspaceValue;

  if (JSON.stringify(current) === JSON.stringify(value)) {
    return;
  }

  if (current === undefined && onlyRefreshExisting) {
    return;
  }

  if (current !== undefined && !isGeneratedCannCppPathValue(current, kind)) {
    logDebug('cannCppPaths:skip:userOwned', { key });

    return;
  }

  try {
    // Throws when no installed extension registered `C_Cpp.*` (Microsoft C/C++
    // absent), which must not abort the sibling key.
    await cfg.update(key, value, vscode.ConfigurationTarget.Workspace);
    logDebug('cannCppPaths:written', {
      key,
      value,
    });
  }
  catch (error) {
    logDebug('cannCppPaths:writeFailed', {
      key,
      error,
    });
  }
}

/**
 * Writes both path settings for one resolved CANN install. With
 * `onlyRefreshExisting`, corrects a value this helper wrote earlier but does
 * not introduce one where the workspace has none.
 */
export async function applyCannCppPathsToWorkspace(
  ascendHomePath: string,
  logDebug: (message: string, payload?: unknown)=> void,
  onlyRefreshExisting = false,
): Promise<void> {
  const paths = buildCannCppPaths(ascendHomePath);

  await writeGeneratedPathSetting(CPP_INCLUDE_PATH_SETTING, paths.includePath, 'includePath', logDebug, onlyRefreshExisting);
  await writeGeneratedPathSetting(CPP_BROWSE_PATH_SETTING, paths.browsePath, 'browsePath', logDebug, onlyRefreshExisting);
}

/**
 * Writes absolute CANN include paths into workspace settings when the manifest
 * defaults cannot resolve them. The packaged `${env:ASCEND_HOME_PATH}` defaults
 * only expand against the extension host environment, so an IDE started without
 * `set_env.sh` sourced gets no go-to-definition for CANN headers at all.
 *
 * Writes nothing new when the variable is already visible (defaults expand on
 * their own — an earlier generated value is only refreshed), when no CANN
 * environment script is found, or when the user set these keys themselves.
 * Runs from post-activate bootstrap only, so activation is not affected.
 */
export async function maybeApplyCannCppIncludePaths(logDebug: (message: string, payload?: unknown)=> void): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return;
  }

  const visibleAscendHome = process.env.ASCEND_HOME_PATH?.trim();

  if (visibleAscendHome) {
    logDebug('cannCppPaths:skip:envVisible');

    // The manifest defaults expand on their own now, but a value written on a
    // host without the variable (committed .vscode/settings.json, different
    // CANN location) would shadow them with stale absolute paths.
    await applyCannCppPathsToWorkspace(visibleAscendHome, logDebug, true);

    return;
  }

  const ascendHomePath = await resolveAscendHomePathFromEnvScript();

  if (!ascendHomePath) {
    logDebug('cannCppPaths:skip:noAscendHome');

    return;
  }

  await applyCannCppPathsToWorkspace(ascendHomePath, logDebug);
}
