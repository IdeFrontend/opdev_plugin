/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import fs from 'fs-extra';
import path from 'path';
import * as vscode from 'vscode';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { backfillMsdebugLibInEnvFile } from '@plugin/domain/utils/msdebug-env';

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
 * `target_file` basename when supplied (GC-17 next steps).
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

/** The untouched template target for remote-debug — uses remote workspace variable. */
export const DEFAULT_REMOTE_MSDEBUG_TARGET = '${remoteWorkspaceFolder}/build/${workspaceFolderBasename}';

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
  configName?: string,
): boolean {
  const DEFAULT_TARGET = configName === 'remote-debug'
    ? DEFAULT_REMOTE_MSDEBUG_TARGET
    : DEFAULT_MSDEBUG_TARGET;

  if (!currentTarget || currentTarget === DEFAULT_TARGET) {
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

/**
 * Names of the executables directly under `buildDir` — empty when it is absent, not yet built
 * or unreadable, so every caller can treat "no build dir" as "nothing built".
 *
 * `withFileTypes` reports on the entry itself (lstat), so a symlinked binary is a symlink and
 * not a file; CMake and the ops-math build scripts do emit those, and callers want anything
 * that can be executed. A link is kept only when it resolves to a regular file: a stale link
 * left by an earlier build is not a target, and neither is a link to a directory.
 */
export function listBuildFiles(buildDir: string): string[] {
  try {
    return fs.readdirSync(buildDir, { withFileTypes: true })
      .filter((entry) => entry.isFile()
        || (entry.isSymbolicLink() && linkResolvesToFile(path.join(buildDir, entry.name))))
      .map((entry) => entry.name);
  }
  catch {
    return [];
  }
}

/**
 * Whether `linkPath` resolves to a regular file. Kept behind its own try/catch because a
 * self-referencing link makes statSync throw ELOOP even with `throwIfNoEntry: false`, and
 * one such entry must not blank out the whole listing.
 */
function linkResolvesToFile(linkPath: string): boolean {
  try {
    return fs.statSync(linkPath)
      .isFile();
  }
  catch {
    return false;
  }
}

function toRelativeLaunchTarget(
  workspaceRoot: string,
  absTargetPath: string,
  placeholder: string,
): string {
  const rel = path.relative(workspaceRoot, absTargetPath);

  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return absTargetPath.split(path.sep)
      .join('/');
  }

  return `${placeholder}/${rel.split(path.sep)
    .join('/')}`;
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
  return toRelativeLaunchTarget(workspaceRoot, absTargetPath, '${workspaceFolder}');
}

/**
 * Express an absolute binary path as a `${remoteWorkspaceFolder}`-relative
 * launch.json target for remote-debug configs.
 */
export function toRemoteWorkspaceRelativeTarget(
  workspaceRoot: string,
  absTargetPath: string,
): string {
  return toRelativeLaunchTarget(workspaceRoot, absTargetPath, '${remoteWorkspaceFolder}');
}

export function resolveTargetPath(target: string, workspaceRoot: string): string {
  return target
    .replace('${workspaceFolder}', workspaceRoot)
    .replace('${remoteWorkspaceFolder}', workspaceRoot)
    .replace('${workspaceFolderBasename}', path.basename(workspaceRoot));
}

/**
 * Whether the `msdebug` / `msdebug-cpu` launch config `configName` resolves to a target
 * binary that exists on disk. Returns:
 *   - `true`      the configured target exists (safe to attach);
 *   - `false`     the config declares a concrete target that is NOT on disk;
 *   - `undefined` indeterminate — no launch.json, no such config, or no `target` field —
 *                 so the caller must not block the launch on this signal alone.
 *
 * Used to refuse a debug launch that would otherwise attach msdebug to a phantom
 * executable when the debug build failed or was preempted. Checking the resolved
 * target on disk (rather than the auto-adapt `no_binary` result) avoids false positives
 * for a valid user-set target whose name is not among the auto-adapt candidates.
 */
export function msdebugConfiguredTargetExists(
  workspaceRoot: string,
  configName: string,
): boolean | undefined {
  const launchJsonPath = joinIdeConfigPath(workspaceRoot, 'launch.json');

  if (!fs.existsSync(launchJsonPath)) {
    return undefined;
  }

  let parsed: { configurations?: Array<Record<string, unknown>> };

  try {
    parsed = JSON.parse(fs.readFileSync(launchJsonPath, 'utf-8'));
  }
  catch {
    return undefined;
  }

  if (!Array.isArray(parsed.configurations)) {
    return undefined;
  }

  const config = parsed.configurations.find((cfg) => cfg.name === configName);

  if (!config) {
    return undefined;
  }

  if (configName === 'remote-debug') {
    const remoteConfig = config.remoteConfig as Record<string, unknown> | undefined;
    const remoteWorkspaceFolder = remoteConfig && typeof remoteConfig.remoteWorkspaceFolder === 'string'
      ? remoteConfig.remoteWorkspaceFolder
      : undefined;

    if (remoteWorkspaceFolder === undefined) {
      return false;
    }

    const target = typeof config.target === 'string' ? config.target : undefined;

    if (!target) {
      return undefined;
    }

    return fs.existsSync(resolveTargetPath(target, workspaceRoot));
  }

  const target = typeof config.target === 'string' ? config.target : undefined;

  if (!target) {
    return undefined;
  }

  return fs.existsSync(resolveTargetPath(target, workspaceRoot));
}

/**
 * Build directories that can hold an operator's debug target, in priority order.
 *
 * Two layouts are in the field and only the operator's own `build/` was searched:
 *   - one operator per project (`<op>/build.sh`)  → `<op_path>/build/`
 *   - one standard-custom repo opened at its root → `<repo>/build/`
 * ops-nn and ops-math are the latter: `build.sh` builds into `${BASE_PATH}/build`
 * where `BASE_PATH` is the repo root, so an operator selected in the sidebar has no
 * `build/` of its own and the target stayed on the template placeholder (#17).
 */
function debugBuildDirs(workspaceRoot: string, operator: DebugOperatorRef): string[] {
  const opBuildDir = path.join(operator.path, 'build');
  const rootBuildDir = path.join(workspaceRoot, 'build');

  return opBuildDir === rootBuildDir
    ? [opBuildDir]
    : [
      opBuildDir,
      rootBuildDir,
    ];
}

/**
 * Absolute path of the built debug target for an operator, or `undefined` when no
 * candidate binary exists in any of its build directories.
 */
function resolveMsdebugTargetPath(
  workspaceRoot: string,
  operator: DebugOperatorRef,
  targetFile?: string | null,
): string | undefined {
  const candidates = collectDebugTargetCandidates(operator.name, targetFile);

  for (const buildDir of debugBuildDirs(workspaceRoot, operator)) {
    const binary = resolveDebugTargetBinary(listBuildFiles(buildDir), candidates);

    if (binary) {
      return path.join(buildDir, binary);
    }
  }

  return undefined;
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
  const absTarget = resolveMsdebugTargetPath(workspaceRoot, operator, targetFile);

  if (!absTarget) {
    return undefined;
  }

  return toWorkspaceRelativeTarget(workspaceRoot, absTarget);
}

/**
 * Resolve the remote-debug attach path for an operator, or `undefined` when the
 * binary was not built. Uses `${remoteWorkspaceFolder}` as the path prefix.
 */
export function resolveRemoteMsdebugTargetForOperator(
  workspaceRoot: string,
  operator: DebugOperatorRef,
  targetFile?: string | null,
): string | undefined {
  const absTarget = resolveMsdebugTargetPath(workspaceRoot, operator, targetFile);

  if (!absTarget) {
    return undefined;
  }

  return toRemoteWorkspaceRelativeTarget(workspaceRoot, absTarget);
}

/**
 * Auto-adapt the `msdebug` / `msdebug-cpu` / `remote-debug` target in
 * `<ide>/launch.json` to the actual built binary, unless the user already set
 * a valid target.
 */
export async function updateMsdebugTarget(
  workspaceRoot: string,
  operator?: DebugOperatorRef,
  targetFile?: string | null,
): Promise<MsdebugTargetPatchResult> {
  const launchJsonPath = joinIdeConfigPath(workspaceRoot, 'launch.json');

  if (!fs.existsSync(launchJsonPath)) {
    return {
      status: 'noop',
      reason: 'no_launch_json',
    };
  }

  if (!operator?.name || !operator?.path) {
    return {
      status: 'noop',
      reason: 'no_operator',
    };
  }

  const newTarget = resolveMsdebugTargetForOperator(workspaceRoot, operator, targetFile);
  const newRemoteTarget = resolveRemoteMsdebugTargetForOperator(workspaceRoot, operator, targetFile);

  if (!newTarget && !newRemoteTarget) {
    return {
      status: 'noop',
      reason: 'no_binary',
    };
  }

  let parsed: { configurations?: Array<Record<string, unknown>> };

  try {
    parsed = JSON.parse(await fs.readFile(launchJsonPath, 'utf-8'));
  }
  catch {
    return {
      status: 'noop',
      reason: 'unparseable',
    };
  }

  if (!Array.isArray(parsed.configurations)) {
    return {
      status: 'noop',
      reason: 'unparseable',
    };
  }

  let changed = false;
  let blockedByUserTarget = false;

  for (const cfg of parsed.configurations) {
    if (cfg.name === 'remote-debug') {
      const current = typeof cfg.target === 'string' ? cfg.target : undefined;
      const exists = !!current && fs.existsSync(resolveTargetPath(current, workspaceRoot));

      if (newRemoteTarget && shouldReplaceDebugTarget(current, exists, newRemoteTarget, 'remote-debug')) {
        cfg.target = newRemoteTarget;
        changed = true;
      }
      else if (current && current !== newRemoteTarget) {
        blockedByUserTarget = true;
      }

      continue;
    }

    if (cfg.name !== 'msdebug' && cfg.name !== 'msdebug-cpu') {
      continue;
    }

    const current = typeof cfg.target === 'string' ? cfg.target : undefined;
    const exists = !!current && fs.existsSync(resolveTargetPath(current, workspaceRoot));

    if (newTarget && shouldReplaceDebugTarget(current, exists, newTarget, cfg.name)) {
      cfg.target = newTarget;
      changed = true;
    }
    else if (current && current !== newTarget) {
      blockedByUserTarget = true;
    }
  }

  if (changed) {
    await fs.writeFile(launchJsonPath, JSON.stringify(parsed, null, 2), 'utf-8');

    return {
      status: 'patched',
      target: newTarget ?? newRemoteTarget ?? '',
    };
  }

  if (blockedByUserTarget) {
    return {
      status: 'noop',
      reason: 'user_target',
    };
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
  const isRemote = config.name === 'remote-debug';

  if (!isRemote && config.name !== 'msdebug' && config.name !== 'msdebug-cpu') {
    return config;
  }

  const newTarget = isRemote
    ? resolveRemoteMsdebugTargetForOperator(workspaceRoot, operator, targetFile)
    : resolveMsdebugTargetForOperator(workspaceRoot, operator, targetFile);

  if (!newTarget) {
    return config;
  }

  const current = typeof config.target === 'string' ? config.target : undefined;
  const exists = !!current && fs.existsSync(resolveTargetPath(current, workspaceRoot));

  if (!shouldReplaceDebugTarget(current, exists, newTarget, config.name)) {
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
  'remote-debug',
]);

/**
 * Resolve msdebug targets when the user starts debug from the VS Code Run panel
 * (sidebar-only patching is insufficient: the Run panel supplies its own config).
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

      await backfillMsdebugLibInEnvFile(folder.uri.fsPath);

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

  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('msdebug-mi', provider));
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('msdebug-mi-remote', provider));
}
