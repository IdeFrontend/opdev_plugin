/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('fs', () => ({
  ...jest.requireActual<typeof fs>('fs'),
  readdirSync: jest.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getFiles } from '@plugin/domain/services/system';

const mockedReaddirSync = fs.readdirSync as jest.Mock;
const realReaddirSync = jest.requireActual<typeof fs>('fs').readdirSync;

describe('system.getFiles', () => {
  let tempDir: string;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedReaddirSync.mockImplementation(realReaddirSync);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-system-'));
    consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  });

  it('returns an empty array for an empty path', () => {
    expect(getFiles(''))
      .toEqual([]);
  });

  it('returns an empty array when the directory does not exist', () => {
    expect(getFiles(path.join(tempDir, 'missing')))
      .toEqual([]);
  });

  it('lists files, directories and dotfiles with their types', () => {
    fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
    fs.writeFileSync(path.join(tempDir, 'a.log'), 'a');
    fs.writeFileSync(path.join(tempDir, '.hidden'), 'h');
    fs.writeFileSync(path.join(tempDir, 'noext'), 'n');
    fs.mkdirSync(path.join(tempDir, 'zdir'));

    expect(getFiles(tempDir))
      .toEqual([
        {
          name: '.hidden',
          path: path.resolve(tempDir, '.hidden'),
          type: '',
        },
        {
          name: 'a.log',
          path: path.resolve(tempDir, 'a.log'),
          type: 'log',
        },
        {
          name: 'b.txt',
          path: path.resolve(tempDir, 'b.txt'),
          type: 'txt',
        },
        {
          name: 'noext',
          path: path.resolve(tempDir, 'noext'),
          type: '',
        },
        {
          name: 'zdir',
          path: path.resolve(tempDir, 'zdir'),
          type: 'directory',
        },
      ]);
  });

  it('uses the last path segment as a search key when the full path is missing', () => {
    fs.writeFileSync(path.join(tempDir, 'result-1.json'), '1');
    fs.writeFileSync(path.join(tempDir, 'other.txt'), 'o');

    const items = getFiles(path.join(tempDir, 'result'));

    expect(items)
      .toHaveLength(1);
    expect(items[0].name)
      .toBe('result-1.json');
  });

  it('filters search results case-sensitively', () => {
    fs.writeFileSync(path.join(tempDir, 'CaseFile.txt'), '1');

    expect(getFiles(path.join(tempDir, 'case')))
      .toHaveLength(0);
  });

  it('returns an empty array when the path is a file, not a directory', () => {
    const file = path.join(tempDir, 'single.txt');

    fs.writeFileSync(file, 'x');

    expect(getFiles(file))
      .toEqual([]);
  });

  it('returns an empty array when readdir fails', () => {
    mockedReaddirSync.mockImplementationOnce(() => {
      throw new Error('readdir failed');
    });

    expect(getFiles(tempDir))
      .toEqual([]);
  });
});
