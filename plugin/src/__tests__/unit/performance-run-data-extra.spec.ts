import os from 'node:os';
import path from 'node:path';
import {
  mkdir,
  mkdtemp,
  rm,
  stat as nodeStat,
  writeFile,
} from 'node:fs/promises';

const mockProject = {
  workspaceIsProject: jest.fn(() => true),
  projectPath: '',
};
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

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({ readWorkspaceProjectTypeSetting: jest.fn(() => undefined) }));

import { PerformanceRunData } from '@plugin/core/performance/performance-run-data';
import * as vscode from 'vscode';

const statMock = vscode.workspace.fs.stat as jest.MockedFunction<typeof vscode.workspace.fs.stat>;
const readDirectoryMock = vscode.workspace.fs.readDirectory as jest.MockedFunction<typeof vscode.workspace.fs.readDirectory>;

describe('PerformanceRunData lifecycle and edge cases', () => {
  let tempRoot: string;
  let operatorRoot: string;
  let opprofRoot: string;
  const defaultStatImplementation = statMock.getMockImplementation()!;
  const defaultReadDirectoryImplementation = readDirectoryMock.getMockImplementation()!;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mstt-performance-extra-'));
    operatorRoot = path.join(tempRoot, 'operator');
    opprofRoot = path.join(operatorRoot, '.vscode', 'opprof');

    await mkdir(opprofRoot, { recursive: true });

    mockProject.workspaceIsProject.mockReturnValue(true);
    mockProject.projectPath = operatorRoot;
    mockGetProjectByPath.mockReturnValue({
      project_name: 'operator',
      project_path: operatorRoot,
      project_type: 'cann',
    });
    mockStorageGet.mockReturnValue([]);
    mockStorageSet.mockClear();
    statMock.mockImplementation(defaultStatImplementation);
    readDirectoryMock.mockImplementation(defaultReadDirectoryImplementation);
    (PerformanceRunData as unknown as { instance?: PerformanceRunData }).instance = undefined;
    // The default cache carries no file-map lists.
    await writeFile(
      path.join(operatorRoot, '.vscode', 'cache.json'),
      JSON.stringify({ schemaVersion: 1 }),
    );
  });

  afterEach(async () => {
    await rm(tempRoot, {
      recursive: true,
      force: true,
    });
    jest.clearAllMocks();
  });

  it('returns a single shared singleton instance', () => {
    expect(PerformanceRunData.getInstance())
      .toBe(PerformanceRunData.getInstance());
  });

  it('marks and unmarks records through the permanent storage', () => {
    mockStorageGet.mockReturnValue(['existing']);
    const runData = new PerformanceRunData();

    runData.markRecord('new');
    expect(mockStorageSet)
      .toHaveBeenLastCalledWith('marked_performance_records', [
        'existing',
        'new',
      ]);

    mockStorageGet.mockReturnValue([
      'existing',
      'new',
    ]);
    runData.unmarkRecord('existing');
    expect(mockStorageSet)
      .toHaveBeenLastCalledWith('marked_performance_records', ['new']);
  });

  it('reflects marked records in the query result', async () => {
    await mkdir(path.join(opprofRoot, 'report-a'));
    await writeFile(path.join(opprofRoot, 'report-a', 'result.csv'), 'a,b\n1,2\n');

    const runData = new PerformanceRunData();

    runData.markRecord('report-a');
    // Persisted state: the storage read must return what the write stored.
    mockStorageGet.mockReturnValue(['report-a']);

    const records = await runData.queryExecutionRecords('timestamp', 'desc');

    expect(records)
      .toHaveLength(1);
    expect(records[0]!.marked)
      .toBe(true);
    expect(records[0]!.key)
      .toBe('report-a');
  });

  it('returns no records when the workspace is not a project', async () => {
    await mkdir(path.join(opprofRoot, 'report-a'));

    mockProject.workspaceIsProject.mockReturnValue(false);

    await expect(new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc'))
      .resolves
      .toEqual([]);
  });

  it('returns no records when the workspace has no recognized project record', async () => {
    mockGetProjectByPath.mockReturnValue(undefined);

    await expect(new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc'))
      .resolves
      .toEqual([]);
  });

  it('still builds file-map records when the opprof root does not exist yet', async () => {
    await rm(opprofRoot, {
      recursive: true,
      force: true,
    });
    const mapped = path.join(tempRoot, 'simulated.csv');

    await writeFile(mapped, 'a,b\n1,2\n');
    await writeFile(
      path.join(operatorRoot, '.vscode', 'cache.json'),
      JSON.stringify({
        schemaVersion: 1,
        fileMapLists: {
          simulate: [
            {
              filePath: mapped,
              reportTime: 42,
            },
          ],
        },
      }),
    );

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual([`simulate_${mapped}`]);
    expect(records[0]!.timestamp)
      .toBe(42);
  });

  it('treats ENOENT like FileNotFound for vanished paths', async () => {
    const gone = path.join(opprofRoot, 'gone');
    const survivor = path.join(opprofRoot, 'survivor');

    await mkdir(gone);
    await mkdir(survivor);
    await writeFile(path.join(gone, 'stale.csv'), 'stale');
    await writeFile(path.join(survivor, 'keep.csv'), 'keep');

    const enoent = Object.assign(new Error('no such file'), { code: 'ENOENT' });

    readDirectoryMock.mockImplementation(async (uri) => {
      if (uri.fsPath === gone) {
        throw enoent;
      }

      return defaultReadDirectoryImplementation(uri);
    });
    statMock.mockImplementation(async (uri) => {
      if (uri.fsPath === gone) {
        throw enoent;
      }

      return defaultStatImplementation(uri);
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual(['survivor']);
  });

  it('propagates non-file-not-found stat failures while scanning the root', async () => {
    const permissionError = Object.assign(new Error('permission denied'), { code: 'NoPermissions' });

    statMock.mockImplementation(async (uri) => {
      if (uri.fsPath === opprofRoot) {
        throw permissionError;
      }

      throw new Error('unexpected call');
    });

    await expect(new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc'))
      .rejects
      .toBe(permissionError);
  });

  it('rethrows a file-not-found failure when the path still exists afterwards', async () => {
    const report = path.join(opprofRoot, 'flaky');
    const fileNotFound = Object.assign(new Error('disappeared once'), { code: 'FileNotFound' });

    await mkdir(report);
    await writeFile(path.join(report, 'result.csv'), 'a,b\n1,2\n');
    readDirectoryMock.mockImplementation(async (uri) => {
      if (uri.fsPath === report) {
        throw fileNotFound;
      }

      return defaultReadDirectoryImplementation(uri);
    });

    await expect(new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc'))
      .rejects
      .toBe(fileNotFound);
    await expect(nodeStat(report))
      .resolves
      .toBeDefined();
  });

  it('propagates a non-file-not-found recheck failure', async () => {
    const report = path.join(opprofRoot, 'flaky-recheck');
    const fileNotFound = Object.assign(new Error('disappeared'), { code: 'FileNotFound' });
    const permissionError = Object.assign(new Error('permission denied'), { code: 'NoPermissions' });

    await mkdir(report);
    await writeFile(path.join(report, 'result.csv'), 'a,b\n1,2\n');
    readDirectoryMock.mockImplementation(async (uri) => {
      if (uri.fsPath === report) {
        throw fileNotFound;
      }

      return defaultReadDirectoryImplementation(uri);
    });
    statMock.mockImplementation(async (uri) => {
      if (uri.fsPath === report) {
        throw permissionError;
      }

      return defaultStatImplementation(uri);
    });

    await expect(new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc'))
      .rejects
      .toBe(permissionError);
  });

  it('drops empty sub-folders and filters files with unsupported extensions', async () => {
    const report = path.join(opprofRoot, 'report');
    const emptySub = path.join(report, 'empty-sub');

    await mkdir(emptySub, { recursive: true });
    await writeFile(path.join(report, 'data.csv'), 'a,b\n1,2\n');
    await writeFile(path.join(report, 'notes.txt'), 'text only');
    await writeFile(path.join(report, 'noext'), 'no extension');
    await writeFile(path.join(emptySub, 'readme.txt'), 'ignored');

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records)
      .toHaveLength(1);
    expect((records[0]!.children as Array<{ title: string }>).map((child) => child.title))
      .toEqual(['data.csv']);
  });

  it('drops a folder whose stat no longer reports it as a directory', async () => {
    const report = path.join(opprofRoot, 'report');
    const sub = path.join(report, 'sub');

    await mkdir(sub, { recursive: true });
    await writeFile(path.join(sub, 'result.csv'), 'a,b\n1,2\n');

    statMock.mockImplementation(async (uri) => {
      if (uri.fsPath === sub) {
        return {
          type: vscode.FileType.File,
          ctime: 1,
          mtime: 1,
          size: 1,
        };
      }

      return defaultStatImplementation(uri);
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect((records[0]!.children as unknown[]))
      .toEqual([]);
  });

  it('keeps a single record when the scan lists the same run directory twice', async () => {
    await mkdir(path.join(opprofRoot, 'dup'));
    await writeFile(path.join(opprofRoot, 'dup', 'result.csv'), 'a,b\n1,2\n');

    readDirectoryMock.mockImplementation(async (uri) => {
      if (uri.fsPath === opprofRoot) {
        return [
          [
            'dup',
            vscode.FileType.Directory,
          ],
          [
            'dup',
            vscode.FileType.Directory,
          ],
        ];
      }

      return defaultReadDirectoryImplementation(uri);
    });

    const records = await new PerformanceRunData()
      .queryExecutionRecords('timestamp', 'desc');

    expect(records.map((record) => record.key))
      .toEqual(['dup']);
  });
});
