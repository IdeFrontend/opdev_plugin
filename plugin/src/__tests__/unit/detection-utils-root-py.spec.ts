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

const mockReaddirSync = jest.fn();

jest.mock('fs', () => {
  const realFs = jest.requireActual('fs') as Record<string, unknown>;

  return {
    ...realFs,
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  };
});

const realFs = jest.requireActual('fs') as typeof import('fs');

import {
  hasPyFilesInRoot,
  listRootPythonEntryFiles,
} from '@plugin/domain/plugins/detection-utils';

describe('listRootPythonEntryFiles', () => {
  let tmpRoot: string;

  beforeEach(() => {
    mockReaddirSync.mockImplementation(((...args: unknown[]) =>
      (realFs.readdirSync as (...a: unknown[])=> unknown)(...args)) as never);
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'root-py-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('lists only direct .py children and excludes helpers', () => {
    fs.writeFileSync(path.join(tmpRoot, 'main.py'), '');
    fs.writeFileSync(path.join(tmpRoot, '__init__.py'), '');
    fs.mkdirSync(path.join(tmpRoot, 'src'));
    fs.writeFileSync(path.join(tmpRoot, 'src', 'nested.py'), '');

    expect(listRootPythonEntryFiles(tmpRoot))
      .toEqual([path.join(tmpRoot, 'main.py')]);
    expect(hasPyFilesInRoot(tmpRoot))
      .toBe(true);
  });

  it('returns empty when only excluded helpers exist at root', () => {
    fs.writeFileSync(path.join(tmpRoot, '__init__.py'), '');

    expect(listRootPythonEntryFiles(tmpRoot))
      .toEqual([]);
    expect(hasPyFilesInRoot(tmpRoot))
      .toBe(false);
  });

  it('returns an empty list when the directory cannot be read', () => {
    mockReaddirSync.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(listRootPythonEntryFiles(tmpRoot))
      .toEqual([]);
    expect(hasPyFilesInRoot(tmpRoot))
      .toBe(false);
  });
});
