import { t } from 'i18next';
import * as vscode from 'vscode';

import { WebviewConnector } from './Connector';

export interface RequestOptions {
  /** 超时时间（单位：ms） */
  timeout?: number;

  /**
   * 使用自定义异常处理
   * - true 屏蔽全局异常处理（弹窗提示），异常时执行 Promise.reject
   * - false(默认) 使用全局异常处理，不执行 Promise.reject
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
  data?: unknown;
  error?: { name: string; message: string; stack: string };
}

type Api = (params: any) => unknown;

type ApiGroup = {
  [key: string]: ApiGroup | Api;
};

/**
 * 接口服务，监听webview端请求
 */
export class ApiServer extends vscode.Disposable {
  // 单例模式
  private static instance: ApiServer;
  public static getInstance(): ApiServer {
    return this.instance;
  }

  private linkedWebviews = new Map<string, vscode.Webview>();
  private connector: WebviewConnector<ResponseMessage, RequestMessage>;

  /**
   * @param apis 接口配置
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
      const { api: apiPath, data } = requestMessage;
      const currentApi = this.getApi(apiPath);
      if (!currentApi) {
        this.resNotFoundError(webview, requestMessage);
        return;
      }
      try {
        const resData = await currentApi(data);
        this.resSuccess(webview, requestMessage, resData);
      } catch (e) {
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

  private resSuccess(webview: vscode.Webview, requestMessage: RequestMessage, resData: unknown): void {
    this.connector.send(webview, {
      ...this.makeBasicResponse(requestMessage),
      statusCode: 200,
      message: t('core.message.apiResponseSuccess'),
      data: resData,
    });
  }

  private resNotFoundError(webview: vscode.Webview, requestMessage: RequestMessage): void {
    const errorMessage = t('core.message.apiResponseNotFound', { apiName: requestMessage.api });
    this.connector.send(webview, {
      ...this.makeBasicResponse(requestMessage),
      statusCode: 404,
      message: errorMessage,
    });

    vscode.window.showErrorMessage(errorMessage);
  }

  private resServerError(webview: vscode.Webview, requestMessage: RequestMessage, error: Error): void {
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

  private makeBasicResponse({ api, requestId }: RequestMessage) {
    return { api, requestId };
  }

  /**
   * sendMessage无法发送error对象，转换成普通对象
   * @param error
   * @returns
   */
  private makeSendableError(error: unknown): { name: string; message: string; stack: string } {
    return {
      name: error instanceof Error ? error.name : 'CustomError',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? '' : '',
    };
  }
}
