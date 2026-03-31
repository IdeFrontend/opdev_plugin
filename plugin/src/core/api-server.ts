import { t } from 'i18next';
import * as vscode from 'vscode';

import type {
  RequestOptions,
  RequestMessage,
  ResponseMessage,
} from '@shared/api-server';
import { WebviewConnector } from './connector';

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

        if (resData instanceof ReadableStream) {
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
