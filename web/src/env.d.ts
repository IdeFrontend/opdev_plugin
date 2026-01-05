/// <reference types="vite/client" />
/// <reference types="vscode-webview" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<object, object, never>;

  export default component;
}
