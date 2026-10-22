/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type { ConnectChannel } from '@shared/connector';
import { CONNECTOR_READY_CHANNEL } from '@shared/connector';

import { vscode } from '@/utils/vscode';

type WebviewListener<T> = (message: T)=> void;

/**
 * extension通信器（webview端使用）
 */
export function useConnector<T = unknown, R = T>(channel: ConnectChannel) {
  // console.log(`[use-connector] useConnector: 创建connector, channel=${channel}`);
  const listeners: WebviewListener<R>[] = [];

  window.addEventListener('message', (event) => {
    const res = event.data;

    // console.log(`[use-connector] useConnector: 收到window消息, channel=${res.channel}, 期望channel=${channel}`);

    if (res.channel !== channel) {
      // console.log('[use-connector] useConnector: 频道不匹配, 忽略消息');

      return;
    }

    // console.log(
    //   '[use-connector] useConnector: 频道匹配, 触发listeners, 数量:',
    //   listeners.length,
    // );
    listeners.forEach((callback) => {
      callback(res.data);
    });
  });

  // console.log(`[use-connector] useConnector: 发送ready消息, channel=${channel}`);
  vscode.postMessage({
    channel: CONNECTOR_READY_CHANNEL,
    data: channel,
  });
  // console.log('[use-connector] useConnector: ready消息已发送');

  function send(message: T): void {
    // console.log(
    //   `[use-connector] send: 发送消息, channel=${channel}, data:`,
    //   JSON.stringify(message),
    // );
    vscode.postMessage({
      channel: channel,
      data: message,
    });
  }

  function receive(callback: WebviewListener<R>): void {
    // console.log(`[use-connector] receive: 注册listener, channel=${channel}`);
    listeners.push(callback);
  }

  return {
    send,
    receive,
  };
}
