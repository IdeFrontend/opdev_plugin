/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * VSCode API 类型定义
 */
interface VSCodeAPI {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

/**
 * 消息类型定义
 */
interface Message {
  command?: string;
  type?: string;
  pluginName?: string;
  content?: string;
  data?: string | number;
  id?: string;
  reason?: string;
  code?: number;
  payload?: any;
}

/**
 * 插件模式初始化器
 * 负责在 VSCode 插件环境中初始化插件相关的功能
 */
export class PluginModeInitializer {
  private vscode: VSCodeAPI | null = null;
  private messageHandler: ((event: MessageEvent<Message>) => void) | null = null;

  /**
   * 检测是否为 VSCode 插件环境
   */
  private isVSCodePluginEnvironment(): boolean {
    return typeof (window as any).acquireVsCodeApi !== 'undefined';
  }

  /**
   * 创建空的 iframe
   */
  private createIframe(pluginName: string): HTMLIFrameElement | null {
    const container = document.getElementById(pluginName);
    if (!container) {
      console.error(`未找到插件容器: ${pluginName}`);
      return null;
    }

    // 清除占位符
    container.innerHTML = '';

    // 创建空的 iframe
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    iframe.style.width = '100%';
    iframe.style.height = '600px';
    iframe.style.border = 'none';
    iframe.style.display = 'block';

    container.appendChild(iframe);
    return iframe;
  }

  /**
   * 渲染 iframe 内容
   */
  private renderIframeContent(pluginName: string, content: string): void {
    const container = document.getElementById(pluginName);
    if (!container) {
      console.error(`未找到插件容器: ${pluginName}`);
      return;
    }

    // 获取或创建 iframe
    let iframe = container.querySelector('iframe') as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = this.createIframe(pluginName);
    }

    if (!iframe) {
      return;
    }

    // 尝试写入内容的函数
    const writeContent = (): void => {
      try {
        const doc = iframe!.contentDocument || iframe!.contentWindow?.document;
        if (!doc) {
          console.error(`无法获取 iframe document: ${pluginName}`);
          return;
        }
        doc.open();
        doc.write(content);
        doc.close();
      } catch (error) {
        console.error(`渲染 iframe 内容失败: ${pluginName}`, error);
        container.innerHTML = `<div class="plugin-placeholder">渲染失败: ${pluginName}</div>`;
      }
    };

    // 如果 iframe 已经加载，直接写入
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc && doc.readyState === 'complete') {
        writeContent();
      } else {
        // 等待 iframe 加载完成后再写入内容
        iframe.onload = function () {
          writeContent();
        };
        // 如果 onload 没有触发，使用 setTimeout 重试
        setTimeout(function () {
          if (iframe?.contentDocument && iframe.contentDocument.readyState === 'complete') {
            writeContent();
          }
        }, 100);
      }
    } catch (error) {
      // 如果访问 document 失败，等待 onload
      iframe.onload = function () {
        writeContent();
      };
    }
  }

  /**
   * 处理来自扩展的消息
   */
  private handleMessage(event: MessageEvent<Message>): void {
    const message = event.data;

    // 处理设置 bin 文件路径的消息
    if (message.command === 'setBinPath') {
      const binPathElement = document.getElementById('binPath');
      if (binPathElement) {
        binPathElement.textContent = String(message.data || '等待加载...');
      }
    }

    // 处理设置 WebSocket 端口的消息
    if (message.command === 'setWsPort') {
      const wsPortElement = document.getElementById('wsPort');
      if (wsPortElement) {
        wsPortElement.textContent = String(message.data || '等待启动...');
      }
    }

    // 处理 iframe 内容渲染消息
    // 消息格式: { command: 'renderIframe', pluginName: 'Cluster', content: '<html>...</html>' }
    if (message.command === 'renderIframe') {
      if (message.pluginName && message.content) {
        this.renderIframeContent(message.pluginName, message.content);
      } else {
        console.error('renderIframe 消息缺少必要字段:', message);
      }
    }

    // 处理 WebSocket 桥接消息（来自 NodeWebviewSocketBridge）
    if (message.type && message.type.startsWith('ws:')) {
      // WebSocket 桥接消息处理
      // 这些消息来自 NodeWebviewSocketBridge，用于 WebSocket 通信
      switch (message.type) {
        case 'ws:opened':
          break;
        case 'ws:message':
          break;
        case 'ws:error':
          console.error('WebSocket error:', message.id, message.reason);
          break;
        case 'ws:closed':
          break;
      }
    }
  }

  /**
   * 通知扩展已准备好接收消息
   */
  private notifyReady(): void {
    if (!this.vscode) {
      return;
    }

    // 通知扩展已准备好接收消息
    this.vscode.postMessage({ command: 'ready' });

    // 通知 node 层可以开始发送 iframe 内容
    this.vscode.postMessage({ command: 'startRenderIframes' });
  }

  /**
   * 初始化插件模式
   * 当环境为 VSCode 插件时才执行
   */
  public init(): void {
    // 检测是否为 VSCode 插件环境
    if (!this.isVSCodePluginEnvironment()) {
      console.log('非 VSCode 插件环境，跳过 pluginModeInit');
      return;
    }

    // 获取 VSCode API
    this.vscode = (window as any).acquireVsCodeApi();

    // 创建消息处理器
    this.messageHandler = (event: MessageEvent<Message>) => {
      this.handleMessage(event);
    };

    // 监听来自扩展的消息
    window.addEventListener('message', this.messageHandler);

    // 页面加载完成后通知 node 层可以开始渲染 iframe
    window.addEventListener('DOMContentLoaded', () => {
      this.notifyReady();
    });

    // 如果 DOMContentLoaded 已经触发，立即发送消息
    if (document.readyState === 'loading') {
      // DOMContentLoaded 尚未触发，等待它
    } else {
      // DOMContentLoaded 已经触发，立即发送消息
      this.notifyReady();
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.vscode = null;
  }
}

/**
 * 初始化插件模式
 * 当环境为 VSCode 插件时才执行
 * @deprecated 请使用 PluginModeInitializer 类
 */
export function pluginModeInit(): void {
  const initializer = new PluginModeInitializer();
  initializer.init();
}

