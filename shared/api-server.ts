export interface RequestOptions {
  /** 超时时间(单位:ms) */
  timeout?: number;

  /**
   * 使用自定义异常处理
   * - true 屏蔽全局异常处理(弹窗提示),异常时执行 Promise.reject
   * - false(默认) 使用全局异常处理,不执行 Promise.reject
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
  isStream?: boolean;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack: string;
  };
}
