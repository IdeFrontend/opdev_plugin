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
    // Listen to messages posted from the webview (coming from WebviewSocket).
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
        /* noop */
      }
    }
    this.sockets.clear();
  }

  private handleMessage = (msg: OutgoingFromView) => {
    if (this.disposed || !msg || !msg.type || !msg.id) return;

    switch (msg.type) {
      case 'ws:open':
        this.openSocket(msg);
        break;
      case 'ws:send':
        this.forwardSend(msg);
        break;
      case 'ws:close':
        this.closeSocket(msg.id, msg.payload?.code, msg.payload?.reason);
        break;
    }
  };

  private openSocket(msg: OutgoingFromView) {
    const { id, url, protocols } = msg;
    if (!url) return;

    // Avoid duplicate connections for same id.
    if (this.sockets.has(id)) {
      this.closeSocket(id);
    }

    const ws = new WebSocket(url, protocols);
    this.sockets.set(id, ws);

    ws.on('open', () => {
      this.postToView({ type: 'ws:opened', id });
    });

    ws.on('message', (data) => {
      this.postToView({
        type: 'ws:message',
        id,
        payload: this.normalizeMessagePayload(data),
      });
    });

    ws.on('error', (err) => {
      this.postToView({
        type: 'ws:error',
        id,
        reason: (err as Error)?.message ?? String(err),
      });
    });

    ws.on('close', (code, reason) => {
      this.sockets.delete(id);
      this.postToView({
        type: 'ws:closed',
        id,
        code,
        reason: reason?.toString(),
      });
    });
  }

  private forwardSend(msg: OutgoingFromView) {
    const ws = this.sockets.get(msg.id);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(msg.payload);
  }

  private closeSocket(id: string, code?: number, reason?: string) {
    const ws = this.sockets.get(id);
    if (!ws) return;
    try {
      ws.close(code, reason);
    } catch {
      /* noop */
    }
    this.sockets.delete(id);
  }

  private postToView(msg: IncomingToView) {
    // Best-effort; ignore failures.
    this.webview.postMessage(msg);
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

