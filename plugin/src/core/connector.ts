/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type {
  Webview, Disposable,
} from 'vscode';

import type {
  ConnectChannel,
  ConnectMessage,
} from '@shared/connector';
import { CONNECTOR_READY_CHANNEL } from '@shared/connector';

export type {
  ConnectChannel, ConnectMessage,
};

export { CONNECTOR_READY_CHANNEL };

type ExtensionListener<T> = (message: T, webview: Webview)=> void;

/**
 * Multi-webview communicator (used on the extension side)
 */
export class WebviewConnector<T = unknown, R = T> {
  /**
   * Is the webview communicator activated?
   */
  private webviewReady: WeakMap<Webview, boolean> = new WeakMap();

  /**
   * Messages temporarily stored before activation of the webview communicator
   */
  private pendingDataList: WeakMap<Webview, T[]> = new WeakMap();

  /** Latest replace-style payload, retained so a reloaded webview can request it again. */
  private latestData: WeakMap<Webview, T> = new WeakMap();

  private messageReceivers: WeakMap<Webview, Disposable> = new WeakMap();

  private listeners: ExtensionListener<R>[] = [];

  constructor(private channel: ConnectChannel) {}

  public send(webview: Webview, data: T): void {
    const isReady = this.webviewReady.get(webview);

    if (isReady) {
      this.postData(webview, data, false);
    }
    else {
      this.pendingDataList.get(webview)
        ?.push(data);
    }
  }

  public sendLatest(webview: Webview, data: T): void {
    this.latestData.set(webview, data);
    const isReady = this.webviewReady.get(webview);

    if (isReady) {
      this.postData(webview, data, true);
    }
  }

  public receive(callback: ExtensionListener<R>): void {
    this.listeners.push(callback);
  }

  public addWebview(webview: Webview): void {
    const receiver = webview.onDidReceiveMessage((res: unknown) => {
      if (!isConnectMessage(res)) {
        return;
      }

      // Client initialization
      if (isWebviewReadyMessage(res, this.channel)) {
        this.startConnector(webview);

        return;
      }

      if (res.channel !== this.channel) {
        return;
      }

      this.listeners.forEach((callback) => {
        callback(res.data as R, webview);
      });
    });

    this.pendingDataList.set(webview, []);
    this.messageReceivers.set(webview, receiver);
  }

  public removeWebview(webview: Webview): void {
    this.webviewReady.delete(webview);
    this.pendingDataList.delete(webview);
    this.latestData.delete(webview);
    this.messageReceivers.get(webview)
      ?.dispose();
    this.messageReceivers.delete(webview);
  }

  private startConnector(webview: Webview): void {
    this.webviewReady.set(webview, true);
    const pendingData = this.pendingDataList.get(webview);

    pendingData?.forEach((data) => {
      this.postData(webview, data, false);
    });
    pendingData?.splice(0);

    if (this.latestData.has(webview)) {
      this.postData(webview, this.latestData.get(webview)!, true);
    }
  }

  private postData(webview: Webview, data: T, retainedLatest: boolean): void {
    let delivery: Thenable<boolean>;

    try {
      delivery = webview.postMessage({
        channel: this.channel,
        data,
      });
    }
    catch (error) {
      this.logDeliveryFailure(retainedLatest, error);

      return;
    }

    void Promise.resolve(delivery)
      .then((delivered) => {
        if (!delivered) {
          this.logDeliveryFailure(retainedLatest);
        }
      })
      .catch((error: unknown) => {
        this.logDeliveryFailure(retainedLatest, error);
      });
  }

  private logDeliveryFailure(retainedLatest: boolean, error?: unknown): void {
    const retryNote = retainedLatest
      ? ' The latest payload is retained for the next ready signal.'
      : '';

    if (error === undefined) {
      console.warn(`[WebviewConnector:${this.channel}] postMessage returned false.${retryNote}`);

      return;
    }

    console.warn(
      `[WebviewConnector:${this.channel}] postMessage failed.${retryNote}`,
      error,
    );
  }
}

function isConnectMessage(message: unknown): message is ConnectMessage {
  if (message === null || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Record<string, unknown>;

  return typeof candidate.channel === 'string'
    && Object.prototype.hasOwnProperty.call(candidate, 'data');
}

function isWebviewReadyMessage(
  message: unknown,
  channel: ConnectChannel,
): boolean {
  return isConnectMessage(message)
    && message.channel === CONNECTOR_READY_CHANNEL
    && message.data === channel;
}
