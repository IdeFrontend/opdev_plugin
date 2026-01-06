/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createApp } from 'vue';
import App from './performance-run-data.vue';
import 'ant-design-vue/dist/reset.css';
import '../../assets/css/tailwind.css';

// 监听来自 iframe 的消息
window.addEventListener('message', (event) => {
  const message = event.data;

  if (message.command === 'iframeSetSSHData') {
    localStorage.setItem('sshData', JSON.stringify(message.data));
  } else if (message.command === 'iframeGetDisposed') {
    localStorage.setItem('isRemote', JSON.stringify(message.data));
    init();
  }
});

let isInitRun = false;

// 发送消息给父窗口请求 SSH 数据
window.postMessage({ command: 'vscodeGetssh' }, '*');

//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {
  //@ts-ignore
  window.vscode = acquireVsCodeApi();
}

let vscode = (window as any).vscode;

// 监听来自VSCode扩展和iframe的消息
window.addEventListener('message', (event) => {
  const message = event.data;

  console.log('外层页面接收到的message:', message);
  if (message.command && message.command.indexOf('vscode') === 0) {
    if (vscode) {
      //@ts-ignore
      vscode.postMessage({
        command: message.command,
        message,
      });
    }
  }
});

function init() {
  if (isInitRun) {
    console.log('PerformanceRunData isInitRun is true');

    return;
  }
  createApp(App).mount('#app');
  isInitRun = true;
}
//@ts-ignore
init();
