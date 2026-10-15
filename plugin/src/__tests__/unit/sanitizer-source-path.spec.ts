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

import { resolveSanitizerSourceFsPath } from '@plugin/helpers/sanitizer-source-path';

describe('resolveSanitizerSourceFsPath', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitizer-source-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns undefined for a missing or empty link', () => {
    expect(resolveSanitizerSourceFsPath(workspaceRoot))
      .toBeUndefined();
    expect(resolveSanitizerSourceFsPath(workspaceRoot, ''))
      .toBeUndefined();
    expect(resolveSanitizerSourceFsPath(workspaceRoot, '   '))
      .toBeUndefined();
  });

  it('returns the existing absolute path unchanged (normalized)', () => {
    const absFile = path.join(workspaceRoot, 'abs', 'op.py');

    fs.mkdirSync(path.dirname(absFile), { recursive: true });
    fs.writeFileSync(absFile, 'print(1)', 'utf8');

    expect(resolveSanitizerSourceFsPath(workspaceRoot, absFile))
      .toBe(path.normalize(absFile));
  });

  it('resolves a relative path under the workspace root', () => {
    const relFile = path.join(workspaceRoot, 'ops', 'add', 'op.py');

    fs.mkdirSync(path.dirname(relFile), { recursive: true });
    fs.writeFileSync(relFile, 'print(1)', 'utf8');

    expect(resolveSanitizerSourceFsPath(workspaceRoot, 'ops/add/op.py'))
      .toBe(path.normalize(relFile));
  });

  it('trims surrounding whitespace before resolving', () => {
    const relFile = path.join(workspaceRoot, 'op.py');

    fs.writeFileSync(relFile, 'print(1)', 'utf8');

    expect(resolveSanitizerSourceFsPath(workspaceRoot, '  op.py  '))
      .toBe(path.normalize(relFile));
  });

  it('falls back to a basename match when the full relative path does not exist', () => {
    const rootFile = path.join(workspaceRoot, 'run.py');

    fs.writeFileSync(rootFile, 'print(1)', 'utf8');

    expect(resolveSanitizerSourceFsPath(workspaceRoot, 'missing/dir/run.py'))
      .toBe(path.normalize(rootFile));
  });

  it('returns undefined when nothing matches', () => {
    expect(resolveSanitizerSourceFsPath(workspaceRoot, 'nowhere/op.py'))
      .toBeUndefined();
    expect(resolveSanitizerSourceFsPath(workspaceRoot, path.join(workspaceRoot, 'missing', 'op.py')))
      .toBeUndefined();
  });
});
