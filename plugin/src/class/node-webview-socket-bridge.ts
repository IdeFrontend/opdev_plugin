/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
// WebviewSocket bridge on Node (extension host) side
// Receive the postMessage call from the webview, use the `ws` package to open a real WebSocket connection to the backend, and then forward the event
// Note: All messages from webview already contain the 'id' field, use this field directly
import * as vscode from 'vscode';
import { WebSocket } from 'ws';

type OutgoingFromView = {
  type: 'ws:open' | 'ws:send' | 'ws:close';
  id: string; // ID provided by webview, used directly
  payload?: any;
  url?: string;
  protocols?: string | string[];
};

type IncomingToView = {
  type: 'ws:opened' | 'ws:message' | 'ws:error' | 'ws:closed';
  id: string; // ID from webview, returned unchanged
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
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.subscription?.dispose();

    for (const [
      , ws,
    ] of this.sockets) {
      try {
        ws.close();
      }
      catch {
        /* ignore errors */
      }
    }

    this.sockets.clear();
  }

  private handleMessage = (msg: OutgoingFromView) => {
    if (this.disposed) {
      return;
    }

    // Validation message format - id must be provided by webview
    if (!msg || !msg.type || !msg.id) {
      return;
    }

    // Use id directly from webview message
    const { id } = msg;

    switch (msg.type) {
      case 'ws:open':
        this.openSocket(msg);
        break;
      case 'ws:send': {
        // Extract interface information (if payload is in JSON format)
        let apiName = 'unknown';

        try {
          if (typeof msg.payload === 'string') {
            const parsed = JSON.parse(msg.payload);

            apiName =
              parsed?.method
              || parsed?.api
              || parsed?.action
              || parsed?.type
              || 'unknown';
          }
          else if (msg.payload && typeof msg.payload === 'object') {
            apiName =
              msg.payload?.method
              || msg.payload?.api
              || msg.payload?.action
              || msg.payload?.type
              || 'unknown';
          }
        }
        catch {
          // Unable to parse payload, use default value
        }

        console.log(`[Forward request entry] API: ${apiName}, ID: ${id}, Type: ${msg.type}`);
        this.forwardSend(msg);
        break;
      }

      case 'ws:close':
        this.closeSocket(id, msg.payload?.code, msg.payload?.reason);
        break;
    }
  };

  private openSocket(msg: OutgoingFromView) {
    // Extract id directly from webview message - no id generated
    const {
      id, url, protocols,
    } = msg;

    if (!url) {
      this.postToView({
        type: 'ws:error',
        id,
        reason: 'WebSocket URL is required',
      });

      return;
    }

    // Avoid duplicate connections with the same id (id comes from webview)
    if (this.sockets.has(id)) {
      this.closeSocket(id);
    }

    try {
      const ws = new WebSocket(url, protocols);

      this.sockets.set(id, ws);

      ws.on('open', () => {
        this.postToView({
          type: 'ws:opened',
          id,
        });
      });

      ws.on('message', (data: any) => {
        const normalizedPayload = this.normalizeMessagePayload(data);

        // Extract interface information for logs
        let apiName = 'unknown';

        try {
          if (typeof normalizedPayload === 'string') {
            const parsed = JSON.parse(normalizedPayload);

            apiName =
              parsed?.method
              || parsed?.api
              || parsed?.action
              || parsed?.type
              || parsed?.result?.method
              || 'unknown';
          }
          else if (
            normalizedPayload
            && typeof normalizedPayload === 'object'
          ) {
            apiName =
              normalizedPayload?.method
              || normalizedPayload?.api
              || normalizedPayload?.action
              || normalizedPayload?.type
              || normalizedPayload?.result?.method
              || 'unknown';
          }
        }
        catch {
          // Unable to parse payload, use default value
        }

        const payloadPreview =
          typeof normalizedPayload === 'string'
            ? normalizedPayload.length > 200
              ? normalizedPayload.substring(0, 200) + '...'
              : normalizedPayload
            : JSON.stringify(normalizedPayload || '')
              .substring(0, 200);

        console.log(`[Forward response] Backend WebSocket -> Web | API: ${apiName}, ID: ${id}, Payload: ${payloadPreview}`);

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

      ws.on('close', (code: any, reason: { toString: ()=> any }) => {
        this.sockets.delete(id);
        this.postToView({
          type: 'ws:closed',
          id,
          code,
          reason: reason?.toString(),
        });
      });
    }
    catch (error: any) {
      this.postToView({
        type: 'ws:error',
        id,
        reason: `Failed to create WebSocket: ${error?.message || String(error)}`,
      });
    }
  }

  private forwardSend(msg: OutgoingFromView) {
    // Use id directly from webview message
    const { id } = msg;
    const ws = this.sockets.get(id);

    if (!ws) {
      console.warn(`[Forward send] WebSocket connection does not exist, ID: ${id}`);

      return;
    }

    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`[Forward send] WebSocket is not open, ID: ${id}, readyState: ${ws.readyState}`);

      return;
    }

    // Extract interface information for logs
    let apiName = 'unknown';

    try {
      if (typeof msg.payload === 'string') {
        const parsed = JSON.parse(msg.payload);

        apiName =
          parsed?.method
          || parsed?.api
          || parsed?.action
          || parsed?.type
          || 'unknown';
      }
      else if (msg.payload && typeof msg.payload === 'object') {
        apiName =
          msg.payload?.method
          || msg.payload?.api
          || msg.payload?.action
          || msg.payload?.type
          || 'unknown';
      }
    }
    catch {
      // Unable to parse payload, use default value
    }

    const payloadPreview =
      typeof msg.payload === 'string'
        ? msg.payload.length > 200
          ? msg.payload.substring(0, 200) + '...'
          : msg.payload
        : JSON.stringify(msg.payload || '')
          .substring(0, 200);

    console.log(`[Forward send] Web -> Backend WebSocket | API: ${apiName}, ID: ${id}, Payload: ${payloadPreview}`);
    ws.send(msg.payload);
  }

  private closeSocket(id: string, code?: number, reason?: string) {
    // id comes from webview, used directly
    const ws = this.sockets.get(id);

    if (!ws) {
      return;
    }

    try {
      ws.close(code, reason);
    }
    catch {
      // Ignore shutdown errors
    }

    this.sockets.delete(id);
  }

  private postToView(msg: IncomingToView) {
    // Do your best; ignore failure
    // msg.id comes from webview and is returned as is
    try {
      this.webview.postMessage(msg);
    }
    catch {
      // Ignore postMessage errors
    }
  }

  private normalizeMessagePayload(data: any) {
    // ws RawData can be Buffer | ArrayBuffer | Buffer[] | ArrayBufferView | string
    if (typeof data === 'string') {
      return data;
    }

    if (Array.isArray(data)) {
      return Buffer.concat(data as Buffer[])
        .toString('utf8');
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(data)
        .toString('utf8');
    }

    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;

      return Buffer.from(
        view.buffer,
        view.byteOffset,
        view.byteLength,
      )
        .toString('utf8');
    }

    if (Buffer.isBuffer(data)) {
      return data.toString('utf8');
    }

    return data;
  }
}
