import type {
  RequestOptions,
  RequestMessage,
  ResponseMessage,
} from '@shared/api-server';

import { deepToRaw } from '@/utils/reactive';

import { useConnector } from './use-connector';

export type { RequestOptions };

interface ExtensionRequest {
  post: <Data, Res>(
    api: string,
    params?: Data,
    options?: RequestOptions,
  )=> Promise<Res>;
}

interface PendingRequest {
  success: (value: unknown)=> void;
  error: (statusCode: ResponseMessage['statusCode'], error: Error)=> void;
  options: Required<RequestOptions>;
}

export const request = createExtensionRequest();

/**
 * 创建扩展端请求服务，webview使用
 * @returns { ExtensionRequest }
 */
function createExtensionRequest(): ExtensionRequest {
  const {
    send, receive,
  } = useConnector<RequestMessage, ResponseMessage>('request');

  const pendingRequests = new Map<string, PendingRequest>();

  receive(({
    requestId, statusCode, isStream, data, error,
  }) => {
    if (!pendingRequests.has(requestId)) {
      return;
    }

    if (statusCode === 200) {
      if (isStream) {
        handleStreamResponse(
          requestId,
          data as ReadableStreamReadResult<unknown>,
          pendingRequests,
        );
      }
      else {
        pendingRequests.get(requestId)
          ?.success(data);
        pendingRequests.delete(requestId);
      }
    }
    else {
      pendingRequests
        .get(requestId)
        ?.error(
          statusCode,
          error ? recoverFromMessageError(error) : new Error('unknown error'),
        );
      pendingRequests.delete(requestId);
    }
  });

  return {
    post: <Data, Res>(
      api: string,
      params?: Data,
      options?: RequestOptions,
    ): Promise<Res> => {
      const optionsWithDefault = getOptionsWithDefault(options);
      const requestId = `${api}-${window.crypto.randomUUID()}`;

      send({
        api,
        requestId,
        data: deepToRaw(params),
        options: optionsWithDefault,
      });

      return new Promise((resolve, reject) => {
        // 请求超时：如果 timeout <= 0 或 timeout 为 Infinity，则不设置超时
        const requestTimeout = optionsWithDefault.timeout > 0 && optionsWithDefault.timeout !== Number.POSITIVE_INFINITY
          ? setTimeout(() => {
            reject(new Error(`request:${requestId} timeout`));
            pendingRequests.delete(requestId);
          }, optionsWithDefault.timeout)
          : null;

        pendingRequests.set(requestId, {
          success: makeSuccessHandler(resolve, requestTimeout),
          error: makeErrorHandler(reject, requestTimeout, optionsWithDefault),
          options: optionsWithDefault,
        });
      });
    },
  };
}

const pendingStreams = new Map<
  string,
  ReadableStreamDefaultController<unknown>
>();

/**
 * 流式传输返回
 * @description 先返回一个ReadableStream，后续消息写入ReadableStream
 */
function handleStreamResponse(
  requestId: string,
  result: ReadableStreamReadResult<unknown>,
  pendingRequests: Map<string, PendingRequest>,
): void {
  if (!pendingStreams.has(requestId)) {
    const stream = new ReadableStream({
      start(controller) {
        pendingStreams.set(requestId, controller);
      },
    });

    pendingRequests.get(requestId)
      ?.success(stream);
  }

  if (result.done) {
    pendingStreams.get(requestId)
      ?.close();
    pendingStreams.delete(requestId);
    pendingRequests.delete(requestId);
  }
  else {
    pendingStreams.get(requestId)
      ?.enqueue(result.value);
  }
}

function recoverFromMessageError(messageError: NonNullable<ResponseMessage['error']>): Error {
  const error = new Error(messageError.message);

  error.name = messageError.name;
  error.stack = messageError.stack;

  return error;
}

function makeSuccessHandler<T>(
  resolve: (value: T | PromiseLike<T>)=> void,
  requestTimeout: ReturnType<typeof setTimeout> | null,
): (value: unknown)=> void {
  return (value: unknown) => {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
    }
    resolve(value as T);
  };
}

function makeErrorHandler(
  reject: (reason: unknown)=> void,
  requestTimeout: ReturnType<typeof setTimeout> | null,
  options: Required<RequestOptions>,
): PendingRequest['error'] {
  return (statusCode, error) => {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
    }

    if (!options.useCustomErrorHandler) {
      // 这里进行自定义错误处理
    }
    // 默认会通过vscode弹出错误提示
    reject(error);
  };
}

function getOptionsWithDefault(options?: RequestOptions): Required<RequestOptions> {
  // 如果明确指定了 timeout，使用指定的值；否则使用默认值
  return {
    timeout: options?.timeout !== undefined ? options.timeout : 60000, // 默认60秒
    useCustomErrorHandler: options?.useCustomErrorHandler ?? false,
  };
}
