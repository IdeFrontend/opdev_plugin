/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { request } from '@/core/request';
import {
  SelectFolderParams,
  SelectFolderResult,
  SelectFileParams,
  SelectFileResult,
} from '@shared/api-types';

/**
 * 选择文件夹
 */
export function selectFolder(params?: SelectFolderParams) {
  return request.post<SelectFolderParams | undefined, SelectFolderResult | null>('webview/selectFolder', params);
}

/**
 * 选择文件
 */
export function selectFile(params?: SelectFileParams) {
  return request.post<SelectFileParams | undefined, SelectFileResult | null>('webview/selectFile', params);
}
