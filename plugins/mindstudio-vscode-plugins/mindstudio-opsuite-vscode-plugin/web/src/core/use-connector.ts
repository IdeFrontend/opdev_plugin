import type { ConnectChannel } from 'plugin:/core/Connector';
import { CONNECTOR_READY_CHANNEL } from 'plugin:/core/Connector';

import { vscode } from '../utils/vscode';

type WebviewListener<T> = (message: T) => void;

/**
 * extension通信器（webview端使用）
 */
export function useConnector<T = unknown, R = T>(channel: ConnectChannel) {
  const listeners: WebviewListener<R>[] = [];

  window.addEventListener('message', (event) => {
    const res = event.data;
    if (res.channel !== channel) {
      return;
    }
    listeners.forEach((callback) => {
      callback(res.data);
    });
  });
  vscode.postMessage({ channel: CONNECTOR_READY_CHANNEL, data: channel });

  function send(message: T): void {
    vscode.postMessage({ channel: channel, data: message });
  }

  function receive(callback: WebviewListener<R>): void {
    listeners.push(callback);
  }

  return { send, receive };
}
