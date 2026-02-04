/**
 * Copyright (c) 2026 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createApp } from 'vue';
import App from './dump-tensot-data.vue';
import 'ant-design-vue/dist/reset.css';
import '../../../assets/css/tailwind.css';

let isInitRun = false;

function init() {
  if (isInitRun) {
    console.log('DumpTensorData isInitRun is true');
    return;
  }

  createApp(App)
    .mount('#app');
  isInitRun = true;
}

init();
