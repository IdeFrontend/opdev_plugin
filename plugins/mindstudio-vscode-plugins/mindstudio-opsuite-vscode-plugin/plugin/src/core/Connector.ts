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
    console.log(`[WebviewConnector] send: channel=${this.channel}, isReady=${isReady}, data:`, JSON.stringify(data));
    if (isReady) {
      console.log(`[WebviewConnector] send: webview已ready, 直接发送消息`);
      webview.postMessage({ channel: this.channel, data });
    } else {
      console.log(`[WebviewConnector] send: webview未ready, 消息加入pending队列`);
      this.pendingDataList.get(webview)?.push(data);
    }
  }

  public receive(callback: ExtensionListener<R>): void {
    this.listeners.push(callback);
  }

  public addWebview(webview: Webview): void {
    console.log(`[WebviewConnector] addWebview: channel=${this.channel}, 添加webview监听器`);
    const receiver = webview.onDidReceiveMessage((res) => {
      console.log(`[WebviewConnector] addWebview: 收到消息, channel=${res.channel}, data:`, JSON.stringify(res.data));
      // 客户端初始化
      if (isWebviewReadyMessage(res, this.channel)) {
        console.log(`[WebviewConnector] addWebview: 收到ready消息, 启动connector`);
        this.startConnector(webview);
        return;
      }
      if (res.channel !== this.channel) {
        console.log(`[WebviewConnector] addWebview: 频道不匹配, 忽略消息`);
        return;
      }
      console.log(`[WebviewConnector] addWebview: 触发listeners, 数量:`, this.listeners.length);
      this.listeners.forEach((callback) => {
        callback(res.data, webview);
      });
    });
    this.pendingDataList.set(webview, []);
    this.messageReceivers.set(webview, receiver);
    console.log(`[WebviewConnector] addWebview: webview已添加, pending队列已初始化`);
  }

  public removeWebview(webview: Webview): void {
    this.pendingDataList.delete(webview);
    this.messageReceivers.get(webview)?.dispose();
  }

  private startConnector(webview: Webview): void {
    console.log(`[WebviewConnector] startConnector: channel=${this.channel}, 启动connector`);
    this.webviewReady.set(webview, true);
    const pendingData = this.pendingDataList.get(webview);
    console.log(`[WebviewConnector] startConnector: pending消息数量:`, pendingData?.length || 0);
    pendingData?.forEach((data) => {
      console.log(`[WebviewConnector] startConnector: 发送pending消息:`, JSON.stringify(data));
      this.send(webview, data);
    });
    this.pendingDataList.delete(webview);
    console.log(`[WebviewConnector] startConnector: connector启动完成`);
  }
}

function isWebviewReadyMessage(message: ConnectMessage, channel: ConnectChannel): boolean {
  return message.channel === CONNECTOR_READY_CHANNEL && message.data === channel;
}
