/**
 * Unit tests for ApiServer: api-path resolution, success / not-found /
 * server-error response envelopes, custom error handler suppression,
 * ReadableStream response streaming (global constructor, stream/web fallback,
 * and no-constructor paths), and webview registry delegation.
 *
 * The WebviewConnector is faked so every request is driven deterministically
 * without a real webview; the connector itself is covered by
 * webview-connector.spec.ts.
 */

import type { RequestMessage } from '@plugin/core/api-server';

jest.mock('i18next', () => ({
  t: (key: string, options?: { apiName?: string }) =>
    options?.apiName ? `${key}:${options.apiName}` : key,
}));

jest.mock('vscode', () => {
  class Disposable {
    private disposeCallback?: ()=> void;

    constructor(disposeCallback?: ()=> void) {
      this.disposeCallback = disposeCallback;
    }

    dispose(): void {
      this.disposeCallback?.();
    }
  }

  return {
    Disposable,
    window: { showErrorMessage: jest.fn() },
  };
});

type ReceiveCallback = (message: unknown, webview: unknown)=> void | Promise<void>;

interface ConnectorHarness {
  receive: jest.Mock;
  send: jest.Mock;
  addWebview: jest.Mock;
  removeWebview: jest.Mock;
  fireRequest: (message: unknown, webview: unknown)=> void | Promise<void>;
}

jest.mock('@plugin/core/connector', () => {
  class FakeConnector {
    receiveCallback?: ReceiveCallback;

    receive = jest.fn((callback: ReceiveCallback) => {
      this.receiveCallback = callback;
    });

    send = jest.fn();
    addWebview = jest.fn();
    removeWebview = jest.fn();

    fireRequest(message: unknown, webview: unknown): void | Promise<void> {
      return this.receiveCallback?.(message, webview);
    }
  }

  return { WebviewConnector: FakeConnector };
});

import * as vscode from 'vscode';
import { ReadableStream as NodeWebStream } from 'node:stream/web';

import { ApiServer } from '@plugin/core/api-server';

const globalReadableStreamBackup = (globalThis as { ReadableStream?: unknown }).ReadableStream;

const waitFor = async (predicate: ()=> boolean): Promise<void> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('Timed out waiting for asynchronous test state');
};

const request = (api: string, overrides: Partial<RequestMessage> = {}): RequestMessage => ({
  api,
  requestId: 'req-1',
  data: undefined,
  options: {
    timeout: 0,
    useCustomErrorHandler: false,
  },
  ...overrides,
});

const getConnector = (apiServer: ApiServer): ConnectorHarness =>
  (apiServer as unknown as { connector: ConnectorHarness }).connector;

describe('ApiServer', () => {
  const showErrorMessageMock = vscode.window.showErrorMessage as jest.Mock;
  const webview = {} as vscode.Webview;

  beforeEach(() => {
    showErrorMessageMock.mockReset();
  });

  afterEach(() => {
    (globalThis as { ReadableStream?: unknown }).ReadableStream = globalReadableStreamBackup;
  });

  it('resolves a nested api path and replies with a 200 envelope', async () => {
    const apiServer = new ApiServer({ webview: { data: { getDump: (params: unknown) => ({ received: params }) } } });
    const connector = getConnector(apiServer);

    await connector.fireRequest({
      ...request('webview/data/getDump'),
      data: { id: 7 },
    }, webview);

    expect(connector.send)
      .toHaveBeenCalledTimes(1);
    expect(connector.send)
      .toHaveBeenCalledWith(webview, {
        api: 'webview/data/getDump',
        requestId: 'req-1',
        statusCode: 200,
        message: 'core.message.apiResponseSuccess',
        data: { received: { id: 7 } },
      });
    expect(showErrorMessageMock)
      .not
      .toHaveBeenCalled();
  });

  it('passes primitive and falsy results through as the response data', async () => {
    const apiServer = new ApiServer({
      webview: {
        ping: () => 'pong',
        nothing: () => null,
      },
    });
    const connector = getConnector(apiServer);

    await connector.fireRequest(request('webview/ping'), webview);
    await connector.fireRequest(request('webview/nothing'), webview);

    expect(connector.send)
      .toHaveBeenNthCalledWith(1, webview, expect.objectContaining({
        statusCode: 200,
        data: 'pong',
      }));
    expect(connector.send)
      .toHaveBeenNthCalledWith(2, webview, expect.objectContaining({
        statusCode: 200,
        data: null,
      }));
  });

  it('replies 404 and notifies the user for an unknown api path', async () => {
    const apiServer = new ApiServer({ webview: { ping: () => 'pong' } });
    const connector = getConnector(apiServer);

    await connector.fireRequest(request('webview/missing'), webview);

    expect(connector.send)
      .toHaveBeenCalledWith(webview, {
        api: 'webview/missing',
        requestId: 'req-1',
        statusCode: 404,
        message: 'core.message.apiResponseNotFound:webview/missing',
      });
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('core.message.apiResponseNotFound:webview/missing');
  });

  it('replies 404 when the resolved path is not a function', async () => {
    const apiServer = new ApiServer({ webview: { options: { a: 1 } } });
    const connector = getConnector(apiServer);

    await connector.fireRequest(request('webview/options'), webview);

    expect(connector.send)
      .toHaveBeenCalledWith(webview, expect.objectContaining({ statusCode: 404 }));
    expect(showErrorMessageMock)
      .toHaveBeenCalled();
  });

  it('replies 500 with a sendable error object and rethrows the api error', async () => {
    const apiServer = new ApiServer({
      webview: {
        crash: () => {
          throw new Error('boom');
        },
      },
    });
    const connector = getConnector(apiServer);

    await expect(connector.fireRequest(request('webview/crash'), webview))
      .rejects
      .toThrow('boom');

    expect(connector.send)
      .toHaveBeenCalledWith(webview, {
        api: 'webview/crash',
        requestId: 'req-1',
        statusCode: 500,
        message: 'core.message.apiResponseServerError:webview/crash',
        error: {
          name: 'Error',
          message: 'boom',
          stack: expect.stringContaining('Error: boom'),
        },
      });
    expect(showErrorMessageMock)
      .toHaveBeenCalledWith('core.message.apiResponseServerError:webview/crash: \nboom');
  });

  it('serializes a non-Error rejection into a CustomError envelope', async () => {
    const apiServer = new ApiServer({
      webview: {
        crash: () => {
          throw 'string-explosion';
        },
      },
    });
    const connector = getConnector(apiServer);

    await expect(connector.fireRequest(request('webview/crash'), webview))
      .rejects
      .toBe('string-explosion');

    expect(connector.send)
      .toHaveBeenCalledWith(webview, expect.objectContaining({
        statusCode: 500,
        error: {
          name: 'CustomError',
          message: 'string-explosion',
          stack: '',
        },
      }));
  });

  it('skips the error dialog when useCustomErrorHandler is set', async () => {
    const apiServer = new ApiServer({
      webview: {
        crash: () => {
          throw new Error('handled elsewhere');
        },
      },
    });
    const connector = getConnector(apiServer);

    await expect(connector.fireRequest(
      request('webview/crash', {
        options: {
          timeout: 0,
          useCustomErrorHandler: true,
        },
      }),
      webview,
    ))
      .rejects
      .toThrow('handled elsewhere');

    expect(connector.send)
      .toHaveBeenCalledWith(webview, expect.objectContaining({ statusCode: 500 }));
    expect(showErrorMessageMock)
      .not
      .toHaveBeenCalled();
  });

  it('streams a ReadableStream response chunk by chunk', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('chunk-1');
        controller.enqueue('chunk-2');
        controller.close();
      },
    });
    const apiServer = new ApiServer({ webview: { streamDemo: () => stream } });
    const connector = getConnector(apiServer);

    void connector.fireRequest(request('webview/streamDemo'), webview);
    await waitFor(() => connector.send.mock.calls.length === 3);

    expect(connector.send.mock.calls.map((call) => call[1]))
      .toEqual([
        {
          api: 'webview/streamDemo',
          requestId: 'req-1',
          statusCode: 200,
          message: 'core.message.apiResponseSuccess',
          isStream: true,
          data: {
            done: false,
            value: 'chunk-1',
          },
        },
        {
          api: 'webview/streamDemo',
          requestId: 'req-1',
          statusCode: 200,
          message: 'core.message.apiResponseSuccess',
          isStream: true,
          data: {
            done: false,
            value: 'chunk-2',
          },
        },
        {
          api: 'webview/streamDemo',
          requestId: 'req-1',
          statusCode: 200,
          message: 'core.message.apiResponseSuccess',
          isStream: true,
          data: {
            done: true,
            value: undefined,
          },
        },
      ]);
  });

  it('falls back to the stream/web constructor when the global is missing', async () => {
    const fallbackStream = new NodeWebStream<string>({
      start(controller) {
        controller.enqueue('fallback-chunk');
        controller.close();
      },
    });

    (globalThis as { ReadableStream?: unknown }).ReadableStream = undefined;
    const apiServer = new ApiServer({ webview: { streamDemo: () => fallbackStream } });
    const connector = getConnector(apiServer);

    void connector.fireRequest(request('webview/streamDemo'), webview);
    await waitFor(() => connector.send.mock.calls.length === 2);

    expect(connector.send.mock.calls.map((call) => call[1]))
      .toEqual([
        expect.objectContaining({
          isStream: true,
          statusCode: 200,
          data: {
            done: false,
            value: 'fallback-chunk',
          },
        }),
        expect.objectContaining({
          isStream: true,
          statusCode: 200,
          data: { done: true },
        }),
      ]);
  });

  it('treats stream data as a plain response when no ReadableStream constructor is available', async () => {
    const fallbackStream = new NodeWebStream<string>({
      start(controller) {
        controller.enqueue('x');
        controller.close();
      },
    });

    (globalThis as { ReadableStream?: unknown }).ReadableStream = undefined;

    try {
      jest.resetModules();
      jest.doMock('stream/web', () => {
        throw new Error('stream/web unavailable');
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolated module instance to force the no-ctor branch
      const { ApiServer: FreshApiServer } = require('@plugin/core/api-server') as typeof import('@plugin/core/api-server');
      const freshServer = new FreshApiServer({ webview: { streamDemo: () => fallbackStream } });
      const freshConnector = getConnector(freshServer);

      await freshConnector.fireRequest(request('webview/streamDemo'), webview);

      expect(freshConnector.send)
        .toHaveBeenCalledWith(webview, expect.objectContaining({
          statusCode: 200,
          data: fallbackStream,
        }));
      expect(freshConnector.send.mock.calls[0][1])
        .not
        .toHaveProperty('isStream');
    }
    finally {
      (globalThis as { ReadableStream?: unknown }).ReadableStream = globalReadableStreamBackup;
      jest.dontMock('stream/web');
      jest.resetModules();
    }
  });

  it('delegates webview registration to the connector', () => {
    const apiServer = new ApiServer({ webview: { ping: () => 'pong' } });
    const connector = getConnector(apiServer);
    const fakeWebview = {} as vscode.Webview;

    apiServer.addWebview('key-1', fakeWebview);
    expect(connector.addWebview)
      .toHaveBeenCalledWith(fakeWebview);

    apiServer.removeWebview('key-1');
    expect(connector.removeWebview)
      .toHaveBeenCalledWith(fakeWebview);

    apiServer.removeWebview('missing-key');
    expect(connector.removeWebview)
      .toHaveBeenCalledTimes(1);
  });
});
