/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * VSCode resource manager root directory tool class
 */
export class ExplorerRootUtils {
  /**
   * Get the root directory information of the resource manager
   */
  public static getExplorerRoots(): Array<{
    name: string;
    path: string;
    index: number;
  }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return [];
    }

    return workspaceFolders.map((folder) => ({
      name: folder.name,
      path: folder.uri.fsPath,
      index: folder.index,
      uri: folder.uri,
    }));
  }

  /**
   * Get the main root directory (first workspace folder)
   */
  public static getPrimaryRoot(): { name: string;
    path: string } | undefined {
    const roots = this.getExplorerRoots();

    return roots.length > 0 ? roots[0] : undefined;
  }
}
