/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import os from 'node:os';
import path from 'node:path';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';

const mockProject = {
  workspaceIsProject: jest.fn(() => true),
  projectPath: '',
};
const mockStorageGet = jest.fn(() => [] as string[]);
const mockStorageSet = jest.fn();
const mockGetProjectByPath = jest.fn();

jest.mock('vscode', () => {
  const fsPromises = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  const pathModule = jest.requireActual<typeof import('node:path')>('node:path');
  const FileType = {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  };
  const stat = jest.fn(async (uri: { fsPath: string }) => {
    const value = await fsPromises.stat(uri.fsPath);

    return {
      type: value.isDirectory() ? FileType.Directory : FileType.File,
      ctime: value.ctimeMs,
      mtime: value.mtimeMs,
      size: value.size,
    };
  });
  const readDirectory = jest.fn(async (uri: { fsPath: string }) => {
    const entries = await fsPromises.readdir(uri.fsPath, { withFileTypes: true });

    return entries.map((entry) => [
      entry.name,
      entry.isDirectory() ? FileType.Directory : FileType.File,
    ] as [string, number]);
  });

  return {
    FileType,
    env: { uriScheme: 'vscode' },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (uri: { fsPath: string }, ...segments: string[]) => ({ fsPath: pathModule.join(uri.fsPath, ...segments) }),
    },
    workspace: {
      fs: {
        stat,
        readDirectory,
      },
    },
  };
});

jest.mock('@plugin/class/permanent-storage', () => ({
  PermanentStorage: {
    getInstance: () => ({
      get: mockStorageGet,
      set: mockStorageSet,
    }),
  },
}));

jest.mock('@plugin/core/project/project', () => ({ Project: { getInstance: () => mockProject } }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeOpDevtoolsDottedSettings: jest.fn() } }));

jest.mock('@plugin/helpers/ide-config-dir', () => {
  const pathModule = jest.requireActual<typeof import('node:path')>('node:path');
  const actual = jest.requireActual<typeof import('@plugin/helpers/ide-config-dir')>('@plugin/helpers/ide-config-dir');

  return {
    ...actual,
    joinIdeConfigRelative: (...segments: string[]) => pathModule.join('.vscode', ...segments),
    joinIdeConfigPath: (root: string, ...segments: string[]) => pathModule.join(root, '.vscode', ...segments),
  };
});

jest.mock('@plugin/domain/models/project-model', () => ({
  ...jest.requireActual('@plugin/domain/models/project-model'),
  getProjectByPath: mockGetProjectByPath,
}));

import { PerformanceRunData } from '@plugin/core/performance/performance-run-data';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import { updateWorkspaceCache } from '@plugin/helpers/workspace-cache';

const opprofUnder = (opDir: string, ...segments: string[]): string =>
  path.join(opDir, '.vscode', 'opprof', ...segments);

describe('PerformanceRunData opprof workspace-root scan', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mstt-opprof-multi-'));
    mockProject.projectPath = tempRoot;
    mockGetProjectByPath.mockReset();
    // The project is recognized through the synthesized record; the
    // per-test override (pyasc) swaps project_type below.
    mockGetProjectByPath.mockReturnValue({
      project_name: 'root',
      project_path: tempRoot,
      project_type: 'ascend',
    });
    mockStorageGet.mockReturnValue([]);
    mockStorageSet.mockClear();
  });

  afterEach(async () => {
    await rm(tempRoot, {
      recursive: true,
      force: true,
    });
    jest.clearAllMocks();
  });

  it('scans only the workspace-root opprof — per-operator run trees are ignored', async () => {
    const opA = path.join(tempRoot, 'ops', 'op-a');
    const opB = path.join(tempRoot, 'ops', 'op-b');

    // Per-operator run trees exist but must NOT be scanned...
    await mkdir(opprofUnder(opA, 'run-a'), { recursive: true });
    await mkdir(opprofUnder(opB, 'run-b'), { recursive: true });
    await writeFile(opprofUnder(opA, 'run-a', 'report.csv'), 'a,b\n1,2\n');
    await writeFile(opprofUnder(opB, 'run-b', 'report.csv'), 'a,b\n3,4\n');

    // ...only the workspace-root opprof run surfaces.
    await mkdir(opprofUnder(tempRoot, 'run-root'), { recursive: true });
    await writeFile(opprofUnder(tempRoot, 'run-root', 'keep.csv'), 'a,b\n5,6\n');

    await updateWorkspaceCache(tempRoot, (cache) => {
      cache.folders = {
        [normalizeProjectPath(tempRoot)]: {
          opsMeet: [],
          opsList: [
            {
              name: 'op-a',
              path: opA,
            },
            {
              name: 'op-b',
              path: opB,
            },
          ],
          experimentalOpsList: [],
        },
      };
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual(['run-root']);
    expect(records.map((record) => record.dirPath))
      .toEqual([opprofUnder(tempRoot, 'run-root')]);
  });

  it('falls back to the project-root opprof when the cache has no folder state', async () => {
    // Cache exists but carries no folders section — the root is scanned directly.
    await updateWorkspaceCache(tempRoot, (cache) => {
      cache.fileMapLists = {
        sanitizer: [],
        simulate: [],
        on_board: [],
      };
    });

    await mkdir(opprofUnder(tempRoot, 'run-root'), { recursive: true });
    await writeFile(opprofUnder(tempRoot, 'run-root', 'keep.bin'), 'keep');

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual(['run-root']);
  });

  it('roots a non-standard-custom project at its own opprof directory', async () => {
    mockGetProjectByPath.mockReturnValue({
      project_name: 'py-project',
      project_path: tempRoot,
      project_type: 'pyasc',
    });

    await mkdir(opprofUnder(tempRoot, 'run-single'), { recursive: true });
    await writeFile(opprofUnder(tempRoot, 'run-single', 'keep.csv'), 'a,b\n1,2\n');

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual(['run-single']);
  });

  it('reads simulate/on_board file-map lists from the workspace cache', async () => {

    const simulateFile = path.join(tempRoot, 'sim-report');
    const onboardFile = path.join(tempRoot, 'onboard-report');

    for (const dir of [
      simulateFile,
      onboardFile,
    ]) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'r.csv'), 'a\n1\n');
    }

    await updateWorkspaceCache(tempRoot, (cache) => {
      cache.fileMapLists = {
        sanitizer: [],
        simulate: [
          {
            filePath: simulateFile,
            reportTime: 111,
          },
        ],
        on_board: [
          {
            filePath: onboardFile,
            reportTime: 222,
          },
        ],
      };
    });

    // No config-row source exists — the cache list is authoritative.
    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key)
      .sort())
      .toEqual([
        `onboard_${onboardFile}`,
        `simulate_${simulateFile}`,
      ]);
    expect(records.find((record) => record.key === `simulate_${simulateFile}`)?.timestamp)
      .toBe(111);
    expect(records.find((record) => record.key === `onboard_${onboardFile}`)?.timestamp)
      .toBe(222);
  });

  it('returns no mapped records when the cache lacks the per-type entry (no config-row fallback)', async () => {

    const simulateFile = path.join(tempRoot, 'sim-from-config');

    await mkdir(simulateFile, { recursive: true });
    await writeFile(path.join(simulateFile, 'r.csv'), 'a\n1\n');

    // fileMapLists exists but has no simulate key — no config row.
    await updateWorkspaceCache(tempRoot, (cache) => {
      cache.fileMapLists = {
        sanitizer: [],
        on_board: [],
      } as typeof cache.fileMapLists;
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual([]);
  });

  it('drops a stale file-map entry whose path disappeared (cache source)', async () => {

    const existing = path.join(tempRoot, 'mapped-dir');
    const gone = path.join(tempRoot, 'vanished-dir');

    await mkdir(existing, { recursive: true });
    await writeFile(path.join(existing, 'r.csv'), 'a\n1\n');

    await updateWorkspaceCache(tempRoot, (cache) => {
      cache.fileMapLists = {
        sanitizer: [],
        simulate: [
          {
            filePath: existing,
            reportTime: 10,
          },
          {
            filePath: gone,
            reportTime: 20,
          },
        ],
        on_board: [],
      };
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual([`simulate_${existing}`]);
  });
});
