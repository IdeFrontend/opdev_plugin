/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/// <reference types="vite/client" />
/// <reference types="vscode-webview" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<object, object, never>;

  export default component;
}

// Vite 已经提供了这些类型，但为了确保兼容性，我们显式声明
declare module '*.png' {
  const src: string;

  export default src;
}

declare module '*.jpg' {
  const src: string;

  export default src;
}

declare module '*.jpeg' {
  const src: string;

  export default src;
}

declare module '*.svg' {
  const src: string;

  export default src;
}

// 扩展 Window 接口，添加 chrome 属性
interface Window {
  chrome?: {
    webview?: {
      postMessage: (message: any)=> void;
    };
  };
}
