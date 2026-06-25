import fs from 'fs-extra';
import path from 'path';
import * as vscode from 'vscode';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

export type DebugOperatorRef = {
  name: string;
  path: string;
};

export type MsdebugTargetPatchResult =
  | { status: 'patched';
    target: string }
  | { status: 'unchanged' }
  | { status: 'noop';
    reason: 'no_launch_json' | 'no_operator' | 'no_binary' | 'user_target' | 'unparseable' };

/**
 * Debug-target file names the build can emit for an operator, in priority order.
 *
 * These mirror the operator plugins' `getDefaultPaths().targetExampleFile`, the
 * only executables msdebug (NPU/CPU, C/C++) ever attaches to:
 *   - AscendC (`ascend.plugin`):       `build/test_aclnn_<op_name>`
 *   - standard-custom / cann
 *     (`abstract-operator-plugin`):    `build/<op_name>`
 * Python operators debug via `msdebug-python`, so no Python artifact belongs here.
 */
export function debugTargetCandidates(operatorName?: string): string[] {
  const op = operatorName?.trim();

  if (!op) {
    return [];
  }

  return [
    `test_aclnn_${op}`,
    `test_geir_${op}`,
    op,
  ];
}

/** Basename of a build_example `target_file` path, when present. */
export function basenameFromTargetFile(targetFile?: string | null): string | undefined {
  if (typeof targetFile !== 'string' || !targetFile.trim()) {
    return undefined;
  }

  const base = path.basename(targetFile.trim());

  return base || undefined;
}

/**
 * Candidate basenames for an operator, preferring an explicit build_example
 * `target_file` basename when supplied (issue #17 / GC-17 next steps).
 */
export function collectDebugTargetCandidates(
  operatorName: string,
  targetFile?: string | null,
): string[] {
  const defaults = debugTargetCandidates(operatorName);
  const fromTargetFile = basenameFromTargetFile(targetFile);

  if (!fromTargetFile || defaults.includes(fromTargetFile)) {
    return defaults;
  }

  return [
    fromTargetFile,
    ...defaults,
  ];
}

/**
 * Resolve the debug-target executable deterministically — no guessing.
 *
 * Given the regular file names found directly under an operator's `build/`
 * directory and the plugin-declared candidate names, return the first candidate
 * that was actually built.
 */
export function resolveDebugTargetBinary(
  buildFiles: string[],
  candidateBasenames: string[],
): string | undefined {
  return candidateBasenames.find((name) => buildFiles.includes(name));
}

/** The untouched template target — a placeholder that rarely matches the binary. */
export const DEFAULT_MSDEBUG_TARGET = '${workspaceFolder}/build/${workspaceFolderBasename}';

/** 1.3.2 auto-adapt wrote workspace-root `build/<name>`; nested ops-math needs replacing. */
const LEGACY_ROOT_BUILD_TARGET = /^\$\{workspaceFolder\}\/build\/[^/]+$/;

/**
 * Decide whether to overwrite a debug config's `target`. Replace the known-bad
 * default placeholder, a missing target, one that points to a missing file, or a
 * stale 1.3.2 workspace-root `build/<op>` path when the nested target is known.
 * Never replace a user-set target outside those cases.
 */
export function shouldReplaceDebugTarget(
  currentTarget: string | undefined,
  currentTargetExists: boolean,
  expectedTarget?: string,
): boolean {
  if (!currentTarget || currentTarget === DEFAULT_MSDEBUG_TARGET) {
    return true;
  }

  if (!currentTargetExists) {
    return true;
  }

  if (expectedTarget
    && currentTarget !== expectedTarget
    && LEGACY_ROOT_BUILD_TARGET.test(currentTarget)) {
    return true;
  }

  return false;
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

export function resolveTargetPath(target: string, workspaceRoot: string): string {
  return target
    .replace('${workspaceFolder}', workspaceRoot)
    .replace('${workspaceFolderBasename}', path.basename(workspaceRoot));
}

/**
 * Resolve the msdebug attach path for an operator, or `undefined` when the
 * binary was not built.
 */
export function resolveMsdebugTargetForOperator(
  workspaceRoot: string,
  operator: DebugOperatorRef,
  targetFile?: string | null,
): string | undefined {
  const buildDir = path.join(operator.path, 'build');
  const binary = resolveDebugTargetBinary(
    listBuildFiles(buildDir),
    collectDebugTargetCandidates(operator.name, targetFile),
  );

  if (!binary) {
    return undefined;
  }

  return toWorkspaceRelativeTarget(workspaceRoot, path.join(buildDir, binary));
}

/**
 * Auto-adapt the `msdebug` / `msdebug-cpu` target in `<ide>/launch.json` to the
 * actual built binary, unless the user already set a valid target.
 */
export async function updateMsdebugTarget(
  workspaceRoot: string,
  operator?: DebugOperatorRef,
  targetFile?: string | null,
): Promise<MsdebugTargetPatchResult> {
  const launchJsonPath = joinIdeConfigPath(workspaceRoot, 'launch.json');

  if (!fs.existsSync(launchJsonPath)) {
    return { status: 'noop', reason: 'no_launch_json' };
  }

  if (!operator?.name || !operator?.path) {
    return { status: 'noop', reason: 'no_operator' };
  }

  const newTarget = resolveMsdebugTargetForOperator(workspaceRoot, operator, targetFile);

  if (!newTarget) {
    return { status: 'noop', reason: 'no_binary' };
  }

  let parsed: { configurations?: Array<Record<string, unknown>> };

  try {
    parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));
  }
  catch {
    return { status: 'noop', reason: 'unparseable' };
  }

  if (!Array.isArray(parsed.configurations)) {
    return { status: 'noop', reason: 'unparseable' };
  }

  let changed = false;
  let blockedByUserTarget = false;

  for (const cfg of parsed.configurations) {
    if (cfg.name !== 'msdebug' && cfg.name !== 'msdebug-cpu') {
      continue;
    }

    const current = typeof cfg.target === 'string' ? cfg.target : undefined;
    const exists = !!current && fs.existsSync(resolveTargetPath(current, workspaceRoot));

    if (shouldReplaceDebugTarget(current, exists, newTarget)) {
      cfg.target = newTarget;
      changed = true;
    }
    else if (current && current !== newTarget) {
      blockedByUserTarget = true;
    }
  }

  if (changed) {
    await fs.writeFile(launchJsonPath, JSON.stringify(parsed, null, 2), 'utf-8');

    return { status: 'patched', target: newTarget };
  }

  if (blockedByUserTarget) {
    return { status: 'noop', reason: 'user_target' };
  }

  return { status: 'unchanged' };
}

/** Patch an in-memory launch config (Run panel / F5) without writing launch.json. */
export function patchMsdebugLaunchConfigTarget(
  workspaceRoot: string,
  config: vscode.DebugConfiguration,
  operator: DebugOperatorRef,
  targetFile?: string | null,
): vscode.DebugConfiguration {
  if (config.name !== 'msdebug' && config.name !== 'msdebug-cpu') {
    return config;
  }

  const newTarget = resolveMsdebugTargetForOperator(workspaceRoot, operator, targetFile);

  if (!newTarget) {
    return config;
  }

  const current = typeof config.target === 'string' ? config.target : undefined;
  const exists = !!current && fs.existsSync(resolveTargetPath(current, workspaceRoot));

  if (!shouldReplaceDebugTarget(current, exists, newTarget)) {
    return config;
  }

  return {
    ...config,
    target: newTarget,
  };
}

const MSDEBUG_BINARY_CONFIG_NAMES = new Set([
  'msdebug',
  'msdebug-cpu',
]);

/**
 * Resolve msdebug targets when the user starts debug from the VS Code Run panel
 * (issue #17 — sidebar-only patching was insufficient).
 */
export function registerMsdebugTargetAutoAdapt(
  context: vscode.ExtensionContext,
  resolveOperator: (workspaceRoot: string)=> Promise<DebugOperatorRef | undefined>,
  resolveTargetFile?: (workspaceRoot: string, operator: DebugOperatorRef)=> Promise<string | null | undefined>,
): void {
  const provider: vscode.DebugConfigurationProvider = {
    async resolveDebugConfigurationWithSubstitutedVariables(folder, config) {
      if (!folder || !config?.name || !MSDEBUG_BINARY_CONFIG_NAMES.has(String(config.name))) {
        return config;
      }

      const operator = await resolveOperator(folder.uri.fsPath);

      if (!operator) {
        return config;
      }

      const targetFile = resolveTargetFile
        ? await resolveTargetFile(folder.uri.fsPath, operator)
        : undefined;

      return patchMsdebugLaunchConfigTarget(folder.uri.fsPath, config, operator, targetFile);
    },
  };

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      'msdebug-mi',
      provider,
      vscode.DebugConfigurationProviderTriggerKind.Initial
        | vscode.DebugConfigurationProviderTriggerKind.BeforeLaunch,
    ),
  );
}
