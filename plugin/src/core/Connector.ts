import type { Webview, Disposable } from 'vscode';

/**
 * 通信频道
 * @value request 数据请求
 * @value viewQuery 页面参数
 * @value viewServerApi 页面服务端 - api方法
 * @value viewServerRef 页面服务端 - 响应式对象
 */
export type ConnectChannel = '__connector__' | 'request' | 'viewQuery';

export type ConnectMessage = { channel: ConnectChannel; data: any };

type ExtensionListener<T> = (message: T, webview: Webview) => void;

/** 通信双向ready消息频道 */
export const CONNECTOR_READY_CHANNEL: ConnectChannel = '__connector__';

/**
 * 多webview通信器（extension端使用）
 */
export class WebviewConnector<T = unknown, R = T> {
  /**
   * webview端通信器是否激活
   */
  private webviewReady: WeakMap<Webview, boolean> = new WeakMap();

  /**
   * webview端通信器激活前暂存的消息
   */
  private pendingDataList: WeakMap<Webview, T[]> = new WeakMap();

  private messageReceivers: WeakMap<Webview, Disposable> = new WeakMap();

  private listeners: ExtensionListener<R>[] = [];

  constructor(private channel: ConnectChannel) {}

  public send(webview: Webview, data: T): void {
    const isReady = this.webviewReady.get(webview);
    if (isReady) {
      webview.postMessage({ channel: this.channel, data });
    } else {
      this.pendingDataList.get(webview)?.push(data);
    }
  }

  public receive(callback: ExtensionListener<R>): void {
    this.listeners.push(callback);
  }

  public addWebview(webview: Webview): void {
    const receiver = webview.onDidReceiveMessage((res) => {
      // 客户端初始化
      if (isWebviewReadyMessage(res, this.channel)) {
        this.startConnector(webview);
        return;
      }
      if (res.channel !== this.channel) {
        return;
      }
      this.listeners.forEach((callback) => {
        callback(res.data, webview);
      });
    });
    this.pendingDataList.set(webview, []);
    this.messageReceivers.set(webview, receiver);
  }

  public removeWebview(webview: Webview): void {
    this.pendingDataList.delete(webview);
    this.messageReceivers.get(webview)?.dispose();
  }

  private startConnector(webview: Webview): void {
    this.webviewReady.set(webview, true);
    const pendingData = this.pendingDataList.get(webview);
    pendingData?.forEach((data) => {
      this.send(webview, data);
    });
    this.pendingDataList.delete(webview);
  }
}

function isWebviewReadyMessage(message: ConnectMessage, channel: ConnectChannel): boolean {
  return message.channel === CONNECTOR_READY_CHANNEL && message.data === channel;
}
