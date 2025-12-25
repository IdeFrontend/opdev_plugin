// 安全地获取 VS Code API，避免重复获取
let vscodeInstance: any = null;

if (typeof window !== 'undefined') {
  // 如果已经存在 window.vscode，使用它（避免重复获取）
  if ((window as any).vscode) {
    vscodeInstance = (window as any).vscode;
  } else if (typeof acquireVsCodeApi !== 'undefined') {
    // 否则尝试获取新的实例
    try {
      vscodeInstance = acquireVsCodeApi();
      (window as any).vscode = vscodeInstance;
    } catch (error) {
      // 如果已经获取过会抛出错误，从 window 获取已存在的实例
      vscodeInstance = (window as any).vscode || null;
    }
  }
}

export const vscode = vscodeInstance;
