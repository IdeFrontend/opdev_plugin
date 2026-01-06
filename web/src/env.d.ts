/// <reference types="vite/client" />
/// <reference types="vscode-webview" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<object, object, never>;

  export default component;
}

// 扩展 Window 接口，添加 chrome 属性
interface Window {
  chrome?: {
    webview?: {
      postMessage: (message: any)=> void;
    };
  };
}
