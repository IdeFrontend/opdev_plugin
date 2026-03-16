/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import i18next from 'i18next';
import { createApp } from 'vue';
import App from './app.vue';
import { vscode } from '@web/utils/vscode';
import i18nResource from '@shared/i18n';
import '../../../assets/css/tailwind.css';

const lang = (typeof window !== 'undefined' && (window as unknown as { __VSCODE_LANG__?: string }).__VSCODE_LANG__) || 'en';

if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {
  window.vscode = acquireVsCodeApi();
}

let isInitRun = false;

function init() {
  if (isInitRun) return;
  isInitRun = true;
  void i18next.init({
    resources: i18nResource,
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  }).then(() => {
    createApp(App).mount('#app');
  });
}

init();
