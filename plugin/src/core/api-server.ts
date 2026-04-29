import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import type {
  RequestOptions,
  RequestMessage,
  ResponseMessage,
} from '@shared/api-server';
import { WebviewConnector } from './connector';

// E2E Mock imports - lazy loaded to avoid circular dependency issues
let e2eMockApis: any = null;
let _e2eMockModeCache: boolean | null = null;

function isE2EMockMode(): boolean {
  if (_e2eMockModeCache !== null) {
    return _e2eMockModeCache;
  }

  // Check environment variable first
  if (process.env.E2E_MOCK === 'true') {
    _e2eMockModeCache = true;

    return true;
  }

  // Check for marker file
  try {
    let currentDir = __dirname;

    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(currentDir, '.e2e-mock'))) {
        _e2eMockModeCache = true;

        return true;
      }

      currentDir = path.dirname(currentDir);
    }
  }
  catch {
    // Ignore
  }

  _e2eMockModeCache = false;

  return false;
}

function loadE2EMockApis(): any {
  if (!e2eMockApis) {
    try {
      // Dynamic require to avoid issues during normal operation
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mockModule = require('../mock-apis');

      e2eMockApis = mockModule.mockApis;
    }
    catch (e) {
      console.warn('[ApiServer] Failed to load E2E mock APIs:', e);

      return null;
    }
  }

  return e2eMockApis;
}

export type {
  RequestOptions, RequestMessage, ResponseMessage,
};

type Api = (params: unknown)=> unknown;

export type ApiGroup = {
  [key: string]: ApiGroup | Api;
};

/**
 * Interface service, monitor webview side requests
 */
export class ApiServer extends vscode.Disposable {
  // Singleton pattern
  private static instance: ApiServer;
  private linkedWebviews = new Map<string, vscode.Webview>();
  private connector: WebviewConnector<ResponseMessage, RequestMessage>;
  /**
   * In some environments (e.g. Node 16 in VSCode remote), `globalThis.ReadableStream` may be undefined.
   * `stream/web` still provides the constructor we need for `instanceof` checks.
   */
  private getReadableStreamCtor(): typeof ReadableStream | undefined {
    const globalReadableStream = (globalThis as unknown as { ReadableStream?: typeof ReadableStream }).ReadableStream;
    if (globalReadableStream) {
      return globalReadableStream;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('stream/web').ReadableStream;
    }
    catch {
      return undefined;
    }
  }

  /**
   * @param apis interface configuration
   */
  constructor(private apis: ApiGroup) {
    super(() => {});
    ApiServer.instance = this;
    this.connector = new WebviewConnector('request');
    this.initRequestConnector();
  }

  public addWebview(key: string, webview: vscode.Webview): void {
    this.linkedWebviews.set(key, webview);
    this.connector.addWebview(webview);
  }

  public removeWebview(key: string): void {
    const linkedWebview = this.linkedWebviews.get(key);

    if (linkedWebview) {
      this.connector.removeWebview(linkedWebview);
    }
  }

  private initRequestConnector(): void {
    this.connector.receive(async (requestMessage, webview) => {
      const {
        api: apiPath, data,
      } = requestMessage;
      const currentApi = this.getApi(apiPath);

      if (!currentApi) {
        this.resNotFoundError(webview, requestMessage);

        return;
      }

      try {
        const resData = await currentApi(data);

        const ReadableStreamCtor = this.getReadableStreamCtor();
        if (ReadableStreamCtor && resData instanceof ReadableStreamCtor) {
          this.resStream(webview, requestMessage, resData);
        }
        else {
          this.resSuccess(webview, requestMessage, resData);
        }
      }
      catch (e) {
        this.resServerError(webview, requestMessage, e as Error);
        throw e;
      }
    });
  }

  private getApi(apiPath: string): Api | undefined {
    const apiKeys = apiPath.split('/');

    // Check for E2E mock mode and use mock APIs if available
    if (isE2EMockMode()) {
      const mockApis = loadE2EMockApis();

      if (mockApis) {
        let apiOrGroup: ApiGroup | Api | undefined = mockApis;

        for (const apiKey of apiKeys) {
          apiOrGroup = (apiOrGroup as ApiGroup)[apiKey];

          if (!apiOrGroup) {
            break;
          }
        }

        if (apiOrGroup && apiOrGroup instanceof Function) {
          console.log(`[ApiServer] Using E2E mock for: ${apiPath}`);

          return apiOrGroup;
        }
      }
    }

    // Fall back to real APIs
    let apiOrGroup: ApiGroup | Api | undefined = this.apis;

    for (const apiKey of apiKeys) {
      apiOrGroup = (apiOrGroup as ApiGroup)[apiKey];

      if (!apiOrGroup) {
        return undefined;
      }
    }

    return apiOrGroup instanceof Function ? apiOrGroup : undefined;
  }

  /**
   * Traverse the data stream
   * @param webview
   * @param requestMessage
   * @param stream
   * @returns
   */
  private resStream(
    webview: vscode.Webview,
    requestMessage: RequestMessage,
    stream: ReadableStream,
  ): void {
    const reader = stream.getReader();
    const readByChunk = () => {
      reader.read()
        .then((chunk) => {
          this.connector.send(webview, {
            ...this.makeBasicResponse(requestMessage),
            statusCode: 200,
            message: t('core.message.apiResponseSuccess'),
            isStream: true,
            data: chunk,
          });

          if (!chunk.done) {
            readByChunk();
          }
        });
    };

    readByChunk();
  }

  private resSuccess(
    webview: vscode.Webview,
    requestMessage: RequestMessage,
    resData: unknown,
  ): void {
    this.connector.send(webview, {
      ...this.makeBasicResponse(requestMessage),
      statusCode: 200,
      message: t('core.message.apiResponseSuccess'),
      data: resData,
    });
  }

  private resNotFoundError(
    webview: vscode.Webview,
    requestMessage: RequestMessage,
  ): void {
    const errorMessage = t('core.message.apiResponseNotFound', { apiName: requestMessage.api });

    this.connector.send(webview, {
      ...this.makeBasicResponse(requestMessage),
      statusCode: 404,
      message: errorMessage,
    });

    vscode.window.showErrorMessage(errorMessage);
  }

  private resServerError(
    webview: vscode.Webview,
    requestMessage: RequestMessage,
    error: Error,
  ): void {
    const errorMessage = t('core.message.apiResponseServerError', { apiName: requestMessage.api });
    const errorObject = this.makeSendableError(error);

    this.connector.send(webview, {
      ...this.makeBasicResponse(requestMessage),
      statusCode: 500,
      message: errorMessage,
      error: errorObject,
    });

    if (!requestMessage.options.useCustomErrorHandler) {
      vscode.window.showErrorMessage(`${errorMessage}: \n${errorObject.message}`);
    }
  }

  private makeBasicResponse({
    api, requestId,
  }: RequestMessage) {
    return {
      api,
      requestId,
    };
  }

  /**
   * sendMessage cannot send an error object and converts it to a normal object
   * @param error
   * @returns
   */
  private makeSendableError(error: unknown): {
    name: string;
    message: string;
    stack: string;
  } {
    return {
      name: error instanceof Error ? error.name : 'CustomError',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? '') : '',
    };
  }
}
