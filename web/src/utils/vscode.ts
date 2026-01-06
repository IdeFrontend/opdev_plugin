interface WebviewApi<StateType> {
  postMessage(message: unknown): void;
  getState(): StateType | undefined;
  setState(newState: StateType): void;
}

declare global {
  interface Window {
    vscode: WebviewApi<unknown>;
  }
}

/**
 * 获取 VSCode Webview API
 * @throws {Error} 如果无法获取 VSCode API，抛出错误
 * @returns {WebviewApi<unknown>} VSCode API 实例
 */
function getVSCodeApi(): WebviewApi<unknown> {
  // 如果已经存在 window.vscode，直接返回
  if (window.vscode) {
    return window.vscode;
  }

  // 尝试获取新的实例
  if (typeof acquireVsCodeApi !== 'undefined') {
    try {
      const api = acquireVsCodeApi();

      window.vscode = api;

      return api;
    }
    catch (error) {
      // 如果已经获取过会抛出错误，从 window 获取已存在的实例
      if (window.vscode) {
        return window.vscode;
      }

      throw new Error('Failed to acquire VSCode API: ' + error);
    }
  }

  // 如果不在 VSCode Webview 环境中，抛出错误
  throw new Error('VSCode API is not available. This application must run inside a VSCode Webview.');
}

/**
 * VSCode Webview API 实例
 * 保证在 VSCode Webview 环境中一定可用，否则会在初始化时抛出错误
 */
export const vscode = getVSCodeApi();
