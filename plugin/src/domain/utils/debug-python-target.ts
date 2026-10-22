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

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

const DEFAULT_PYTHON_INTERPRETER = '/usr/local/bin/python';
const PLACEHOLDER_PYTHON_INTERPRETERS = new Set([
  DEFAULT_PYTHON_INTERPRETER,
  '/usr/bin/python3',
  '/usr/bin/python',
]);

const PLACEHOLDER_SCRIPT_ARGS = new Set([
  '${workspaceFolder}/run.py',
  '${workspaceFolder}/op.py',
]);

export type MsdebugPythonTargetPatch = {
  interpreter: string;
  /** First element of targetArgs, e.g. `./op.py` relative to cwd. */
  scriptArg: string;
  cwd?: string;
  /** NPU kernel .o path for msdebug LAUNCH_KERNEL_PATH (Triton). */
  launchKernelPath?: string;
};

function resolvePlaceholderPath(value: string, workspaceRoot: string): string {
  return value
    .replace(/\$\{workspaceFolder\}/g, workspaceRoot)
    .replace(/\$\{workspaceFolderBasename\}/g, path.basename(workspaceRoot))
    .replace(/\$\{workspaceRoot\}/g, workspaceRoot);
}

function shouldReplacePythonInterpreter(current: string | undefined, workspaceRoot: string): boolean {
  if (!current || PLACEHOLDER_PYTHON_INTERPRETERS.has(current)) {
    return true;
  }

  return !fs.existsSync(resolvePlaceholderPath(current, workspaceRoot));
}

function shouldReplaceScriptArg(current: string | undefined, workspaceRoot: string): boolean {
  if (!current || PLACEHOLDER_SCRIPT_ARGS.has(current)) {
    return true;
  }

  const resolved = resolvePlaceholderPath(current, workspaceRoot);

  return !fs.existsSync(resolved);
}

type LaunchEnvironmentEntry = { name: string;
  value: string };

function upsertLaunchKernelPath(
  environment: unknown,
  launchKernelPath: string,
): LaunchEnvironmentEntry[] {
  const list = Array.isArray(environment)
    ? environment.filter((entry): entry is LaunchEnvironmentEntry =>
      !!entry
      && typeof entry === 'object'
      && typeof (entry as LaunchEnvironmentEntry).name === 'string')
    : [];

  const without = list.filter((entry) => entry.name !== 'LAUNCH_KERNEL_PATH');

  return [
    ...without,
    {
      name: 'LAUNCH_KERNEL_PATH',
      value: launchKernelPath,
    },
  ];
}

/**
 * Patch Python-based msdebug launch configs (`msdebug-python`, `msdebug-triton-*`).
 */
export async function updateMsdebugPythonTarget(
  workspaceRoot: string,
  configNames: readonly string[],
  patch: MsdebugPythonTargetPatch,
): Promise<void> {
  const launchJsonPath = joinIdeConfigPath(workspaceRoot, 'launch.json');

  if (!fs.existsSync(launchJsonPath) || configNames.length === 0) {
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

  const nameSet = new Set(configNames);
  let changed = false;

  for (const cfg of parsed.configurations) {
    const name = typeof cfg.name === 'string' ? cfg.name : '';

    if (!nameSet.has(name)) {
      continue;
    }

    const currentTarget = typeof cfg.target === 'string' ? cfg.target : undefined;

    if (shouldReplacePythonInterpreter(currentTarget, workspaceRoot)) {
      cfg.target = patch.interpreter;
      changed = true;
    }

    const currentArgs = Array.isArray(cfg.targetArgs)
      ? cfg.targetArgs.filter((arg): arg is string => typeof arg === 'string')
      : [];
    const currentScript = currentArgs[0];

    if (shouldReplaceScriptArg(currentScript, workspaceRoot)) {
      cfg.targetArgs = [
        patch.scriptArg,
        ...currentArgs.slice(1),
      ];
      changed = true;
    }

    if (patch.cwd) {
      cfg.cwd = patch.cwd;
      changed = true;
    }

    if (patch.launchKernelPath) {
      cfg.environment = upsertLaunchKernelPath(cfg.environment, patch.launchKernelPath);
      changed = true;
    }
  }

  if (changed) {
    await fs.writeFile(launchJsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
  }
}

/** Exported for unit tests — mirrors binary-target placeholder policy for scripts. */
export function shouldReplacePythonScriptArg(
  currentTarget: string | undefined,
  workspaceRoot: string,
): boolean {
  return shouldReplaceScriptArg(currentTarget, workspaceRoot);
}

export function shouldReplacePythonInterpreterTarget(
  currentTarget: string | undefined,
  workspaceRoot: string,
): boolean {
  return shouldReplacePythonInterpreter(currentTarget, workspaceRoot);
}
