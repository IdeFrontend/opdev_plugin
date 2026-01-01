// Node (扩展主机) 端的 WebviewSocket 桥接器
// 接收来自 webview 的 postMessage 调用，使用 `ws` 包打开真实的 WebSocket 连接到后端，然后转发事件
// 注意：所有来自 webview 的消息都已包含 'id' 字段，直接使用该字段
import * as vscode from 'vscode';
import { WebSocket } from 'ws';

type OutgoingFromView = {
  type: 'ws:open' | 'ws:send' | 'ws:close';
  id: string; // 由 webview 提供的 ID，直接使用
  payload?: any;
  url?: string;
  protocols?: string | string[];
};

type IncomingToView = {
  type: 'ws:opened' | 'ws:message' | 'ws:error' | 'ws:closed';
  id: string; // 来自 webview 的 ID，原样返回
  payload?: any;
  reason?: string;
  code?: number;
};

export class NodeWebviewSocketBridge implements vscode.Disposable {
  private sockets = new Map<string, WebSocket>();
  private disposed = false;
  private subscription: vscode.Disposable;

  constructor(private webview: vscode.Webview) {
    this.subscription = webview.onDidReceiveMessage(this.handleMessage);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription?.dispose();

    for (const [, ws] of this.sockets) {
      try {
        ws.close();
      } catch {
        /* 忽略错误 */
      }
    }
    this.sockets.clear();
  }

  private handleMessage = (msg: OutgoingFromView) => {
    if (this.disposed) {
      return;
    }

    // 验证消息格式 - id 必须由 webview 提供
    if (!msg || !msg.type || !msg.id) {
      return;
    }

    // 直接使用来自 webview 消息的 id
    const { id } = msg;

    switch (msg.type) {
      case 'ws:open':
        this.openSocket(msg);
        break;
      case 'ws:send':
        // 提取接口信息（如果payload是JSON格式）
        let apiName = 'unknown';

        try {
          if (typeof msg.payload === 'string') {
            const parsed = JSON.parse(msg.payload);

            apiName =
              parsed?.method ||
              parsed?.api ||
              parsed?.action ||
              parsed?.type ||
              'unknown';
          } else if (msg.payload && typeof msg.payload === 'object') {
            apiName =
              msg.payload?.method ||
              msg.payload?.api ||
              msg.payload?.action ||
              msg.payload?.type ||
              'unknown';
          }
        } catch {
          // 无法解析payload，使用默认值
        }
        console.log(
          `[转发请求入口] 接口: ${apiName}, ID: ${id}, 类型: ${msg.type}`,
        );
        this.forwardSend(msg);
        break;
      case 'ws:close':
        this.closeSocket(id, msg.payload?.code, msg.payload?.reason);
        break;
    }
  };

  private openSocket(msg: OutgoingFromView) {
    // 直接从 webview 消息中提取 id - 不生成 id
    const { id, url, protocols } = msg;

    if (!url) {
      this.postToView({
        type: 'ws:error',
        id,
        reason: 'WebSocket URL is required',
      });

      return;
    }

    // 避免相同 id 的重复连接（id 来自 webview）
    if (this.sockets.has(id)) {
      this.closeSocket(id);
    }

    try {
      const ws = new WebSocket(url, protocols);

      this.sockets.set(id, ws);

      ws.on('open', () => {
        this.postToView({ type: 'ws:opened', id });
      });

      ws.on('message', (data: any) => {
        const normalizedPayload = this.normalizeMessagePayload(data);

        // 提取接口信息用于日志
        let apiName = 'unknown';

        try {
          if (typeof normalizedPayload === 'string') {
            const parsed = JSON.parse(normalizedPayload);

            apiName =
              parsed?.method ||
              parsed?.api ||
              parsed?.action ||
              parsed?.type ||
              parsed?.result?.method ||
              'unknown';
          } else if (
            normalizedPayload &&
            typeof normalizedPayload === 'object'
          ) {
            apiName =
              normalizedPayload?.method ||
              normalizedPayload?.api ||
              normalizedPayload?.action ||
              normalizedPayload?.type ||
              normalizedPayload?.result?.method ||
              'unknown';
          }
        } catch {
          // 无法解析payload，使用默认值
        }

        const payloadPreview =
          typeof normalizedPayload === 'string'
            ? normalizedPayload.length > 200
              ? normalizedPayload.substring(0, 200) + '...'
              : normalizedPayload
            : JSON.stringify(normalizedPayload || '').substring(0, 200);

        console.log(
          `[转发响应] 后端WebSocket -> Web端 | 接口: ${apiName}, ID: ${id}, Payload: ${payloadPreview}`,
        );

        this.postToView({
          type: 'ws:message',
          id,
          payload: normalizedPayload,
        });
      });

      ws.on('error', (err: Error) => {
        const errorMessage = (err as Error)?.message ?? String(err);

        this.postToView({
          type: 'ws:error',
          id,
          reason: errorMessage,
        });
      });

      ws.on('close', (code: any, reason: { toString: () => any }) => {
        this.sockets.delete(id);
        this.postToView({
          type: 'ws:closed',
          id,
          code,
          reason: reason?.toString(),
        });
      });
    } catch (error: any) {
      this.postToView({
        type: 'ws:error',
        id,
        reason: `Failed to create WebSocket: ${error?.message || String(error)}`,
      });
    }
  }

  private forwardSend(msg: OutgoingFromView) {
    // 直接使用来自 webview 消息的 id
    const { id } = msg;
    const ws = this.sockets.get(id);

    if (!ws) {
      console.warn(`[转发发送] WebSocket连接不存在, ID: ${id}`);

      return;
    }

    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(
        `[转发发送] WebSocket未打开, ID: ${id}, readyState: ${ws.readyState}`,
      );

      return;
    }

    // 提取接口信息用于日志
    let apiName = 'unknown';

    try {
      if (typeof msg.payload === 'string') {
        const parsed = JSON.parse(msg.payload);

        apiName =
          parsed?.method ||
          parsed?.api ||
          parsed?.action ||
          parsed?.type ||
          'unknown';
      } else if (msg.payload && typeof msg.payload === 'object') {
        apiName =
          msg.payload?.method ||
          msg.payload?.api ||
          msg.payload?.action ||
          msg.payload?.type ||
          'unknown';
      }
    } catch {
      // 无法解析payload，使用默认值
    }

    const payloadPreview =
      typeof msg.payload === 'string'
        ? msg.payload.length > 200
          ? msg.payload.substring(0, 200) + '...'
          : msg.payload
        : JSON.stringify(msg.payload || '').substring(0, 200);

    console.log(
      `[转发发送] Web端 -> 后端WebSocket | 接口: ${apiName}, ID: ${id}, Payload: ${payloadPreview}`,
    );
    ws.send(msg.payload);
  }

  private closeSocket(id: string, code?: number, reason?: string) {
    // id 来自 webview，直接使用
    const ws = this.sockets.get(id);

    if (!ws) {
      return;
    }

    try {
      ws.close(code, reason);
    } catch (error) {
      // 忽略关闭错误
    }

    this.sockets.delete(id);
  }

  private postToView(msg: IncomingToView) {
    // 尽力而为；忽略失败
    // msg.id 来自 webview，原样返回
    try {
      this.webview.postMessage(msg);
    } catch (error) {
      // 忽略 postMessage 错误
    }
  }

  private normalizeMessagePayload(data: any) {
    // ws RawData 可以是 Buffer | ArrayBuffer | Buffer[] | ArrayBufferView | string
    if (typeof data === 'string') return data;
    if (Array.isArray(data))
      return Buffer.concat(data as Buffer[]).toString('utf8');
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;

      return Buffer.from(
        view.buffer,
        view.byteOffset,
        view.byteLength,
      ).toString('utf8');
    }
    if (Buffer.isBuffer(data)) return data.toString('utf8');

    return data;
  }
}
