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
  normalizeProjectPath,
  projectPathsEqual,
} from '@plugin/domain/models/project-model';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

/**
 * Workspace-local state cache (`<workspace>/.vscode/cache.json`).
 *
 * The cache mirrors the host-global stores (projects/configs/ops.json) and
 * the remote config (`~/.vscode-server/data/ms-op-suite/config.json`) into the
 * workspace, so per-project state travels with the folder. The one-time
 * importer (legacy-state-importer.ts) seeds it on activation; runtime state
 * (scan results, file map lists) is written through
 * {@link updateWorkspaceCache}.
 *
 * Concurrency model:
 *  - reads never create the file (missing → fresh in-memory object),
 *  - writers (updateWorkspaceCache) CREATE the file when absent — a writer is
 *    never a no-op on a missing cache,
 *  - writes are atomic: serialize to `cache.json.tmp`, then rename.
 */

export const CACHE_SCHEMA_VERSION = 1;

/** One file-map entry (e.g. a mapping report file the sanitizer/simulate flow produced). */
export type FileMapEntry = {
  filePath: string;
  reportTime: number;
};

/** Per-folder scan state of a standard-custom collection (mirrors the project row). */
export type FolderScanState = {
  opsMeet: Array<{ name: string;
    path: string }>;
  opsList: Array<{ name: string;
    path: string;
    isCompiled?: boolean;
    /** op_type from the persisted ops.json row ('cann' for imported rows, 'ascend' for plugin-created ones). */
    opType?: string }>;
  experimentalOpsList: Array<{ name: string;
    path: string;
    isCompiled?: boolean;
    /** op_type from the persisted ops.json row ('cann' for imported rows, 'ascend' for plugin-created ones). */
    opType?: string }>;
};

export type WorkspaceCache = {
  schemaVersion: number;
  /** Selected/complied operator state of the workspace root project (standard-custom). */
  project?: {
    selectedOperatorPaths: string[];
    /** Optional: writers may persist only the selection — readers already use `?.`. */
    compiledOpPaths?: Record<string, boolean>;
  };
  /** Scan state keyed by normalized project path (only subfolder projects get their own key). */
  folders?: Record<string, FolderScanState>;
  /** File-map lists per config type (sanitizer / simulate / on_board). */
  fileMapLists?: {
    sanitizer: FileMapEntry[];
    simulate: FileMapEntry[];
    on_board: FileMapEntry[];
  };
  /** Per-operator sanitizer Python target (e.g. Triton `python3 <file>`). */
  sanitizerPythonTarget?: Record<string, string>;
};

export function getCacheFilePath(root: string): string {
  return joinIdeConfigPath(root, 'cache.json');
}

/**
 * Tolerant read: missing/empty/corrupt → `{ schemaVersion: CACHE_SCHEMA_VERSION }`.
 * Never writes the file (readers are side-effect free). A corrupt file is
 * renamed to `cache.json.bak` so the next writer starts from a fresh object.
 */
export function readWorkspaceCache(root: string): WorkspaceCache {
  const filePath = getCacheFilePath(root);

  try {
    if (!fs.existsSync(filePath)) {
      return { schemaVersion: CACHE_SCHEMA_VERSION };
    }

    const raw = fs.readFileSync(filePath, 'utf8')
      .trim();

    if (!raw) {
      return { schemaVersion: CACHE_SCHEMA_VERSION };
    }

    const parsed = JSON.parse(raw) as unknown;

    if (
      parsed !== null
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && typeof (parsed as WorkspaceCache).schemaVersion === 'number'
    ) {
      return parsed as WorkspaceCache;
    }

    fs.renameSync(filePath, `${filePath}.bak`);

    return { schemaVersion: CACHE_SCHEMA_VERSION };
  }
  catch (error) {
    try {
      if (fs.existsSync(filePath)) {
        fs.renameSync(filePath, `${filePath}.bak`);
      }
    }
    catch {
      // best effort — the next writer recovers anyway
    }

    console.warn('[readWorkspaceCache] failed:', root, error);

    return { schemaVersion: CACHE_SCHEMA_VERSION };
  }
}

/**
 * Atomic read-modify-write of the cache. The writer MUTATES the existing cache
 * via `mutate` (or returns a replacement object) and persists it.
 *
 * A writer always writes — a missing cache.json is created (never skipped),
 * so a runtime writer cannot silently lose state on a fresh workspace.
 *
 * @returns true when the file was written.
 */
const updateChains = new Map<string, Promise<boolean>>();

/** @internal — reset the per-path write chains between tests. */
export function resetWorkspaceCacheChainsForTest(): void {
  updateChains.clear();
}

/**
 * Atomic read-modify-write of the cache, serialized per cache file (the same
 * pattern the settings.json writer uses): two overlapping writers would
 * otherwise read the same "before" snapshot and the later rename would drop
 * the earlier mutation.
 */
export async function updateWorkspaceCache(
  root: string,
  mutate: (cache: WorkspaceCache)=> WorkspaceCache | void,
): Promise<boolean> {
  const filePath = getCacheFilePath(root);
  const previous = updateChains.get(filePath) ?? Promise.resolve(false);
  const run = previous.then(() => updateWorkspaceCacheOnce(root, filePath, mutate));

  updateChains.set(filePath, run);

  void run.finally(() => {
    if (updateChains.get(filePath) === run) {
      updateChains.delete(filePath);
    }
  });

  return run;
}

async function updateWorkspaceCacheOnce(
  root: string,
  filePath: string,
  mutate: (cache: WorkspaceCache)=> WorkspaceCache | void,
): Promise<boolean> {
  try {
    const current = readWorkspaceCache(root);
    const next = mutate(current) ?? current;

    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      return false;
    }

    next.schemaVersion = CACHE_SCHEMA_VERSION;

    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    const tmpPath = `${filePath}.tmp`;

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(tmpPath, serialized, 'utf8');
    await fs.promises.rename(tmpPath, filePath);

    return true;
  }
  catch (error) {
    console.warn('[updateWorkspaceCache] failed:', root, error);

    return false;
  }
}

/**
 * Persist the scan state of a standard-custom folder. The key is the canonical
 * normalized root path — the same key the import seeds, so runtime scan results
 * overlay the imported state without duplicating entries.
 */
export async function updateFolderScanState(root: string, next: FolderScanState): Promise<boolean> {
  return updateWorkspaceCache(root, (cache) => {
    const rootKey = normalizeProjectPath(root);

    cache.folders = {
      ...(cache.folders ?? {}),
      [rootKey]: next,
    };
  });
}

/**
 * Per-field merge primitive for the import: a field that is already present
 * (runtime state written after the initial import, or a prior partial import)
 * is NEVER clobbered by the seed.
 */
export function seedIfMissing<T>(current: T | undefined, seed: T): T {
  return current !== undefined ? current : seed;
}

/**
 * Append one sub-operator to a collection scan state: merges by path
 * equality, preserves `isCompiled` when the operator already exists in either
 * list, and moves the operator between the regular/experimental lists when its
 * experimental flag changed. Pure function over {@link FolderScanState} —
 * mirrors the `appendStandardCustomOperator` merge (projects.json).
 */
export function appendOperatorToFolderScanState(
  state: FolderScanState,
  operator: { name: string;
    path: string;
    isCompiled?: boolean },
  isExperimental: boolean,
): FolderScanState {
  const targetList = isExperimental ? state.experimentalOpsList : state.opsList;
  const oppositeList = isExperimental ? state.opsList : state.experimentalOpsList;
  const existingOperator = [
    ...targetList,
    ...oppositeList,
  ].find((item) => projectPathsEqual(item.path, operator.path));
  const nextOperator = existingOperator
    ? {
      ...existingOperator,
      name: operator.name,
      path: operator.path,
      isCompiled: existingOperator.isCompiled === true || operator.isCompiled === true,
    }
    : operator;
  const nextTargetList = [
    ...targetList.filter((item) => !projectPathsEqual(item.path, operator.path)),
    nextOperator,
  ];
  const nextOppositeList = oppositeList.filter((item) =>
    !projectPathsEqual(item.path, operator.path));

  return {
    opsMeet: state.opsMeet,
    opsList: isExperimental ? nextOppositeList : nextTargetList,
    experimentalOpsList: isExperimental ? nextTargetList : nextOppositeList,
  };
}
