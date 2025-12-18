// Node (extension host) side bridge for WebviewSocket.
// It receives postMessage calls from the webview and opens a real WebSocket
// to the backend using the `ws` package, then relays events back.
import * as vscode from 'vscode';
import { WebSocket } from 'ws';

type OutgoingFromView = {
  type: 'ws:open' | 'ws:send' | 'ws:close';
  id: string;
  payload?: any;
  url?: string;
  protocols?: string | string[];
};

type IncomingToView = {
  type: 'ws:opened' | 'ws:message' | 'ws:error' | 'ws:closed';
  id: string;
  payload?: any;
  reason?: string;
  code?: number;
};

export class NodeWebviewSocketBridge implements vscode.Disposable {
  private sockets = new Map<string, WebSocket>();
  private disposed = false;
  private subscription: vscode.Disposable;

  constructor(private webview: vscode.Webview) {
    console.log('[NodeWebviewSocketBridge] 构造函数调用，开始监听 webview 消息');
    // Listen to messages posted from the webview (coming from WebviewSocket).
    this.subscription = webview.onDidReceiveMessage(this.handleMessage);
    console.log('[NodeWebviewSocketBridge] 消息监听器已注册');
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription?.dispose();

    for (const [, ws] of this.sockets) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
    this.sockets.clear();
  }

  private handleMessage = (msg: OutgoingFromView) => {
    console.log('[NodeWebviewSocketBridge] 收到消息:', JSON.stringify(msg, null, 2));
    
    if (this.disposed) {
      console.warn('[NodeWebviewSocketBridge] Bridge 已销毁，忽略消息');
      return;
    }
    
    if (!msg || !msg.type || !msg.id) {
      console.warn('[NodeWebviewSocketBridge] 消息格式无效:', msg);
      return;
    }

    switch (msg.type) {
      case 'ws:open':
        console.log(`[NodeWebviewSocketBridge] 处理 ws:open 请求, id: ${msg.id}, url: ${msg.url}`);
        this.openSocket(msg);
        break;
      case 'ws:send':
        console.log(`[NodeWebviewSocketBridge] 处理 ws:send 请求, id: ${msg.id}`);
        this.forwardSend(msg);
        break;
      case 'ws:close':
        console.log(`[NodeWebviewSocketBridge] 处理 ws:close 请求, id: ${msg.id}`);
        this.closeSocket(msg.id, msg.payload?.code, msg.payload?.reason);
        break;
      default:
        console.warn(`[NodeWebviewSocketBridge] 未知消息类型: ${msg.type}`);
    }
  };

  private openSocket(msg: OutgoingFromView) {
    const { id, url, protocols } = msg;
    
    console.log(`[NodeWebviewSocketBridge] openSocket 调用, id: ${id}, url: ${url}, protocols:`, protocols);
    
    if (!url) {
      const errorMsg = `[NodeWebviewSocketBridge] WebSocket URL 为空，无法建立连接, id: ${id}`;
      console.error(errorMsg);
      this.postToView({
        type: 'ws:error',
        id,
        reason: 'WebSocket URL is required',
      });
      return;
    }

    // Avoid duplicate connections for same id.
    if (this.sockets.has(id)) {
      console.warn(`[NodeWebviewSocketBridge] 检测到重复连接 id: ${id}，关闭旧连接`);
      this.closeSocket(id);
    }

    try {
      console.log(`[NodeWebviewSocketBridge] 正在创建 WebSocket 连接: ${url}`);
      const ws = new WebSocket(url, protocols);
      this.sockets.set(id, ws);
      console.log(`[NodeWebviewSocketBridge] WebSocket 实例已创建, id: ${id}, readyState: ${ws.readyState}`);

      ws.on('open', () => {
        console.log(`[NodeWebviewSocketBridge] WebSocket 连接已打开, id: ${id}, readyState: ${ws.readyState}`);
        this.postToView({ type: 'ws:opened', id });
      });

      ws.on('message', (data) => {
        console.log(`[NodeWebviewSocketBridge] 收到 WebSocket 消息, id: ${id}, 数据长度: ${data?.length || 0}`);
        this.postToView({
          type: 'ws:message',
          id,
          payload: this.normalizeMessagePayload(data),
        });
      });

      ws.on('error', (err) => {
        const errorMessage = (err as Error)?.message ?? String(err);
        const errorStack = (err as Error)?.stack;
        console.error(`[NodeWebviewSocketBridge] WebSocket 错误, id: ${id}`, {
          message: errorMessage,
          stack: errorStack,
          error: err,
          readyState: ws.readyState,
        });
        this.postToView({
          type: 'ws:error',
          id,
          reason: errorMessage,
        });
      });

      ws.on('close', (code, reason) => {
        console.log(`[NodeWebviewSocketBridge] WebSocket 连接已关闭, id: ${id}, code: ${code}, reason: ${reason?.toString()}`);
        this.sockets.delete(id);
        this.postToView({
          type: 'ws:closed',
          id,
          code,
          reason: reason?.toString(),
        });
      });
    } catch (error: any) {
      const errorMsg = `[NodeWebviewSocketBridge] 创建 WebSocket 失败, id: ${id}, url: ${url}`;
      console.error(errorMsg, error);
      this.postToView({
        type: 'ws:error',
        id,
        reason: `Failed to create WebSocket: ${error?.message || String(error)}`,
      });
    }
  }

  private forwardSend(msg: OutgoingFromView) {
    const ws = this.sockets.get(msg.id);
    if (!ws) {
      console.warn(`[NodeWebviewSocketBridge] 未找到 WebSocket 连接, id: ${msg.id}`);
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`[NodeWebviewSocketBridge] WebSocket 未打开, id: ${msg.id}, readyState: ${ws.readyState}`);
      return;
    }
    console.log(`[NodeWebviewSocketBridge] 转发消息到 WebSocket, id: ${msg.id}, payload length: ${msg.payload?.length || 0}`);
    ws.send(msg.payload);
  }

  private closeSocket(id: string, code?: number, reason?: string) {
    console.log(`[NodeWebviewSocketBridge] 关闭 WebSocket, id: ${id}, code: ${code}, reason: ${reason}`);
    const ws = this.sockets.get(id);
    if (!ws) {
      console.warn(`[NodeWebviewSocketBridge] 未找到要关闭的 WebSocket, id: ${id}`);
      return;
    }
    try {
      ws.close(code, reason);
      console.log(`[NodeWebviewSocketBridge] WebSocket 关闭请求已发送, id: ${id}`);
    } catch (error) {
      console.error(`[NodeWebviewSocketBridge] 关闭 WebSocket 时出错, id: ${id}`, error);
    }
    this.sockets.delete(id);
  }

  private postToView(msg: IncomingToView) {
    // Best-effort; ignore failures.
    console.log(`[NodeWebviewSocketBridge] 发送消息到 webview:`, JSON.stringify(msg, null, 2));
    try {
      this.webview.postMessage(msg);
    } catch (error) {
      console.error(`[NodeWebviewSocketBridge] 发送消息到 webview 失败:`, error);
    }
  }

  private normalizeMessagePayload(data: any) {
    // ws RawData can be Buffer | ArrayBuffer | Buffer[] | ArrayBufferView | string
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString('utf8');
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf8');
    }
    if (Buffer.isBuffer(data)) return data.toString('utf8');
    return data;
  }
}

