/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import i18next from 'i18next';
import { createApp } from 'vue';
import App from './app.vue';
import i18nResource from '@shared/i18n';
import 'ant-design-vue/dist/reset.css';
import '../../../assets/css/tailwind.css';

const lang = (typeof window !== 'undefined' && (window as unknown as { __VSCODE_LANG__?: string }).__VSCODE_LANG__) || 'en';

if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {
  window.vscode = acquireVsCodeApi();
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.command?.indexOf('vscode') === 0 && (window as any).vscode) {
    (window as any).vscode.postMessage({ command: message.command, message });
  }
});

void i18next.init({
  resources: i18nResource,
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
}).then(() => {
  createApp(App).mount('#app');
});
