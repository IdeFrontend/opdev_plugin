/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('compressing', () => ({ zip: { compressDir: jest.fn(async () => undefined) } }));

jest.mock('vscode', () => ({
  env: { uiKind: 1 },
  UIKind: {
    Desktop: 1,
    Web: 2,
  },
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  Uri: {
    from: jest.fn((parts: { scheme?: string;
      path?: string }) => ({
      ...parts,
      fsPath: parts.path ?? '',
      toString: () => parts.path ?? '',
    })),
    file: jest.fn((fsPath: string) => ({
      fsPath,
      toString: () => `file://${fsPath}`,
    })),
    joinPath: jest.fn((base: { fsPath: string }, ...parts: string[]) => ({
      fsPath: [
        base.fsPath,
        ...parts,
      ].join('\\'),
      toString: () => 'joined',
    })),
    parse: jest.fn((value: string) => ({
      fsPath: value,
      toString: () => value,
    })),
  },
  window: {
    showSaveDialog: jest.fn(async () => undefined),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
  },
  workspace: {
    fs: {
      stat: jest.fn(async () => ({ type: 1 })),
      copy: jest.fn(async () => undefined),
      readFile: jest.fn(async () => new Uint8Array()),
      readDirectory: jest.fn(async () => []),
      writeFile: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    },
  },
  commands: { executeCommand: jest.fn(async () => undefined) },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import compressing from 'compressing';

import { FileService } from '@plugin/service/file-service';

const uiKind = vscode.env as { uiKind: number };
const showSaveDialog = vscode.window.showSaveDialog as jest.Mock;
const fsStat = vscode.workspace.fs.stat as jest.Mock;
const fsCopy = vscode.workspace.fs.copy as jest.Mock;
const fsReadFile = vscode.workspace.fs.readFile as jest.Mock;
const fsReadDirectory = vscode.workspace.fs.readDirectory as jest.Mock;
const fsWriteFile = vscode.workspace.fs.writeFile as jest.Mock;
const fsDelete = vscode.workspace.fs.delete as jest.Mock;
const executeCommand = vscode.commands.executeCommand as jest.Mock;
const compressDir = (compressing as { zip: { compressDir: jest.Mock } }).zip.compressDir;

describe('FileService', () => {
  let tempDir: string;
  let service: FileService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-file-service-'));
    service = new FileService();
    uiKind.uiKind = vscode.UIKind.Desktop;
    showSaveDialog.mockClear();
    fsStat.mockClear();
    fsCopy.mockClear();
    fsReadFile.mockClear();
    fsReadDirectory.mockClear();
    fsWriteFile.mockClear();
    fsDelete.mockClear();
    executeCommand.mockClear();
    compressDir.mockClear();
    showSaveDialog.mockResolvedValue({ path: '/out/report.txt' });
    fsStat.mockResolvedValue({ type: vscode.FileType.File });
    fsCopy.mockResolvedValue(undefined);
    fsReadFile.mockResolvedValue(new Uint8Array());
    fsReadDirectory.mockResolvedValue([]);
    fsWriteFile.mockResolvedValue(undefined);
    fsDelete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  });

  describe('pathExists', () => {
    it('resolves true for an existing file', async () => {
      const file = path.join(tempDir, 'exists.txt');

      fs.writeFileSync(file, 'x');

      await expect(service.pathExists({
        path: file,
        mustFile: true,
      }))
        .resolves.toBe(true);
      await expect(service.pathExists({
        path: file,
        mustFile: false,
      }))
        .resolves.toBe(true);
    });

    it('resolves false for a missing path', async () => {
      await expect(service.pathExists({
        path: path.join(tempDir, 'nope.txt'),
        mustFile: false,
      }))
        .resolves.toBe(false);
      await expect(service.pathExists({
        path: path.join(tempDir, 'nope.txt'),
        mustFile: true,
      }))
        .resolves.toBe(false);
    });

    it('resolves false for a directory when mustFile is set', async () => {
      await expect(service.pathExists({
        path: tempDir,
        mustFile: true,
      }))
        .resolves.toBe(false);
      await expect(service.pathExists({
        path: tempDir,
        mustFile: false,
      }))
        .resolves.toBe(true);
    });
  });

  describe('saveFileToLocal (desktop)', () => {
    it('copies a file to the chosen location and reveals it', async () => {
      const source = path.join(tempDir, 'data.txt');

      fs.writeFileSync(source, 'data');

      await expect(service.saveFileToLocal({
        sourcePath: source,
        filename: 'data.txt',
      }))
        .resolves.toBe(true);
      expect(fsCopy)
        .toHaveBeenCalledWith(
          expect.objectContaining({ fsPath: source }),
          expect.objectContaining({ path: '/out/report.txt' }),
          { overwrite: true },
        );
      expect(executeCommand)
        .toHaveBeenCalledWith('revealFileInOS', expect.objectContaining({ path: '/out/report.txt' }));
    });

    it('returns false when the user cancels the save dialog', async () => {
      showSaveDialog.mockResolvedValue(undefined);

      await expect(service.saveFileToLocal({
        sourcePath: path.join(tempDir, 'data.txt'),
        filename: 'data.txt',
      }))
        .resolves.toBe(false);
      expect(fsCopy).not.toHaveBeenCalled();
    });

    it('throws when the source path does not exist', async () => {
      fsStat.mockRejectedValueOnce(new Error('not found'));

      await expect(service.saveFileToLocal({
        sourcePath: path.join(tempDir, 'missing.txt'),
        filename: 'missing.txt',
      }))
        .rejects.toThrow('file.saveFailedSourceNotExist');
    });

    it('zips a directory, copies the zip and deletes the temporary zip', async () => {
      const source = path.join(tempDir, 'folder');

      fs.mkdirSync(source);
      fsStat.mockResolvedValueOnce({ type: vscode.FileType.Directory });

      await expect(service.saveFileToLocal({
        sourcePath: source,
        filename: 'folder.zip',
      }))
        .resolves.toBe(true);
      expect(compressDir)
        .toHaveBeenCalledWith(source, `${source}.zip`);
      expect(fsCopy)
        .toHaveBeenCalledWith(
          expect.objectContaining({ fsPath: `${source}.zip` }),
          expect.objectContaining({ path: '/out/report.txt' }),
          { overwrite: true },
        );
      expect(fsDelete)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: `${source}.zip` }));
    });

    it('passes filters and a custom title to the save dialog', async () => {
      const source = path.join(tempDir, 'data.txt');

      fs.writeFileSync(source, 'data');
      await service.saveFileToLocal({
        sourcePath: source,
        filename: 'data.txt',
        allowedTypes: [
          'txt',
          'log',
        ],
        dialogTitle: 'Choose destination',
      });

      expect(showSaveDialog)
        .toHaveBeenCalledWith(expect.objectContaining({
          filters: {
            default: [
              'txt',
              'log',
            ],
          },
          title: 'Choose destination',
        }));
    });

    it('uses the default dialog title when none is provided', async () => {
      const source = path.join(tempDir, 'data.txt');

      fs.writeFileSync(source, 'data');
      await service.saveFileToLocal({
        sourcePath: source,
        filename: 'data.txt',
      });

      expect(showSaveDialog)
        .toHaveBeenCalledWith(expect.objectContaining({ title: 'file.saveTo' }));
    });
  });

  describe('saveFileToLocal (web)', () => {
    beforeEach(() => {
      uiKind.uiKind = vscode.UIKind.Web;
    });

    it('copies a file directly and returns true', async () => {
      const source = path.join(tempDir, 'data.txt');

      fs.writeFileSync(source, 'data');

      await expect(service.saveFileToLocal({
        sourcePath: source,
        filename: 'data.txt',
      }))
        .resolves.toBe(true);
      expect(fsCopy)
        .toHaveBeenCalledTimes(1);
    });

    it('returns false when the user cancels the save dialog', async () => {
      showSaveDialog.mockResolvedValue(undefined);

      await expect(service.saveFileToLocal({
        sourcePath: path.join(tempDir, 'data.txt'),
        filename: 'data.txt',
      }))
        .resolves.toBe(false);
    });

    it('falls back to base64 file data when the direct copy fails', async () => {
      const source = path.join(tempDir, 'data.txt');

      fs.writeFileSync(source, 'data');
      fsCopy.mockRejectedValueOnce(new Error('copy blocked'));
      fsReadFile.mockResolvedValueOnce(new Uint8Array(Buffer.from('hello')));

      await expect(service.saveFileToLocal({
        sourcePath: source,
        filename: 'data.txt',
      }))
        .resolves.toEqual({
          data: 'aGVsbG8=',
          filename: 'report.txt',
        });
    });

    it('zips a directory and writes the zip when the direct write works', async () => {
      const source = path.join(tempDir, 'folder');

      fs.mkdirSync(source);
      fsStat.mockResolvedValueOnce({ type: vscode.FileType.Directory });
      fsReadDirectory.mockImplementation(async (uri: { fsPath: string }) => {
        if (uri.fsPath === source) {
          return [
            [
              'a.txt',
              vscode.FileType.File,
            ],
            [
              'sub',
              vscode.FileType.Directory,
            ],
          ];
        }

        return [];
      });
      fsReadFile.mockImplementation(async () => new Uint8Array(Buffer.from('hi')));

      await expect(service.saveFileToLocal({
        sourcePath: source,
        filename: 'folder.zip',
      }))
        .resolves.toBe(true);
      expect(fsWriteFile)
        .toHaveBeenCalledTimes(1);

      const written = fsWriteFile.mock.calls[0][1] as Buffer;

      expect(Buffer.from(written)
        .subarray(0, 2))
        .toEqual(Buffer.from([
          0x50,
          0x4b,
        ]));
    });

    it('returns base64 zip data when the direct directory write fails', async () => {
      const source = path.join(tempDir, 'folder');

      fs.mkdirSync(source);
      fsStat.mockResolvedValueOnce({ type: vscode.FileType.Directory });
      fsReadDirectory.mockResolvedValue([
        [
          'a.txt',
          vscode.FileType.File,
        ],
      ]);
      fsReadFile.mockImplementation(async () => new Uint8Array(Buffer.from('hi')));
      fsWriteFile.mockRejectedValueOnce(new Error('write blocked'));

      const result = await service.saveFileToLocal({
        sourcePath: source,
        filename: 'folder.zip',
      });

      expect(result)
        .toEqual({
          data: expect.stringMatching(/^UEs/),
          filename: 'report.txt',
        });
    });

    it('throws when the source path does not exist', async () => {
      fsStat.mockRejectedValueOnce(new Error('not found'));

      await expect(service.saveFileToLocal({
        sourcePath: path.join(tempDir, 'missing.txt'),
        filename: 'missing.txt',
      }))
        .rejects.toThrow('file.saveFailedSourceNotExist');
    });
  });
});
