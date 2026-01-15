/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createApp } from 'vue';
import App from './app.vue';
import { vscode } from '@web/utils/vscode';
import '../../../assets/css/tailwind.css';

if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {

  window.vscode = acquireVsCodeApi();
}

let isInitRun = false;

function init() {
  if (isInitRun) {
    console.log('isInitRun is true');

    return;
  }

  createApp(App)
    .mount('#app');
  isInitRun = true;
}

init();
