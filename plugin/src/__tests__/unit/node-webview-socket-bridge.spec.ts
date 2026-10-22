/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
type MockSocket = {
  readyState: number;
  on: jest.Mock;
  send: jest.Mock;
  close: jest.Mock;
  fire: (event: string, ...args: unknown[])=> void;
};

const mockSocketInstances: MockSocket[] = [];
let mockLatestSocket: MockSocket;

jest.mock('ws', () => {
  const MockWebSocket = jest.fn()
    .mockImplementation(() => {
      const handlers: Record<string, (...args: any[])=> void> = {};
      const instance: MockSocket = {
        readyState: 0,
        on: jest.fn((event: string, callback: (...args: any[])=> void) => {
          handlers[event] = callback;
        }),
        send: jest.fn(),
        close: jest.fn(),
        fire: (event: string, ...args: unknown[]) => {
          handlers[event]?.(...args);
        },
      };

      mockLatestSocket = instance;
      mockSocketInstances.push(instance);

      return instance;
    });

  (MockWebSocket as unknown as { OPEN: number }).OPEN = 1;

  return { WebSocket: MockWebSocket };
});

import { WebSocket } from 'ws';
import { NodeWebviewSocketBridge } from '@plugin/class/node-webview-socket-bridge';

function createWebview(): {
  webview: { postMessage: jest.Mock;
    onDidReceiveMessage: jest.Mock };
  fire: (message: unknown)=> void;
  subscriptionDispose: jest.Mock;
} {
  let receiver: ((message: unknown)=> void) | undefined;
  const subscriptionDispose = jest.fn();

  const webview = {
    postMessage: jest.fn(),
    onDidReceiveMessage: jest.fn((callback: (message: unknown)=> void) => {
      receiver = callback;

      return { dispose: subscriptionDispose };
    }),
  };

  return {
    webview,
    fire: (message: unknown) => receiver?.(message),
    subscriptionDispose,
  };
}

function createBridge(): {
  bridge: NodeWebviewSocketBridge;
  webview: { postMessage: jest.Mock;
    onDidReceiveMessage: jest.Mock };
  fire: (message: unknown)=> void;
  subscriptionDispose: jest.Mock;
} {
  const created = createWebview();

  return {
    ...created,
    bridge: new NodeWebviewSocketBridge(created.webview as never),
  };
}

describe('NodeWebviewSocketBridge', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockSocketInstances.length = 0;
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('lifecycle', () => {
    it('subscribes to webview messages on construction', () => {
      const { webview } = createWebview();

      new NodeWebviewSocketBridge(webview as never);

      expect(webview.onDidReceiveMessage)
        .toHaveBeenCalledTimes(1);
    });

    it('disposes the subscription and closes open sockets', () => {
      const {
        webview,
        fire,
        subscriptionDispose,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      const socket = mockLatestSocket;

      bridge.dispose();

      expect(subscriptionDispose)
        .toHaveBeenCalledTimes(1);
      expect(socket.close)
        .toHaveBeenCalledTimes(1);
    });

    it('is idempotent when disposed twice', () => {
      const {
        webview,
        fire,
        subscriptionDispose,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      const socket = mockLatestSocket;

      bridge.dispose();
      bridge.dispose();

      expect(subscriptionDispose)
        .toHaveBeenCalledTimes(1);
      expect(socket.close)
        .toHaveBeenCalledTimes(1);
    });

    it('ignores messages after disposal', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      bridge.dispose();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });

      expect(webview.postMessage)
        .not.toHaveBeenCalled();
    });

    it('ignores socket close failures during dispose', () => {
      const {
        bridge, fire,
      } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.close.mockImplementation(() => {
        throw new Error('close failed');
      });

      expect(() => bridge.dispose())
        .not.toThrow();
    });
  });

  describe('message validation', () => {
    it('ignores messages without an id or type', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire(undefined);
      fire(null);
      fire({});
      fire({ type: 'ws:open' });
      fire({ id: '1' });

      expect(WebSocket)
        .not.toHaveBeenCalled();
      expect(webview.postMessage)
        .not.toHaveBeenCalled();
    });
  });

  describe('ws:open', () => {
    it('opens a socket and reports the opened event', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
        protocols: ['chat'],
      });

      expect(WebSocket)
        .toHaveBeenCalledWith('ws://host', ['chat']);
      expect(mockSocketInstances)
        .toHaveLength(1);
      expect(mockLatestSocket.on)
        .toHaveBeenCalledWith('open', expect.any(Function));

      mockLatestSocket.fire('open');

      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:opened',
          id: '1',
        });
    });

    it('reports an error when the url is missing', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
      });

      expect(WebSocket)
        .not.toHaveBeenCalled();
      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:error',
          id: '1',
          reason: 'WebSocket URL is required',
        });
    });

    it('closes a previous socket when the same id is reopened', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://a',
      });
      const firstSocket = mockLatestSocket;

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://b',
      });

      expect(firstSocket.close)
        .toHaveBeenCalledTimes(1);
      expect(WebSocket)
        .toHaveBeenCalledTimes(2);
    });

    it('reports an error when the socket constructor throws', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      (WebSocket as unknown as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('connect refused');
        });

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });

      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:error',
          id: '1',
          reason: 'Failed to create WebSocket: connect refused',
        });
    });

    it('falls back to String when the constructor throws a non-Error', () => {
      const {
        webview, fire,
      } = createWebview();

      new NodeWebviewSocketBridge(webview as never);

      (WebSocket as unknown as jest.Mock)
        .mockImplementationOnce(() => {
          throw 'boom';
        });

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });

      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:error',
          id: '1',
          reason: 'Failed to create WebSocket: boom',
        });
    });

    it.each([
      [
        'string payload',
        'hello',
        'hello',
      ],
      [
        'buffer payload',
        Buffer.from('hi'),
        'hi',
      ],
      [
        'buffer array payload',
        [
          Buffer.from('a'),
          Buffer.from('b'),
        ],
        'ab',
      ],
      [
        'array buffer payload',
        new Uint8Array([
          104,
          105,
          106,
        ]).buffer,
        'hij',
      ],
      [
        'arraybuffer view payload',
        new DataView(new Uint8Array([
          65,
          66,
        ]).buffer),
        'AB',
      ],
      [
        'typed array view payload',
        new Uint8Array([
          120,
          121,
          122,
        ]),
        'xyz',
      ],
      [
        'non-string payload',
        42,
        42,
      ],
    ])('forwards a %s as a ws:message', (_name, payload, expected) => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('message', payload);

      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:message',
          id: '1',
          payload: expected,
        });
    });

    it('extracts the api name from a result payload', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('message', { result: { method: 'getX' } });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: getX'));
      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:message',
          id: '1',
          payload: { result: { method: 'getX' } },
        });
    });

    it('extracts the api name from a JSON string result payload', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('message', '{"result":{"method":"getX"}}');

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: getX'));
    });

    it('truncates long message payloads in the log', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('message', 'x'.repeat(300));

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('...'));
      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:message',
          id: '1',
          payload: 'x'.repeat(300),
        });
    });

    it('forwards socket errors to the webview', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('error', new Error('socket exploded'));

      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:error',
          id: '1',
          reason: 'socket exploded',
        });
    });

    it('falls back to String when the error has no message', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('error', 'plain string');

      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:error',
          id: '1',
          reason: 'plain string',
        });
    });

    it('forwards the close event and removes the socket from the registry', () => {
      const {
        webview, fire,
      } = createWebview();
      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('close', 1000, 'gone');

      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:closed',
          id: '1',
          code: 1000,
          reason: 'gone',
        });

      fire({
        type: 'ws:send',
        id: '1',
        payload: 'x',
      });

      expect(warnSpy)
        .toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });

    it('forwards a close event without a reason', () => {
      const {
        webview, fire,
      } = createWebview();

      new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('close', 1000);

      expect(webview.postMessage)
        .toHaveBeenCalledWith(expect.objectContaining({
          type: 'ws:closed',
          id: '1',
          code: 1000,
        }));
    });

    it('falls back to unknown when a message payload cannot be parsed', () => {
      const {
        webview, fire,
      } = createWebview();

      new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('message', 'not-json{');

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: unknown'));
      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:message',
          id: '1',
          payload: 'not-json{',
        });
    });

    it.each([
      [
        'method',
        '{"method":"getMethod"}',
        'getMethod',
      ],
      [
        'api',
        '{"api":"getApi"}',
        'getApi',
      ],
      [
        'action',
        '{"action":"runAction"}',
        'runAction',
      ],
      [
        'type',
        '{"type":"getType"}',
        'getType',
      ],
      [
        'none',
        '{}',
        'unknown',
      ],
    ])('extracts the api name from the %s key of a JSON string message payload', (_key, payload, expected) => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('message', payload);

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining(`API: ${expected}`));
    });

    it.each([
      [
        'method',
        { method: 'getMethod' },
        'getMethod',
      ],
      [
        'api',
        { api: 'getApi' },
        'getApi',
      ],
      [
        'action',
        { action: 'runAction' },
        'runAction',
      ],
      [
        'type',
        { type: 'getType' },
        'getType',
      ],
      [
        'none',
        {},
        'unknown',
      ],
    ])('extracts the api name from the %s key of an object message payload', (_key, payload, expected) => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('message', payload);

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining(`API: ${expected}`));
    });

    it('handles a null message payload', () => {
      const {
        webview, fire,
      } = createWebview();

      new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.fire('message', null);

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: unknown'));
      expect(webview.postMessage)
        .toHaveBeenCalledWith({
          type: 'ws:message',
          id: '1',
          payload: null,
        });
    });
  });

  describe('ws:send', () => {
    it('warns when the socket is missing', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:send',
        id: '1',
        payload: 'x',
      });

      expect(warnSpy)
        .toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });

    it('warns when the socket is not open', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 0;

      fire({
        type: 'ws:send',
        id: '1',
        payload: 'x',
      });

      expect(warnSpy)
        .toHaveBeenCalledWith(expect.stringContaining('is not open'));
      expect(mockLatestSocket.send)
        .not.toHaveBeenCalled();
    });

    it('forwards the payload to an open socket', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      fire({
        type: 'ws:send',
        id: '1',
        payload: '{"method":"getInfo"}',
      });

      expect(mockLatestSocket.send)
        .toHaveBeenCalledWith('{"method":"getInfo"}');
      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: getInfo'));
    });

    it('logs the api name extracted from an object payload', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      fire({
        type: 'ws:send',
        id: '1',
        payload: { action: 'runTask' },
      });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: runTask'));
    });

    it('logs the api name extracted from api and type payload keys', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      fire({
        type: 'ws:send',
        id: '1',
        payload: { api: 'getApi' },
      });
      fire({
        type: 'ws:send',
        id: '1',
        payload: { type: 'getType' },
      });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: getApi'));
      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: getType'));
    });

    it('falls back to unknown for unparseable payloads', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      fire({
        type: 'ws:send',
        id: '1',
        payload: 'not-json{',
      });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: unknown'));
    });

    it('truncates long payloads in the log but sends the full payload', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      const payload = JSON.stringify({
        method: 'big',
        data: 'x'.repeat(500),
      });

      fire({
        type: 'ws:send',
        id: '1',
        payload,
      });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('...'));
      expect(mockLatestSocket.send)
        .toHaveBeenCalledWith(payload);
    });

    it.each([
      [
        'api',
        '{"api":"getApi"}',
        'getApi',
      ],
      [
        'action',
        '{"action":"runAction"}',
        'runAction',
      ],
      [
        'type',
        '{"type":"getType"}',
        'getType',
      ],
    ])('logs the api name from the %s key of a JSON string send payload', (_key, payload, expected) => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      fire({
        type: 'ws:send',
        id: '1',
        payload,
      });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining(`API: ${expected}`));
    });

    it('falls back to unknown when a send payload parses to no keys', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      fire({
        type: 'ws:send',
        id: '1',
        payload: '{}',
      });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: unknown'));
      expect(mockLatestSocket.send)
        .toHaveBeenCalledWith('{}');
    });

    it('falls back to unknown when a send payload object has no api keys', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      fire({
        type: 'ws:send',
        id: '1',
        payload: {},
      });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: unknown'));
    });

    it('sends without a payload', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.readyState = 1;

      fire({
        type: 'ws:send',
        id: '1',
      });

      expect(logSpy)
        .toHaveBeenCalledWith(expect.stringContaining('API: unknown'));
      expect(mockLatestSocket.send)
        .toHaveBeenCalledWith(undefined);
    });
  });

  describe('ws:close', () => {
    it('closes the socket with code and reason', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      const socket = mockLatestSocket;

      fire({
        type: 'ws:close',
        id: '1',
        payload: {
          code: 1001,
          reason: 'bye',
        },
      });

      expect(socket.close)
        .toHaveBeenCalledWith(1001, 'bye');
    });

    it('ignores close for an unknown id', () => {
      const { fire } = createBridge();

      expect(() => fire({
        type: 'ws:close',
        id: 'nope',
      }))
        .not.toThrow();
    });

    it('ignores socket close errors', () => {
      const { fire } = createBridge();

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });
      mockLatestSocket.close.mockImplementation(() => {
        throw new Error('close failed');
      });

      expect(() => fire({
        type: 'ws:close',
        id: '1',
      }))
        .not.toThrow();
    });
  });

  describe('postToView', () => {
    it('swallows postMessage failures', () => {
      const {
        webview, fire,
      } = createWebview();

      webview.postMessage.mockImplementation(() => {
        throw new Error('webview gone');
      });

      const bridge = new NodeWebviewSocketBridge(webview as never);

      fire({
        type: 'ws:open',
        id: '1',
        url: 'ws://host',
      });

      expect(() => mockLatestSocket.fire('open'))
        .not.toThrow();
    });
  });
});
