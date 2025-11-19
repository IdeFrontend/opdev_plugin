/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  CancelTokenSource,
  InternalAxiosRequestConfig
} from 'axios';

// 请求配置接口
export interface RequestConfig extends AxiosRequestConfig {
  showLoading?: boolean;
  showError?: boolean;
  retryCount?: number;
  retryDelay?: number;
}

// 响应数据接口
export interface ResponseData<T = any> {
  code: number;
  message: string;
  data: T;
  success: boolean;
}

// 自定义错误接口
export interface HttpError extends Error {
  response?: AxiosResponse;
  request?: any;
  config?: AxiosRequestConfig;
  isAxiosError: boolean;
}

// 请求拦截器类型
export type RequestInterceptor = (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
export type RequestErrorInterceptor = (error: any) => any;

// 响应拦截器类型
export type ResponseInterceptor = (response: AxiosResponse) => AxiosResponse;
export type ResponseErrorInterceptor = (error: any) => any;

class HttpClient {
  private instance: AxiosInstance;
  private cancelTokenSources: Map<string, CancelTokenSource> = new Map();
  private requestInterceptors: [RequestInterceptor?, RequestErrorInterceptor?][] = [];
  private responseInterceptors: [ResponseInterceptor?, ResponseErrorInterceptor?][] = [];

  constructor(baseURL?: string, timeout: number = 10000) {
    this.instance = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8'
      }
    });

    this.setupDefaultInterceptors();
  }

  /**
   * 设置默认拦截器
   */
  private setupDefaultInterceptors(): void {
    // 请求拦截器
    this.instance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        if (config.method?.toLowerCase() === 'get') {
          config.params = {
            ...config.params,
            _t: Date.now()
          };
        }
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.instance.interceptors.response.use(
      (response) => {
        return response;
      },
      (error: unknown) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * 添加请求拦截器
   */
  public addRequestInterceptor(
    onFulfilled?: RequestInterceptor,
    onRejected?: RequestErrorInterceptor
  ): number {
    return this.instance.interceptors.request.use(onFulfilled, onRejected);
  }

  /**
   * 添加响应拦截器
   */
  public addResponseInterceptor(
    onFulfilled?: ResponseInterceptor,
    onRejected?: ResponseErrorInterceptor
  ): number {
    return this.instance.interceptors.response.use(onFulfilled, onRejected);
  }

  /**
   * 移除请求拦截器
   */
  public removeRequestInterceptor(id: number): void {
    this.instance.interceptors.request.eject(id);
  }

  /**
   * 移除响应拦截器
   */
  public removeResponseInterceptor(id: number): void {
    this.instance.interceptors.response.eject(id);
  }

  /**
   * 通用请求方法
   */
  public async request<T = any>(config: RequestConfig): Promise<ResponseData<T>> {
    const { showLoading = true, showError = true, retryCount = 0, retryDelay = 1000, ...axiosConfig } = config;

    if (showLoading) {
      this.showLoading();
    }

    try {
      const response = await this.instance.request<ResponseData<T>>(axiosConfig);
      
      // 请求成功后隐藏 loading
      if (showLoading) {
        this.hideLoading();
      }
      
      return response.data;
    } catch (error: unknown) {
      // 请求失败后隐藏 loading
      if (showLoading) {
        this.hideLoading();
      }

      // 重试逻辑
      if (retryCount > 0 && this.isAxiosError(error)) {
        return this.retryRequest(config, retryCount, retryDelay);
      }
      
      if (showError) {
        this.showError(error);
      }
      throw error;
    }
  }

  /**
   * 类型保护：判断是否为 AxiosError
   */
  private isAxiosError(error: unknown): error is AxiosError {
    return axios.isAxiosError(error);
  }

  /**
   * GET请求
   */
  public async get<T = any>(url: string, params?: any, config?: RequestConfig): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'GET',
      url,
      params,
      ...config
    });
  }

  /**
   * POST请求
   */
  public async post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data,
      ...config
    });
  }

  /**
   * PUT请求
   */
  public async put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'PUT',
      url,
      data,
      ...config
    });
  }

  /**
   * DELETE请求
   */
  public async delete<T = any>(url: string, params?: any, config?: RequestConfig): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'DELETE',
      url,
      params,
      ...config
    });
  }

  /**
   * PATCH请求
   */
  public async patch<T = any>(url: string, data?: any, config?: RequestConfig): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'PATCH',
      url,
      data,
      ...config
    });
  }

  /**
   * 上传文件
   */
  public async upload<T = any>(url: string, formData: FormData, config?: RequestConfig): Promise<ResponseData<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      ...config
    });
  }

  /**
   * 下载文件
   */
  public async download(url: string, params?: any, config?: RequestConfig): Promise<Blob> {
    const response = await this.instance({
      method: 'GET',
      url,
      params,
      responseType: 'blob',
      ...config
    });
    return response.data;
  }

  /**
   * 创建可取消的请求
   */
  public createCancelableRequest<T = any>(config: RequestConfig & { cancelKey?: string }): {
    promise: Promise<ResponseData<T>>;
    cancel: (message?: string) => void;
  } {
    const cancelKey = config.cancelKey || `${config.method}-${config.url}`;
    const source = axios.CancelToken.source();
    
    this.cancelTokenSources.set(cancelKey, source);

    const promise = this.request<T>({
      ...config,
      cancelToken: source.token
    }).then(
      (result) => {
        this.cancelTokenSources.delete(cancelKey);
        return result;
      },
      (error) => {
        this.cancelTokenSources.delete(cancelKey);
        throw error;
      }
    );

    return {
      promise,
      cancel: (message?: string) => {
        source.cancel(message || '请求被取消');
        this.cancelTokenSources.delete(cancelKey);
      }
    };
  }

  /**
   * 取消请求
   */
  public cancelRequest(cancelKey: string, message?: string): void {
    const source = this.cancelTokenSources.get(cancelKey);
    if (source) {
      source.cancel(message || '请求被取消');
      this.cancelTokenSources.delete(cancelKey);
    }
  }

  /**
   * 取消所有请求
   */
  public cancelAllRequests(message?: string): void {
    this.cancelTokenSources.forEach((source, key) => {
      source.cancel(message || '所有请求被取消');
    });
    this.cancelTokenSources.clear();
  }

  /**
   * 重试请求
   */
  private async retryRequest<T = any>(
    config: RequestConfig,
    retryCount: number,
    retryDelay: number
  ): Promise<ResponseData<T>> {
    await this.delay(retryDelay);
    return this.request<T>({
      ...config,
      retryCount: retryCount - 1,
      showLoading: false // 重试时不再显示 loading
    });
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 错误处理
   */
  private handleError(error: unknown): void {
    if (axios.isCancel(error)) {
      console.log('请求被取消:', (error as any).message);
      return;
    }

    if (this.isAxiosError(error)) {
      let message = '请求失败';
      
      if (error.response) {
        // 服务器返回错误状态码
        const status = error.response.status;
        switch (status) {
          case 400:
            message = '请求错误';
            break;
          case 401:
            message = '未授权，请重新登录';
            this.redirectToLogin();
            break;
          case 403:
            message = '拒绝访问';
            break;
          case 404:
            message = '请求地址出错';
            break;
          case 408:
            message = '请求超时';
            break;
          case 500:
            message = '服务器内部错误';
            break;
          case 501:
            message = '服务未实现';
            break;
          case 502:
            message = '网关错误';
            break;
          case 503:
            message = '服务不可用';
            break;
          case 504:
            message = '网关超时';
            break;
          case 505:
            message = 'HTTP版本不受支持';
            break;
          default:
            message = `连接错误 ${status}`;
        }
      } else if (error.request) {
        message = '网络连接异常，请检查网络';
      } else {
        message = error.message;
      }

      console.error('请求错误:', message);
    } else {
      // 处理非 Axios 错误
      console.error('未知错误:', error);
    }
  }

  /**
   * 跳转到登录页
   */
  private redirectToLogin(): void {
    // 这里实现跳转到登录页的逻辑
    // 例如：window.location.href = '/login';
    console.log('跳转到登录页');
  }

  /**
   * 显示loading
   */
  private showLoading(): void {
    // 实现你的loading显示逻辑
    console.log('显示loading');
  }

  /**
   * 隐藏loading
   */
  private hideLoading(): void {
    // 实现你的loading隐藏逻辑
    console.log('隐藏loading');
  }

  /**
   * 显示错误消息
   */
  private showError(error: unknown): void {
    let message = '请求失败';
    
    if (this.isAxiosError(error)) {
      if (error.response?.data && typeof error.response.data === 'object') {
        const responseData = error.response.data as any;
        message = responseData.message || message;
      } else if (error.message) {
        message = error.message;
      }
    } else if (error instanceof Error) {
      message = error.message;
    } else {
      message = String(error);
    }

    // 实现错误消息显示逻辑，例如使用 Toast 或 Message 组件
    console.error('显示错误:', message);
  }

  /**
   * 获取axios实例
   */
  public getInstance(): AxiosInstance {
    return this.instance;
  }

  /**
   * 设置公共请求头
   */
  public setHeader(key: string, value: string): void {
    this.instance.defaults.headers.common[key] = value;
  }

  /**
   * 删除公共请求头
   */
  public deleteHeader(key: string): void {
    delete this.instance.defaults.headers.common[key];
  }

  /**
   * 设置基础URL
   */
  public setBaseURL(baseURL: string): void {
    this.instance.defaults.baseURL = baseURL;
  }

  /**
   * 设置超时时间
   */
  public setTimeout(timeout: number): void {
    this.instance.defaults.timeout = timeout;
  }
}

// 创建默认实例
export default HttpClient;