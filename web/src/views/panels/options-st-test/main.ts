/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import i18next from 'i18next';
import { createApp } from 'vue';

import i18nResource from '@shared/i18n';
import '../../../assets/css/tailwind.css';
import App from './app.vue';

const injectedLanguage = document.documentElement.lang.toLowerCase();
const lang = injectedLanguage.startsWith('zh') ? 'zh-cn' : 'en';

document.documentElement.lang = lang;

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
