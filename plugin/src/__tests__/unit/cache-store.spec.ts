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
import * as os from 'os';
import * as path from 'path';

import {
  CACHE_SCHEMA_VERSION,
  WorkspaceCache,
  appendOperatorToFolderScanState,
  getCacheFilePath,
  readWorkspaceCache,
  resetWorkspaceCacheChainsForTest,
  seedIfMissing,
  updateFolderScanState,
  updateWorkspaceCache,
  type FolderScanState,
} from '@plugin/helpers/workspace-cache';
import { getIdeConfigDir } from '@plugin/helpers/ide-config-dir';

describe('workspace cache store', () => {
  let tmpRoot: string;

  beforeEach(() => {
    resetWorkspaceCacheChainsForTest();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-cache-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function readRaw(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8')) as Record<string, unknown>;
  }

  it('read on a missing file returns a fresh object WITHOUT writing the file', () => {
    const cache = readWorkspaceCache(tmpRoot);

    expect(cache)
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });
    expect(fs.existsSync(getCacheFilePath(tmpRoot)))
      .toBe(false);
  });

  it('update creates cache.json from scratch with schemaVersion 1 (writer never skips a missing cache)', async () => {
    const wrote = await updateWorkspaceCache(tmpRoot, (cache) => {
      cache.sanitizerPythonTarget = { myop: 'python3 run.py' };
    });

    expect(wrote)
      .toBe(true);
    expect(fs.existsSync(getCacheFilePath(tmpRoot)))
      .toBe(true);
    const raw = readRaw();

    expect(raw.schemaVersion)
      .toBe(CACHE_SCHEMA_VERSION);
    expect(raw.sanitizerPythonTarget)
      .toEqual({ myop: 'python3 run.py' });
  });

  it('serializes concurrent writers — no lost update', async () => {
    const results = await Promise.all([
      updateWorkspaceCache(tmpRoot, (cache) => {
        cache.project = { selectedOperatorPaths: ['/a'] };
      }),
      updateWorkspaceCache(tmpRoot, (cache) => {
        cache.sanitizerPythonTarget = { myop: 'python3 run.py' };
      }),
      updateWorkspaceCache(tmpRoot, (cache) => {
        cache.fileMapLists = {
          sanitizer: [],
          simulate: [],
          on_board: [],
        };
      }),
    ]);

    expect(results)
      .toEqual([
        true,
        true,
        true,
      ]);

    const raw = readRaw();

    expect(raw.project)
      .toEqual({ selectedOperatorPaths: ['/a'] });
    expect(raw.sanitizerPythonTarget)
      .toEqual({ myop: 'python3 run.py' });
    expect(raw.fileMapLists)
      .toEqual({
        sanitizer: [],
        simulate: [],
        on_board: [],
      });
  });

  it('update is atomic: no .tmp file remains after a successful write', async () => {
    await updateWorkspaceCache(tmpRoot, (cache) => {
      cache.sanitizerPythonTarget = { myop: 'python3 run.py' };
    });

    expect(fs.existsSync(`${getCacheFilePath(tmpRoot)}.tmp`))
      .toBe(false);
  });

  it('update mutates the existing cache in place (read-modify-write)', async () => {
    await updateWorkspaceCache(tmpRoot, (cache) => {
      cache.sanitizerPythonTarget = { myop: 'python3 run.py' };
    });
    await updateWorkspaceCache(tmpRoot, (cache) => {
      cache.sanitizerPythonTarget = { myop: 'python3 run.py' };
    });

    const raw = readRaw();

    expect(raw.schemaVersion)
      .toBe(CACHE_SCHEMA_VERSION);
    expect(raw.sanitizerPythonTarget)
      .toEqual({ myop: 'python3 run.py' });
    expect(raw.sanitizerPythonTarget)
      .toEqual({ myop: 'python3 run.py' });
  });

  it('a mutate callback may return a replacement object instead of mutating in place', async () => {
    await updateWorkspaceCache(tmpRoot, () => ({
      schemaVersion: CACHE_SCHEMA_VERSION,
      sanitizerPythonTarget: { myop: 'python3 run.py' },
    }));

    expect(readRaw().sanitizerPythonTarget)
      .toEqual({ myop: 'python3 run.py' });
  });

  it('corrupt cache.json is renamed to cache.json.bak and the next writer starts fresh', async () => {
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    fs.writeFileSync(getCacheFilePath(tmpRoot), '{ not json', 'utf8');

    const cache = readWorkspaceCache(tmpRoot);

    expect(cache)
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });
    expect(fs.existsSync(`${getCacheFilePath(tmpRoot)}.bak`))
      .toBe(true);

    await updateWorkspaceCache(tmpRoot, (c) => {
      c.project = { selectedOperatorPaths: ['/workspace/ops/add'] };
    });

    expect(readRaw().project)
      .toEqual({ selectedOperatorPaths: ['/workspace/ops/add'] });
  });

  it('read treats an empty or whitespace-only cache.json as a fresh object without touching the file', () => {
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });

    fs.writeFileSync(getCacheFilePath(tmpRoot), '', 'utf8');
    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });

    fs.writeFileSync(getCacheFilePath(tmpRoot), '  \n\t ', 'utf8');
    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });

    expect(fs.existsSync(`${getCacheFilePath(tmpRoot)}.bak`))
      .toBe(false);
  });

  it('read renames a JSON payload that is not a schema object to .bak', () => {
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });

    fs.writeFileSync(getCacheFilePath(tmpRoot), '[1, 2]', 'utf8');
    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });

    fs.writeFileSync(getCacheFilePath(tmpRoot), '"a string"', 'utf8');
    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });

    fs.writeFileSync(getCacheFilePath(tmpRoot), 'null', 'utf8');
    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });

    fs.writeFileSync(getCacheFilePath(tmpRoot), '{}', 'utf8');
    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });

    expect(fs.existsSync(`${getCacheFilePath(tmpRoot)}.bak`))
      .toBe(true);
  });

  it('read recovers when the cache file cannot be read (catch path)', () => {
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    // A directory at the cache path makes readFileSync throw EISDIR.
    fs.mkdirSync(getCacheFilePath(tmpRoot), { recursive: true });

    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => {});

    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });
    expect(fs.existsSync(`${getCacheFilePath(tmpRoot)}.bak`))
      .toBe(true);

    warnSpy.mockRestore();
  });

  it('read still returns fresh when the recovery rename also fails', () => {
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    // A directory that cannot be read AND an existing .bak directory make the
    // recovery rename fail as well.
    fs.mkdirSync(getCacheFilePath(tmpRoot), { recursive: true });
    fs.mkdirSync(`${getCacheFilePath(tmpRoot)}.bak`, { recursive: true });

    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => {});

    expect(readWorkspaceCache(tmpRoot))
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });
    expect(warnSpy)
      .toHaveBeenCalledWith('[readWorkspaceCache] failed:', tmpRoot, expect.objectContaining({ message: expect.any(String) }));

    warnSpy.mockRestore();
  });

  it('update falls back to the current cache when mutate returns null', async () => {
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });

    const wrote = await updateWorkspaceCache(tmpRoot, () => null);

    expect(wrote)
      .toBe(true);
    expect(readRaw())
      .toEqual({ schemaVersion: CACHE_SCHEMA_VERSION });
  });

  it('update refuses to persist a replacement that is not a plain object', async () => {
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    fs.writeFileSync(getCacheFilePath(tmpRoot), '{ "schemaVersion": 1 }', 'utf8');

    await expect(updateWorkspaceCache(tmpRoot, () => 'string' as never))
      .resolves.toBe(false);
    await expect(updateWorkspaceCache(tmpRoot, () => [] as never))
      .resolves.toBe(false);

    expect(fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8'))
      .toBe('{ "schemaVersion": 1 }');
  });

  it('update reports false and keeps the old file when the write fails', async () => {
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    fs.writeFileSync(getCacheFilePath(tmpRoot), '{ "schemaVersion": 1 }', 'utf8');
    const before = fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8');

    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => {});
    const writeFileSpy = jest.spyOn(fs.promises, 'writeFile')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(updateWorkspaceCache(tmpRoot, (c) => {
      c.project = { selectedOperatorPaths: ['/x'] };
    }))
      .resolves.toBe(false);

    writeFileSpy.mockRestore();
    warnSpy.mockRestore();

    expect(fs.readFileSync(getCacheFilePath(tmpRoot), 'utf8'))
      .toBe(before);
    expect(fs.existsSync(`${getCacheFilePath(tmpRoot)}.tmp`))
      .toBe(false);
  });

  it('updateFolderScanState persists the scan state under the normalized root key', async () => {
    const next = {
      opsMeet: [
        {
          name: 'add',
          path: '/workspace/ops/add',
        },
      ],
      opsList: [
        {
          name: 'mul',
          path: '/workspace/ops/mul',
          isCompiled: true,
          opType: 'cann',
        },
      ],
      experimentalOpsList: [],
    };

    const wrote = await updateFolderScanState(tmpRoot, next);

    expect(wrote)
      .toBe(true);

    const raw = readRaw();

    expect(raw.folders)
      .toBeDefined();
    expect(Object.keys(raw.folders as Record<string, unknown>))
      .toHaveLength(1);
    expect((raw.folders as Record<string, unknown>)[Object.keys(raw.folders as Record<string, unknown>)[0]])
      .toEqual(next);
  });

  it('cache file lands in the workspace IDE config dir (.vscode by default)', () => {
    expect(getCacheFilePath(tmpRoot))
      .toBe(path.join(tmpRoot, '.vscode', 'cache.json'));
  });

  describe('appendOperatorToFolderScanState (pure merge)', () => {
    const emptyState = (): FolderScanState => ({
      opsMeet: [],
      opsList: [],
      experimentalOpsList: [],
    });

    it('adds a brand-new operator to the regular list when not experimental', () => {
      const next = appendOperatorToFolderScanState(
        emptyState(),
        {
          name: 'add',
          path: '/workspace/ops/add',
          isCompiled: true,
        },
        false,
      );

      expect(next.opsList)
        .toEqual([
          {
            name: 'add',
            path: '/workspace/ops/add',
            isCompiled: true,
          },
        ]);
      expect(next.experimentalOpsList)
        .toEqual([]);
    });

    it('adds a brand-new operator to the experimental list when experimental', () => {
      const next = appendOperatorToFolderScanState(
        emptyState(),
        {
          name: 'mul',
          path: '/workspace/ops/mul',
        },
        true,
      );

      expect(next.experimentalOpsList)
        .toEqual([
          {
            name: 'mul',
            path: '/workspace/ops/mul',
          },
        ]);
      expect(next.opsList)
        .toEqual([]);
    });

    it('moves an operator across lists when the experimental flag changes', () => {
      const state = emptyState();

      state.experimentalOpsList = [
        {
          name: 'add',
          path: '/workspace/ops/add',
        },
      ];

      const next = appendOperatorToFolderScanState(
        state,
        {
          name: 'add',
          path: '/workspace/ops/add',
          isCompiled: false,
        },
        false,
      );

      expect(next.opsList)
        .toEqual([
          {
            name: 'add',
            path: '/workspace/ops/add',
            isCompiled: false,
          },
        ]);
      expect(next.experimentalOpsList)
        .toEqual([]);
    });

    it('keeps isCompiled true when the existing entry already compiled the operator', () => {
      const state = emptyState();

      state.opsList = [
        {
          name: 'add',
          path: '/workspace/ops/add',
          isCompiled: true,
        },
      ];

      const next = appendOperatorToFolderScanState(
        state,
        {
          name: 'add',
          path: '/workspace/ops/add',
          isCompiled: false,
        },
        false,
      );

      expect(next.opsList)
        .toEqual([
          {
            name: 'add',
            path: '/workspace/ops/add',
            isCompiled: true,
          },
        ]);
    });

    it('keeps isCompiled true when only the incoming operator compiles it', () => {
      const state = emptyState();

      state.opsList = [
        {
          name: 'add',
          path: '/workspace/ops/add',
        },
      ];

      const next = appendOperatorToFolderScanState(
        state,
        {
          name: 'add',
          path: '/workspace/ops/add',
          isCompiled: true,
        },
        false,
      );

      expect(next.opsList)
        .toEqual([
          {
            name: 'add',
            path: '/workspace/ops/add',
            isCompiled: true,
          },
        ]);
    });
  });

  describe('seedIfMissing (merge primitive)', () => {
    it('keeps an existing value and seeds a missing one', () => {
      expect(seedIfMissing('runtime', 'legacy'))
        .toBe('runtime');
      expect(seedIfMissing(undefined, 'legacy'))
        .toBe('legacy');
      expect(seedIfMissing(null, 'legacy'))
        .toBe(null);
    });

    it('merges per-field without clobbering runtime state', () => {
      // Runtime state already in the file (first argument to seedIfMissing).
      const runtime: WorkspaceCache = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        project: {
          selectedOperatorPaths: ['runtime-kept'],
          compiledOpPaths: {},
        },
        fileMapLists: {
          sanitizer: [
            {
              filePath: 'runtime-report.json',
              reportTime: 42,
            },
          ],
          simulate: [],
          on_board: [],
        },
      };
      // Legacy seed the importer wants to apply (second argument).
      const legacy: WorkspaceCache = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        fileMapLists: {
          sanitizer: [
            {
              filePath: 'legacy-report.json',
              reportTime: 1,
            },
          ],
          simulate: [],
          on_board: [],
        },
        sanitizerPythonTarget: { myop: 'python3 run.py' },
      };

      const merged: WorkspaceCache = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        project: runtime.project,
        folders: undefined,
        fileMapLists: {
          sanitizer: seedIfMissing(runtime.fileMapLists?.sanitizer, legacy.fileMapLists.sanitizer),
          simulate: seedIfMissing(runtime.fileMapLists?.simulate, legacy.fileMapLists.simulate),
          on_board: seedIfMissing(runtime.fileMapLists?.on_board, legacy.fileMapLists.on_board),
        },
        // Not present in the runtime cache at all → the legacy seed wins.
        sanitizerPythonTarget: seedIfMissing(runtime.sanitizerPythonTarget, legacy.sanitizerPythonTarget ?? {}),
      };

      expect(merged.fileMapLists?.sanitizer)
        .toEqual(runtime.fileMapLists?.sanitizer);
      expect(merged.sanitizerPythonTarget)
        .toEqual({ myop: 'python3 run.py' });
    });
  });
});
