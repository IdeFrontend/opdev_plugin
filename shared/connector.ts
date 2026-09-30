/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * 通信频道
 * @value request 数据请求
 * @value viewQuery 页面参数
 * @value viewServerApi 页面服务端 - api方法
 * @value viewServerRef 页面服务端 - 响应式对象
 */
export type ConnectChannel = '__connector__' | 'request' | 'viewQuery' | 'stTestResults';

export type ConnectMessage = {
  channel: ConnectChannel;
  data: unknown;
};

/** 通信双向ready消息频道 */
export const CONNECTOR_READY_CHANNEL: ConnectChannel = '__connector__';
