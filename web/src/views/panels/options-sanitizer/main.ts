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
import '../../../assets/css/tailwind.css';
import { getWebviewLang } from '@web/utils/lang';

const lang = getWebviewLang();

void i18next.init({
  resources: i18nResource,
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})
  .then(() => {
    createApp(App)
      .mount('#app');
  });
