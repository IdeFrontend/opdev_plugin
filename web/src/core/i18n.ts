import i18next from 'i18next';
import { Plugin } from 'vue';

import i18nResource from 'shared:/i18n';

export const i18nPlugin: Plugin = {
  install(app) {
    i18next.init({
      resources: i18nResource,
      lng: document.documentElement.lang, // 读取<html lang="">
      interpolation: { escapeValue: false },
    });

    app.config.globalProperties.$t = i18next.t;
  },
};
