/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import i18next from 'i18next';
import { createApp } from 'vue';
import App from './app.vue';
import 'ant-design-vue/dist/reset.css';
import '../../../assets/css/tailwind.css';
import { vscode } from '@web/utils/vscode';
import i18nResource from '@shared/i18n';
import { getWebviewLang } from '@web/utils/lang';

const lang = getWebviewLang();
void i18next.init({
  resources: i18nResource,
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {

  window.vscode = acquireVsCodeApi();
}

// 监听来自VSCode扩展和iframe的消息
window.addEventListener('message', (event) => {
  const message = event.data;

  console.log('外层页面接收到的message:', message);

  if (message.command.indexOf('vscode') === 0) {
    if (vscode) {

      vscode.postMessage({
        command: message.command,
        message,
      });
    }
  }
});

createApp(App)
  .mount('#app');
