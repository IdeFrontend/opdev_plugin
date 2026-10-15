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
  readdir,
  rm,
  stat as nodeStat,
  writeFile,
} from 'node:fs/promises';

import type {
  PerformanceRunDataFile,
  PerformanceRunDataFolder,
} from '@shared/api-types';

const mockProject = {
  workspaceIsProject: jest.fn(() => true),
  projectPath: '',
};
const mockReadProjectTypeSetting = jest.fn(() => undefined);
const mockGetProjectByPath = jest.fn();
const mockStorageGet = jest.fn(() => [] as string[]);
const mockStorageSet = jest.fn();

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

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({ readWorkspaceProjectTypeSetting: mockReadProjectTypeSetting }));

import * as vscode from 'vscode';
import { PerformanceRunData } from '@plugin/core/performance/performance-run-data';

type FileMap = { filePath: string;
  reportTime: number };

const collectTitles = (children: (PerformanceRunDataFolder | PerformanceRunDataFile)[]): string[] => children.flatMap((child) => [
  child.title,
  ...('children' in child ? collectTitles(child.children) : []),
]);

describe('PerformanceRunData refresh reconciliation', () => {
  let tempRoot: string;
  let operatorRoot: string;
  let opprofRoot: string;
  let simulateFileMapList: FileMap[];
  let onboardFileMapList: FileMap[];
  const statMock = vscode.workspace.fs.stat as jest.MockedFunction<typeof vscode.workspace.fs.stat>;
  const readDirectoryMock = vscode.workspace.fs.readDirectory as jest.MockedFunction<typeof vscode.workspace.fs.readDirectory>;
  const defaultStatImplementation = statMock.getMockImplementation()!;
  const defaultReadDirectoryImplementation = readDirectoryMock.getMockImplementation()!;

  const writeCacheFileMapLists = (): Promise<void> => writeFile(
    path.join(operatorRoot, '.vscode', 'cache.json'),
    JSON.stringify({
      schemaVersion: 1,
      fileMapLists: {
        simulate: simulateFileMapList,
        on_board: onboardFileMapList,
      },
    }),
  );

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mstt-performance-refresh-'));
    operatorRoot = path.join(tempRoot, 'operator');
    opprofRoot = path.join(operatorRoot, '.vscode', 'opprof');
    simulateFileMapList = [];
    onboardFileMapList = [];

    await mkdir(opprofRoot, { recursive: true });

    mockProject.projectPath = operatorRoot;
    // The project is recognized through the synthesized record; a
    // single-op (non-standard-custom) project roots at its own .vscode/opprof.
    mockGetProjectByPath.mockReturnValue({
      project_name: 'operator',
      project_path: operatorRoot,
      project_type: 'cann',
    });
    mockReadProjectTypeSetting.mockReturnValue(undefined);
    await writeCacheFileMapLists();
    mockStorageGet.mockReturnValue([]);
    mockStorageSet.mockClear();
    statMock.mockImplementation(defaultStatImplementation);
    readDirectoryMock.mockImplementation(defaultReadDirectoryImplementation);
  });

  afterEach(async () => {
    await rm(tempRoot, {
      recursive: true,
      force: true,
    });
    jest.clearAllMocks();
  });

  it('removes deleted child files, nested folders, and reports while retaining survivors', async () => {
    const reportA = path.join(opprofRoot, 'report-a');
    const reportB = path.join(opprofRoot, 'report-b');
    const nested = path.join(reportA, 'nested');
    const deletedChild = path.join(reportA, 'deleted.csv');

    await mkdir(nested, { recursive: true });
    await mkdir(reportB, { recursive: true });
    await writeFile(deletedChild, 'metric,value\na,1\n');
    await writeFile(path.join(nested, 'nested.json'), '{}');
    await writeFile(path.join(reportB, 'survivor.bin'), 'survivor');

    const runData = new PerformanceRunData();
    let records = await runData.queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key)
      .sort())
      .toEqual([
        'report-a',
        'report-b',
      ]);
    expect(collectTitles(records.find((record) => record.key === 'report-a')!.children))
      .toEqual(expect.arrayContaining([
        'deleted.csv',
        'nested',
        'nested.json',
      ]));

    await rm(deletedChild);
    records = await runData.queryExecutionRecords('timestamp', 'desc');
    expect(collectTitles(records.find((record) => record.key === 'report-a')!.children))
      .toEqual([
        'nested',
        'nested.json',
      ]);

    await rm(nested, { recursive: true });
    const afterFolderDeletion = await runData.queryExecutionRecords('timestamp', 'desc');
    const repeatedRefresh = await runData.queryExecutionRecords('timestamp', 'desc');

    expect(afterFolderDeletion.find((record) => record.key === 'report-a')!.children)
      .toEqual([]);
    expect(repeatedRefresh)
      .toEqual(afterFolderDeletion);

    await rm(reportA, { recursive: true });
    records = await runData.queryExecutionRecords('timestamp', 'desc');
    expect(records.map((record) => record.key))
      .toEqual(['report-b']);
    expect(collectTitles(records[0].children))
      .toEqual(['survivor.bin']);
  });

  it('omits deleted mapped paths without changing mappings or mark metadata', async () => {
    const mappedDirectory = path.join(tempRoot, 'mapped-directory');
    const mappedFile = path.join(tempRoot, 'mapped.json');
    const survivor = path.join(tempRoot, 'mapped-survivor');

    await mkdir(mappedDirectory, { recursive: true });
    await mkdir(survivor, { recursive: true });
    await writeFile(path.join(mappedDirectory, 'result.csv'), 'a,b\n1,2\n');
    await writeFile(mappedFile, '{}');
    await writeFile(path.join(survivor, 'keep.bin'), 'keep');

    simulateFileMapList.push(
      {
        filePath: mappedDirectory,
        reportTime: 1,
      },
      {
        filePath: mappedFile,
        reportTime: 2,
      },
    );
    onboardFileMapList.push({
      filePath: survivor,
      reportTime: 3,
    });
    await writeCacheFileMapLists();
    const mappingsBeforeRefresh = JSON.stringify({
      simulateFileMapList,
      onboardFileMapList,
    });

    mockStorageGet.mockReturnValue([
      `simulate_${mappedDirectory}`,
      `simulate_${mappedFile}`,
    ]);

    const runData = new PerformanceRunData();

    expect(await runData.queryExecutionRecords('timestamp', 'desc'))
      .toHaveLength(3);

    await rm(mappedDirectory, { recursive: true });
    await rm(mappedFile);

    const records = await runData.queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual([`onboard_${survivor}`]);
    expect(JSON.stringify({
      simulateFileMapList,
      onboardFileMapList,
    }))
      .toBe(mappingsBeforeRefresh);
    expect(mockStorageSet).not.toHaveBeenCalled();
  });

  it('localizes report and nested-folder deletion races to the vanished subtree', async () => {
    const vanishedReport = path.join(opprofRoot, 'vanished-report');
    const survivorReport = path.join(opprofRoot, 'survivor-report');
    const vanishedFolder = path.join(survivorReport, 'vanished-folder');

    await mkdir(vanishedReport, { recursive: true });
    await mkdir(vanishedFolder, { recursive: true });
    await writeFile(path.join(vanishedReport, 'stale.csv'), 'stale');
    await writeFile(path.join(vanishedFolder, 'stale.json'), '{}');
    await writeFile(path.join(survivorReport, 'keep.bin'), 'keep');

    let reportRemoved = false;
    let folderRemoved = false;

    readDirectoryMock.mockImplementation(async (uri) => {
      const entries = await defaultReadDirectoryImplementation(uri);

      if (uri.fsPath === vanishedReport && !reportRemoved) {
        reportRemoved = true;
        await rm(vanishedReport, { recursive: true });
      }

      if (uri.fsPath === vanishedFolder && !folderRemoved) {
        folderRemoved = true;
        await rm(vanishedFolder, { recursive: true });
      }

      return entries;
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual(['survivor-report']);
    expect(collectTitles(records[0].children))
      .toEqual(['keep.bin']);
  });

  it('revalidates a nested folder after its children are scanned', async () => {
    const report = path.join(opprofRoot, 'report');
    const nested = path.join(report, 'nested');
    const nestedFile = path.join(nested, 'stale.json');

    await mkdir(nested, { recursive: true });
    await writeFile(nestedFile, '{}');
    await writeFile(path.join(report, 'keep.bin'), 'keep');

    let nestedRemoved = false;

    statMock.mockImplementation(async (uri) => {
      const value = await defaultStatImplementation(uri);

      if (uri.fsPath === nestedFile && !nestedRemoved) {
        nestedRemoved = true;
        await rm(nested, { recursive: true });
      }

      return value;
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual(['report']);
    expect(collectTitles(records[0].children))
      .toEqual(['keep.bin']);
  });

  it('recognizes VS Code FileNotFound errors from remote filesystem providers', async () => {
    const vanishedReport = path.join(opprofRoot, 'remote-vanished');
    const survivorReport = path.join(opprofRoot, 'remote-survivor');
    const fileNotFound = Object.assign(new Error('remote path disappeared'), { code: 'FileNotFound' });

    await mkdir(vanishedReport, { recursive: true });
    await mkdir(survivorReport, { recursive: true });
    await writeFile(path.join(vanishedReport, 'stale.csv'), 'stale');
    await writeFile(path.join(survivorReport, 'keep.csv'), 'keep');

    readDirectoryMock.mockImplementation(async (uri) => {
      if (uri.fsPath === vanishedReport) {
        throw fileNotFound;
      }

      return await defaultReadDirectoryImplementation(uri);
    });
    statMock.mockImplementation(async (uri) => {
      if (uri.fsPath === vanishedReport) {
        throw fileNotFound;
      }

      return await defaultStatImplementation(uri);
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual(['remote-survivor']);
    expect(collectTitles(records[0].children))
      .toEqual(['keep.csv']);
  });

  it('propagates an unrelated read failure while the path still exists', async () => {
    const report = path.join(opprofRoot, 'unreadable-report');
    const readError = Object.assign(new Error('permission denied'), { code: 'NoPermissions' });

    await mkdir(report, { recursive: true });
    await writeFile(path.join(report, 'result.csv'), 'a,b\n1,2\n');
    readDirectoryMock.mockImplementation(async (uri) => {
      if (uri.fsPath === report) {
        throw readError;
      }

      return await defaultReadDirectoryImplementation(uri);
    });

    await expect(new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc'))
      .rejects
      .toBe(readError);
    await expect(nodeStat(report)).resolves.toBeDefined();
    await expect(readdir(report)).resolves.toHaveLength(1);
  });
});
