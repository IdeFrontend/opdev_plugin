/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('vscode', () => {
  const workspaceFolders: Array<{
    name: string;
    index: number;
    uri: { fsPath: string };
  }> = [];

  return { workspace: { workspaceFolders } };
});

import * as vscode from 'vscode';

import { ExplorerRootUtils } from '@plugin/class/explorer-root-utils';

describe('ExplorerRootUtils', () => {
  const workspaceFolders = vscode.workspace.workspaceFolders as Array<{
    name: string;
    index: number;
    uri: { fsPath: string };
  }>;

  beforeEach(() => {
    workspaceFolders.splice(0);
    workspaceFolders.push({
      name: 'alpha',
      index: 0,
      uri: { fsPath: '/a' },
    });
    workspaceFolders.push({
      name: 'beta',
      index: 1,
      uri: { fsPath: '/b' },
    });
  });

  it('returns an empty root list when no workspace folders are open', () => {
    (vscode.workspace.workspaceFolders as unknown) = undefined;

    try {
      expect(ExplorerRootUtils.getExplorerRoots())
        .toEqual([]);
    }
    finally {
      (vscode.workspace.workspaceFolders as unknown) = workspaceFolders;
    }
  });

  it('maps each workspace folder to its name, path and index', () => {
    expect(ExplorerRootUtils.getExplorerRoots())
      .toEqual([
        {
          name: 'alpha',
          path: '/a',
          index: 0,
          uri: { fsPath: '/a' },
        },
        {
          name: 'beta',
          path: '/b',
          index: 1,
          uri: { fsPath: '/b' },
        },
      ]);
  });

  it('returns the first workspace folder as the primary root', () => {
    expect(ExplorerRootUtils.getPrimaryRoot())
      .toEqual({
        name: 'alpha',
        path: '/a',
        index: 0,
        uri: { fsPath: '/a' },
      });
  });

  it('returns undefined as the primary root when no folders exist', () => {
    workspaceFolders.splice(0);

    expect(ExplorerRootUtils.getPrimaryRoot())
      .toBeUndefined();
  });
});
