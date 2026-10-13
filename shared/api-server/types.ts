/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export interface RequestOptions {
  /** 超时时间(单位:ms) */
  timeout?: number;

  /**
   * 使用自定义异常处理
   * - true 屏蔽全局异常处理(弹窗提示),异常时执行 Promise.reject
   * - false(默认) 使用全局异常处理,不执行 Promise.reject
   */
  useCustomErrorHandler?: boolean;
}

export interface RequestMessage {
  api: string;
  requestId: string;
  data: unknown;
  options: Required<RequestOptions>;
}

export interface ResponseMessage {
  api: string;
  requestId: string;
  statusCode: 200 | 404 | 500 | null;
  message: string;
  isStream?: boolean;
  data?: unknown;
  error?: { name: string;
    message: string;
    stack: string };
}

type Api = (params: unknown)=> unknown;

export type ApiGroup = {
  [key: string]: ApiGroup | Api;
};
