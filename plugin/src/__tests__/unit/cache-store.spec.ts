import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CACHE_SCHEMA_VERSION,
  WorkspaceCache,
  getCacheFilePath,
  readWorkspaceCache,
  seedIfMissing,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { getIdeConfigDir } from '@plugin/helpers/ide-config-dir';

describe('workspace cache store', () => {
  let tmpRoot: string;

  beforeEach(() => {
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

  it('cache file lands in the workspace IDE config dir (.vscode by default)', () => {
    expect(getCacheFilePath(tmpRoot))
      .toBe(path.join(tmpRoot, '.vscode', 'cache.json'));
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
