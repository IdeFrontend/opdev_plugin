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
  GetHomeResult,
  GetWorkspaceResult,
} from '@shared/api-types';

/**
 * 获取HOME目录
 */
export function getHome() {
  return request.post<undefined, GetHomeResult>('webview/getHome');
}

/**
 * 获取最后项目路径
 */

/**
 * 获取工作区路径
 */
export function getWorkspace() {
  return request.post<undefined, GetWorkspaceResult>('webview/getWorkspace');
}

/**
 * 获取当前项目类型
 */
export function getProjectType() {
  return request.post<undefined, { projectType: string | null;
    projectTemplateName?: string }>('webview/getProjectType');
}
