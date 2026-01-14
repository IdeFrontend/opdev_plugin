/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createApp } from 'vue';
import App from './app.vue';
import '../../../assets/css/tailwind.css';

function init() {
  createApp(App)
    .mount('#app');
}

init();
