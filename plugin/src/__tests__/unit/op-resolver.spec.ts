/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeOpDevtoolsDottedSettings: jest.fn() } }));

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
import { resolveOpEntryForProject } from '@plugin/helpers/op-resolver';

const { getProjectByPath } = jest.requireMock('@plugin/domain/models/project-model') as {
  getProjectByPath: jest.Mock;
};

describe('resolveOpEntryForProject (path-keyed via resolveOpRecord)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-opresolver-'));
    getProjectByPath.mockReset();
    getProjectByPath.mockReturnValue({
      project_type: 'ascend',
      project_path: tmpRoot,
    });
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

  it('resolves the scanned opsList entry with the stored row opType (non-standard-custom project)', () => {
    getProjectByPath.mockReturnValue({
      project_type: 'cann',
      project_path: tmpRoot,
    });
    writeFolderState({
      opsMeet: [],
      opsList: [
        {
          name: 'add_custom',
          path: '/c/root/add_custom',
          opType: 'cann',
        },
      ],
      experimentalOpsList: [],
    });

    const resolved = resolveOpEntryForProject(tmpRoot, 'add_custom');

    expect(resolved)
      .toEqual({
        path: '/c/root/add_custom',
        opType: 'cann',
      });
  });

  it('standard-custom always resolves the ROOT record — the selection never drives command paths', () => {
    writeFolderState({
      opsMeet: [],
      opsList: [
        {
          name: 'add_custom',
          path: '/c/root/add_custom',
          opType: 'cann',
        },
      ],
      experimentalOpsList: [],
    });

    const resolved = resolveOpEntryForProject(tmpRoot, 'add_custom');

    // The collection builds through ONE root operator (op_name = project name,
    // op_path = the project root, op_type 'ascend'); concrete operators are
    // selected only via the --ops={operatorNames} placeholder.
    expect(resolved)
      .toEqual({
        path: tmpRoot,
        opType: 'ascend',
      });
  });

  it('finds operators from experimentalOpsList as well', () => {
    getProjectByPath.mockReturnValue({
      project_type: 'cann',
      project_path: tmpRoot,
    });
    writeFolderState({
      opsMeet: [],
      opsList: [],
      experimentalOpsList: [
        {
          name: 'exp_op',
          path: '/c/root/experimental/exp_op',
          opType: 'cann',
        },
      ],
    });

    const resolved = resolveOpEntryForProject(tmpRoot, 'exp_op');

    expect(resolved)
      .toEqual({
        path: '/c/root/experimental/exp_op',
        opType: 'cann',
      });
  });

  it('matches the cache key via normalizeProjectPath (trailing separator tolerated)', () => {
    getProjectByPath.mockReturnValue({
      project_type: 'cann',
      project_path: tmpRoot,
    });
    writeFolderState({
      opsMeet: [],
      opsList: [
        {
          name: 'built_op',
          path: '/c/root/built_op',
          opType: 'cann',
        },
      ],
      experimentalOpsList: [],
    });

    const resolved = resolveOpEntryForProject(`${tmpRoot}/`, 'built_op');

    expect(resolved)
      .toEqual({
        path: '/c/root/built_op',
        opType: 'cann',
      });
  });

  it('falls back to the root operator when the operator is not a scanned child (root-operator fallback)', () => {
    writeFolderState({
      opsMeet: [],
      opsList: [
        {
          name: 'other_op',
          path: '/c/root/other_op',
        },
      ],
      experimentalOpsList: [],
    });

    const resolved = resolveOpEntryForProject(tmpRoot, 'unknown_op');

    // The root-op seed falls back to `op_type: project.project_type` —
    // 'ascend' for the standard-custom view.
    expect(resolved)
      .toEqual({
        path: tmpRoot,
        opType: 'ascend',
      });
  });

  it('falls back to the root operator when the cache has no folder entry for the root', () => {
    // cache.json exists but folders is empty / lacks the root key.
    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(getCacheFilePath(tmpRoot), JSON.stringify({ schemaVersion: CACHE_SCHEMA_VERSION }), 'utf8');

    const resolved = resolveOpEntryForProject(tmpRoot, 'add_custom');

    expect(resolved)
      .toEqual({
        path: tmpRoot,
        opType: 'ascend',
      });
  });

  it('returns undefined when the project is unrecognized and nothing is scanned', () => {
    getProjectByPath.mockReturnValue(undefined);

    const resolved = resolveOpEntryForProject(tmpRoot, 'add_custom');

    expect(resolved)
      .toBeUndefined();
  });

  it('maps non-standard-custom project types to their plugin op type', () => {
    getProjectByPath.mockReturnValue({
      project_type: 'pyasc',
      project_path: tmpRoot,
    });

    const resolved = resolveOpEntryForProject(tmpRoot, 'my_op');

    expect(resolved)
      .toEqual({
        path: tmpRoot,
        opType: 'pyasc',
      });
  });
});
