/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createApp } from 'vue';
import antd from 'ant-design-vue';
import App from './app.vue';
import 'ant-design-vue/dist/reset.css';
import '../../assets/css/tailwind.css';
import { vscode } from '@/utils/vscode';

//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {
  //@ts-ignore
  window.vscode = acquireVsCodeApi();
}

// 监听来自VSCode扩展和iframe的消息
window.addEventListener('message', (event) => {
  const message = event.data;

  console.log('外层页面接收到的message:', message);
  if (message.command.indexOf('vscode') === 0) {
    if (vscode) {
      //@ts-ignore
      vscode.postMessage({
        command: message.command,
        message,
      });
    }
  }
});

createApp(App).mount('#app');
