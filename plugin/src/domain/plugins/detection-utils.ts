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
import * as path from 'path';
import {
  spawn, spawnSync,
} from 'child_process';

/**
 * Shared filesystem detection helpers for operator project type detection.
 * Extracted from OperatorProjectDetector's private static methods.
 */

const ROOT_PYTHON_ENTRY_EXCLUDE = new Set([
  '__init__.py',
  'setup.py',
  'conftest.py',
]);
const BUILD_SH_HELP_TIMEOUT_MS = 5_000;
const BUILD_SH_HELP_MAX_OUTPUT_LENGTH = 64 * 1024;

export type BuildShGenopSupportChecker = (dirPath: string)=> Promise<boolean>;

export function helpOutputSupportsOption(output: string, option: string): boolean {
  const escapedOption = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(^|[^A-Za-z0-9_-])${escapedOption}(?:=|[^A-Za-z0-9_-]|$)`, 'm')
    .test(output);
}

export function helpOutputSupportsGenop(output: string): boolean {
  return helpOutputSupportsOption(output, '--genop');
}

/**
 * Check the project's public build interface rather than its implementation.
 * `build.sh --help` is deliberately run without a shell so the workspace path
 * cannot be interpreted as command text.
 */
export async function buildShHelpSupportsGenop(dirPath: string): Promise<boolean> {
  return buildShHelpSupportsOption(dirPath, '--genop');
}

/** Check whether the public build interface advertises an option. */
export async function buildShHelpSupportsOption(dirPath: string, option: string): Promise<boolean> {
  if (!fs.existsSync(path.join(dirPath, 'build.sh'))) {
    return false;
  }

  return new Promise((resolve) => {
    let output = '';
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeout) {
        clearTimeout(timeout);
      }

      resolve(helpOutputSupportsOption(output, option));
    };
    const appendOutput = (data: Buffer | string) => {
      const remaining = BUILD_SH_HELP_MAX_OUTPUT_LENGTH - output.length;

      if (remaining > 0) {
        output += data.toString()
          .slice(0, remaining);
      }
    };
    const child = spawn('bash', [
      'build.sh',
      '--help',
    ], {
      cwd: dirPath,
      shell: false,
      windowsHide: true,
    });
    const timeout = setTimeout(() => {
      child.kill();
      finish();
    }, BUILD_SH_HELP_TIMEOUT_MS);

    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);
    child.once('error', finish);
    child.once('close', finish);
  });
}

/**
 * Synchronous variant for configuration creation, whose plugin contract is synchronous.
 * The command still checks the public `build.sh --help` interface rather than script text.
 */
export function buildShHelpSupportsOptionSync(dirPath: string, option: string): boolean {
  if (!fs.existsSync(path.join(dirPath, 'build.sh'))) {
    return false;
  }

  try {
    const result = spawnSync('bash', [
      'build.sh',
      '--help',
    ], {
      cwd: dirPath,
      shell: false,
      windowsHide: true,
      timeout: BUILD_SH_HELP_TIMEOUT_MS,
      maxBuffer: BUILD_SH_HELP_MAX_OUTPUT_LENGTH,
      encoding: 'utf8',
    });

    return helpOutputSupportsOption(`${result.stdout ?? ''}${result.stderr ?? ''}`, option);
  }
  catch {
    return false;
  }
}

export function hasPyFilesInRoot(dirPath: string): boolean {
  return listRootPythonEntryFiles(dirPath).length > 0;
}

/** Non-recursive `.py` files at `dirPath`, excluding common non-entry helpers. */
export function listRootPythonEntryFiles(dirPath: string): string[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    return entries
      .filter((e) => e.isFile()
        && e.name.endsWith('.py')
        && !ROOT_PYTHON_ENTRY_EXCLUDE.has(e.name))
      .map((e) => path.join(dirPath, e.name));
  }
  catch {
    return [];
  }
}

export function hasPyFilesRecursive(dirPath: string, maxDepth: number): boolean {
  if (maxDepth < 0) {
    return false;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.py')) {
        return true;
      }

      if (entry.isDirectory() && maxDepth > 0) {
        if (hasPyFilesRecursive(fullPath, maxDepth - 1)) {
          return true;
        }
      }
    }
  }
  catch {
    // ignore
  }

  return false;
}

/**
 * Detect whether Python files contain Triton-specific imports/usages.
 * Keeps scanning shallow and lightweight: recursive `.py` scan up to depth 2.
 */
export function hasTritonPythonIndicatorsInRoot(dirPath: string): boolean {
  function hasTritonMarkersRecursive(scanPath: string, depth: number): boolean {
    if (depth < 0) {
      return false;
    }

    let entries: fs.Dirent[] = [];

    try {
      entries = fs.readdirSync(scanPath, { withFileTypes: true });
    }
    catch {
      return false;
    }

    for (const entry of entries) {
      const fullPath = path.join(scanPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.py')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const hasIndicator =
            /\bimport\s+triton\b/.test(content)
            || /\bfrom\s+triton\b/.test(content)
            || /\btriton\.jit\b/.test(content)
            || /\btriton\.language\b/.test(content)
            || /\btriton\.cdiv\b/.test(content);

          if (hasIndicator) {
            return true;
          }
        }
        catch {
          // ignore single-file read errors
        }
      }

      if (entry.isDirectory() && depth > 0) {
        if (hasTritonMarkersRecursive(fullPath, depth - 1)) {
          return true;
        }
      }
    }

    return false;
  }

  try {
    return hasTritonMarkersRecursive(dirPath, 2);
  }
  catch {
    // ignore
  }

  return false;
}

export function hasAscFiles(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.asc')) {
        return true;
      }

      if (entry.isDirectory() && hasAscFilesRecursive(path.join(dirPath, entry.name), 2)) {
        return true;
      }
    }
  }
  catch {
    // ignore
  }

  return false;
}

export function hasAscFilesRecursive(dirPath: string, maxDepth: number): boolean {
  if (maxDepth <= 0) {
    return false;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.asc')) {
        return true;
      }

      if (entry.isDirectory() && maxDepth > 1) {
        if (hasAscFilesRecursive(path.join(dirPath, entry.name), maxDepth - 1)) {
          return true;
        }
      }
    }
  }
  catch {
    // ignore
  }

  return false;
}

/** Walk up at most 3 ancestors to find a collection whose help exposes --genop. */
export async function findAncestorGenopCollectionRoot(
  dirPath: string,
  supportsGenop: BuildShGenopSupportChecker = buildShHelpSupportsGenop,
): Promise<string | undefined> {
  try {
    let current = path.dirname(dirPath);

    for (let i = 0; i < 3; i++) {
      const buildSh = path.join(current, 'build.sh');

      if (fs.existsSync(buildSh) && await supportsGenop(current)) {
        return current;
      }

      const parent = path.dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }
  }
  catch {
    // ignore
  }

  return undefined;
}

/**
 * Walk up at most 3 ancestor directories looking for help output that exposes --genop.
 */
export async function hasAncestorBuildShWithGenop(
  dirPath: string,
  supportsGenop: BuildShGenopSupportChecker = buildShHelpSupportsGenop,
): Promise<boolean> {
  return (await findAncestorGenopCollectionRoot(dirPath, supportsGenop)) !== undefined;
}
