/**
 * Unit tests for DumpTensorData: project gating, run-data directory scanning,
 * nested .bin file discovery, and timestamp-based record sorting. The vscode
 * filesystem and the Project singleton are mocked; no real files are touched.
 */

import * as vscode from 'vscode';

jest.mock('vscode', () => ({
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (uri: { fsPath: string }, ...segments: string[]) => ({
      fsPath: [
        uri.fsPath,
        ...segments,
      ].join('/'),
    }),
  },
  env: { uriScheme: 'vscode' },
  workspace: {
    fs: {
      readDirectory: jest.fn(),
      stat: jest.fn(),
    },
  },
}));

jest.mock('@plugin/core/project/project', () => ({ Project: { getInstance: jest.fn() } }));

import path from 'node:path';

import { Project } from '@plugin/core/project/project';
import { DumpTensorData } from '@plugin/service/dump-tensor-service';

const readDirectoryMock = vscode.workspace.fs.readDirectory as jest.Mock;
const statMock = vscode.workspace.fs.stat as jest.Mock;
const getProjectMock = Project.getInstance as jest.Mock;

describe('DumpTensorData', () => {
  const projectRoot = '/fake/project';

  const mockProject = (isProject: boolean): { workspaceIsProject: ()=> boolean;
    projectPath: string } => ({
    workspaceIsProject: () => isProject,
    projectPath: projectRoot,
  });

  beforeEach(() => {
    readDirectoryMock.mockReset();
    statMock.mockReset();
    getProjectMock.mockReset();
    getProjectMock.mockReturnValue(mockProject(true));
    (DumpTensorData as unknown as { instance?: DumpTensorData }).instance = undefined;
  });

  it('returns the same singleton instance', () => {
    expect(DumpTensorData.getInstance())
      .toBe(DumpTensorData.getInstance());
  });

  it('returns an empty list when the workspace is not a project', async () => {
    getProjectMock.mockReturnValue(mockProject(false));

    const service = DumpTensorData.getInstance();

    await expect(service.queryExecutionRecords('timestamp', 'asc'))
      .resolves
      .toEqual([]);
    expect(readDirectoryMock)
      .not
      .toHaveBeenCalled();
  });

  it('returns an empty list when the dump tensor root does not exist', async () => {
    statMock.mockRejectedValue(new Error('ENOENT'));

    const service = DumpTensorData.getInstance();

    await expect(service.queryExecutionRecords('timestamp', 'desc'))
      .resolves
      .toEqual([]);
    expect(readDirectoryMock)
      .not
      .toHaveBeenCalled();
  });

  it('scans execution records and discovers nested .bin files only', async () => {
    // The module builds the root as Uri.joinPath(Uri.file(projectPath), '.vscode/DumpTensor')
    // where the relative part comes from path.join (backslashes on Windows).
    const rootFsPath = `${projectRoot}/${path.join('.vscode', 'DumpTensor')}`;
    const recordAFsPath = `${rootFsPath}/run-2024-01`;
    const recordBFsPath = `${rootFsPath}/run-2024-02`;
    const subDirFsPath = `${recordAFsPath}/sub-data`;

    readDirectoryMock.mockImplementation((uri: { fsPath: string }) => {
      switch (uri.fsPath) {
        case rootFsPath:
          return [
            [
              'run-2024-01',
              vscode.FileType.Directory,
            ],
            [
              'run-2024-02',
              vscode.FileType.Directory,
            ],
            [
              'stray.bin',
              vscode.FileType.File,
            ],
          ];
        case recordAFsPath:
          return [
            [
              'sub-data',
              vscode.FileType.Directory,
            ],
            [
              'tensor-a.bin',
              vscode.FileType.File,
            ],
            [
              'notes.txt',
              vscode.FileType.File,
            ],
          ];
        case subDirFsPath:
          return [
            [
              'empty-dir',
              vscode.FileType.Directory,
            ],
            [
              'nested.bin',
              vscode.FileType.File,
            ],
          ];
        case recordBFsPath:
          return [
            [
              'inner.bin',
              vscode.FileType.File,
            ],
            [
              'noext',
              vscode.FileType.File,
            ],
          ];
        default:
          return [];
      }
    });
    statMock.mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath === recordAFsPath) {
        return { ctime: 1000 };
      }

      return { ctime: 2000 };
    });

    const service = DumpTensorData.getInstance();
    const records = await service.queryExecutionRecords('timestamp', 'asc');

    expect(records)
      .toHaveLength(2);
    const recordA = records[0];
    const recordB = records[1];

    expect(recordA)
      .toEqual(expect.objectContaining({
        key: 'run-2024-01',
        title: 'run-2024-01',
        timestamp: 1000,
        dirPath: recordAFsPath,
        marked: false,
      }));
    expect(recordA.children)
      .toEqual([
        {
          title: 'sub-data',
          children: [
            {
              key: path.join(subDirFsPath, 'nested.bin'),
              title: 'nested.bin',
              filePath: path.join(subDirFsPath, 'nested.bin'),
              fileType: 'bin',
            },
          ],
        },
        {
          key: path.join(recordAFsPath, 'tensor-a.bin'),
          title: 'tensor-a.bin',
          filePath: path.join(recordAFsPath, 'tensor-a.bin'),
          fileType: 'bin',
        },
      ]);
    expect(recordB.children)
      .toEqual([
        {
          key: path.join(recordBFsPath, 'inner.bin'),
          title: 'inner.bin',
          filePath: path.join(recordBFsPath, 'inner.bin'),
          fileType: 'bin',
        },
      ]);
  });

  it('sorts records by timestamp in the requested order', async () => {
    const rootFsPath = `${projectRoot}/${path.join('.vscode', 'DumpTensor')}`;

    readDirectoryMock.mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath === rootFsPath) {
        return [
          [
            'run-a',
            vscode.FileType.Directory,
          ],
          [
            'run-b',
            vscode.FileType.Directory,
          ],
          [
            'run-c',
            vscode.FileType.Directory,
          ],
        ];
      }

      return [];
    });
    statMock.mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('run-a')) {
        return { ctime: 100 };
      }

      if (uri.fsPath.endsWith('run-b')) {
        return { ctime: 300 };
      }

      return { ctime: 200 };
    });

    const service = DumpTensorData.getInstance();
    const asc = await service.queryExecutionRecords('timestamp', 'asc');
    const desc = await service.queryExecutionRecords('timestamp', 'desc');

    expect(asc.map((record) => record.key))
      .toEqual([
        'run-a',
        'run-c',
        'run-b',
      ]);
    expect(desc.map((record) => record.key))
      .toEqual([
        'run-b',
        'run-c',
        'run-a',
      ]);
  });
});
