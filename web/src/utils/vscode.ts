interface WebviewApi<StateType> {
  postMessage(message: unknown): void;
  getState(): StateType | undefined;
  setState(newState: StateType): void;
}

// 安全地获取 VS Code API，避免重复获取
let vscodeInstance: WebviewApi<unknown> | null = null;

declare global {
  interface Window {
    vscode?: WebviewApi<unknown>;
  }
}

if (typeof window !== 'undefined') {
  // 如果已经存在 window.vscode，使用它（避免重复获取）
  if (window.vscode) {
    vscodeInstance = window.vscode;
  } else if (typeof acquireVsCodeApi !== 'undefined') {
    // 否则尝试获取新的实例
    try {
      vscodeInstance = acquireVsCodeApi();
      window.vscode = vscodeInstance;
    } catch {
      // 如果已经获取过会抛出错误，从 window 获取已存在的实例
      vscodeInstance = window.vscode || null;
    }
  }
}

export const vscode = vscodeInstance;
