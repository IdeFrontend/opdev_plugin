/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type * as vscode from 'vscode';

import { WebviewConnector } from '@plugin/core/connector';
import { CONNECTOR_READY_CHANNEL } from '@shared/connector';

type MessageReceiver = (message: unknown)=> void;

type FakeWebview = {
  postMessage: jest.Mock;
  onDidReceiveMessage: jest.Mock;
  fire: (message: unknown)=> void;
  disposed: jest.Mock;
};

function createWebview(): FakeWebview {
  let receiver: MessageReceiver | undefined;
  const disposed = jest.fn();

  return {
    postMessage: jest.fn(async () => true),
    onDidReceiveMessage: jest.fn((callback: MessageReceiver) => {
      receiver = callback;

      return { dispose: disposed };
    }),
    fire: (message: unknown) => receiver?.(message),
    disposed,
  };
}

function asWebview(webview: FakeWebview): vscode.Webview {
  return webview as unknown as vscode.Webview;
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('WebviewConnector', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('ignores null, primitive, and malformed inbound envelopes', () => {
    const connector = new WebviewConnector<unknown, string>('stTestResults');
    const webview = createWebview();
    const listener = jest.fn();

    connector.receive(listener);
    connector.addWebview(asWebview(webview));

    [
      null,
      undefined,
      1,
      'message',
      {},
      { channel: 'stTestResults' },
      {
        channel: 7,
        data: 'bad',
      },
    ].forEach((message) => webview.fire(message));

    expect(listener).not.toHaveBeenCalled();
    expect(webview.postMessage).not.toHaveBeenCalled();

    webview.fire({
      channel: 'stTestResults',
      data: 'valid',
    });

    expect(listener)
      .toHaveBeenCalledWith('valid', asWebview(webview));
  });

  it('replays the latest payload on every matching ready signal and clears it on removal', () => {
    const connector = new WebviewConnector<string>('stTestResults');
    const webview = createWebview();
    const readyMessage = {
      channel: CONNECTOR_READY_CHANNEL,
      data: 'stTestResults',
    };

    connector.addWebview(asWebview(webview));
    connector.sendLatest(asWebview(webview), 'latest');

    webview.fire(readyMessage);
    webview.fire(readyMessage);

    expect(webview.postMessage)
      .toHaveBeenCalledTimes(2);
    expect(webview.postMessage)
      .toHaveBeenNthCalledWith(1, {
        channel: 'stTestResults',
        data: 'latest',
      });
    expect(webview.postMessage)
      .toHaveBeenNthCalledWith(2, {
        channel: 'stTestResults',
        data: 'latest',
      });

    connector.removeWebview(asWebview(webview));

    expect(webview.disposed)
      .toHaveBeenCalledTimes(1);

    connector.addWebview(asWebview(webview));
    webview.fire(readyMessage);

    expect(webview.postMessage)
      .toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'false',
      false,
    ],
    [
      'rejection',
      new Error('webview was disposed'),
    ],
  ])('retains the latest payload after postMessage %s and replays it on the next ready', async (_case, failure) => {
    const connector = new WebviewConnector<string>('stTestResults');
    const webview = createWebview();
    const readyMessage = {
      channel: CONNECTOR_READY_CHANNEL,
      data: 'stTestResults',
    };

    if (failure instanceof Error) {
      webview.postMessage.mockRejectedValueOnce(failure);
    }
    else {
      webview.postMessage.mockResolvedValueOnce(failure);
    }

    connector.addWebview(asWebview(webview));
    webview.fire(readyMessage);
    connector.sendLatest(asWebview(webview), 'latest');
    await flushPromises();

    expect(warnSpy)
      .toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0]))
      .toContain('retained for the next ready signal');

    webview.fire(readyMessage);
    await flushPromises();

    expect(webview.postMessage)
      .toHaveBeenCalledTimes(2);
    expect(webview.postMessage)
      .toHaveBeenLastCalledWith({
        channel: 'stTestResults',
        data: 'latest',
      });
  });
});
