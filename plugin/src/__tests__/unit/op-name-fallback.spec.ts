/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import {
  CACHE_SCHEMA_VERSION,
  FolderScanState,
  getCacheFilePath,
} from '@plugin/helpers/workspace-cache';
import { resolveFallbackOperatorName } from '@plugin/domain/models/op-record';

describe('resolveFallbackOperatorName (default-path fallback naming)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-opname-fallback-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function writeFolderState(state: FolderScanState, root: string = tmpRoot): void {
    fs.mkdirSync(path.dirname(getCacheFilePath(root)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(root),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        folders: { [normalizeProjectPath(root)]: state },
      }),
      'utf8',
    );
  }

  // A root-synthesized record: op_name is the PROJECT basename — a folder, not an operator.
  const rootOperator = (opPath: string = tmpRoot) => ({
    op_name: path.basename(opPath),
    op_type: 'ascend',
    op_path: opPath,
  });

  it('prefers the first scanned operator over the directory basename', () => {
    writeFolderState({
      opsMeet: [],
      opsList: [
        {
          name: 'scan_op',
          path: path.join(tmpRoot, 'scan_op'),
        },
      ],
      experimentalOpsList: [],
    });

    expect(resolveFallbackOperatorName(rootOperator(), ''))
      .toBe('scan_op');
  });

  it('uses the explicit selection, never the directory basename, when the scan is empty', () => {
    expect(resolveFallbackOperatorName(rootOperator(), 'add_custom'))
      .toBe('add_custom');
  });

  it('uses the first name of a multi-op selection', () => {
    const operator = {
      op_name: 'sub',
      op_type: 'cann',
      op_path: path.join(tmpRoot, 'sub'),
    };

    expect(resolveFallbackOperatorName(operator, 'add,sub'))
      .toBe('add');
  });

  it('returns an empty name when nothing is known', () => {
    expect(resolveFallbackOperatorName(null, ''))
      .toBe('');
    expect(resolveFallbackOperatorName(undefined, undefined))
      .toBe('');
  });

  it('treats a root-synthesized record name (directory basename) as absent', () => {
    // No scan state, no selection: the record's name is the folder itself, so
    // the target must degrade to '' (a bare `${op_path}/build/...` prefix), not
    // a pseudo-operator named after the project directory.
    expect(resolveFallbackOperatorName(rootOperator(), ''))
      .toBe('');
  });
});
