/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { OperatorProjectViewIdValue } from '../project-type-view-id';

// Webview 相关类型定义

export type GetHomeResult = string;

export type RemotePathSearchParams = {
  keyword: string;
  type: string;
};

export type RemotePathSearchResult = {
  type: string;
  list: Array<{ path: string }>;
};

export type CreatedProjectParams = {
  projectPath: string;
  projectName: string;
  projectSH?: string;
  createOperatorProjectDictoryFileType?: OperatorProjectViewIdValue;
  templateName?: string;
};

export type OpenProjectParams = {
  projectPath: string;
  projectName?: string;
  projectSH?: string;
};

export type GetWorkspaceResult = string | null;

export type SelectFolderParams = {
  defaultPath?: string;
};

export type SelectFolderResult = string;

export type SelectFileParams = {
  defaultPath?: string;
  fileTypes?: Array<{
    label: string;
    extensions: string[];
  }>;
};

export type SelectFileResult = string;

export type JumpToFileParams = {
  fileLink: string;
  row: number;
  col: number;
  errorMessage?: string; // 错误信息，用于在高亮时显示
  errorTitle?: string; // 错误标题
};
