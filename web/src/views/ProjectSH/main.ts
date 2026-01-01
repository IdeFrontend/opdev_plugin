/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createApp } from 'vue';
import antd from 'ant-design-vue';
import App from './APP.vue';
import 'ant-design-vue/dist/reset.css';

//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined' && !(window as any).vscode) {
  try {
    //@ts-ignore
    window.vscode = acquireVsCodeApi();
  } catch (error) {
    // 如果已经获取过，忽略错误
    console.warn('VS Code API already acquired:', error);
  }
}

// 监听来自VSCode扩展和iframe的消息
window.addEventListener('message', (event) => {
  const message = event.data;

  console.log('外层页面接收到的message:', message);
  if (message.command && message.command.indexOf('vscode') === 0) {
    const vscode = (window as any).vscode;

    if (vscode) {
      vscode.postMessage({
        command: message.command,
        message,
      });
    }
  }
});

createApp(App).use(antd).mount('#app');
