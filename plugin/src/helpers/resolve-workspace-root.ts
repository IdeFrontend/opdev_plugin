/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { ProjectManager } from '@plugin/core/project/project-manager';
import { getFirstWorkspaceFolderPath } from '@plugin/helpers/operator-project-workspace-config';

export type WorkspaceRootPreference = 'projectFirst' | 'workspaceFolderFirst';

export function resolveWorkspaceRoot(
  explicitRoot?: string,
  preference: WorkspaceRootPreference = 'projectFirst',
): string | undefined {
  if (explicitRoot) {
    return explicitRoot;
  }

  const projectPath = ProjectManager.getInstance().projectPath;
  const folderPath = getFirstWorkspaceFolderPath();

  if (preference === 'workspaceFolderFirst') {
    return folderPath ?? projectPath;
  }

  return projectPath ?? folderPath;
}
