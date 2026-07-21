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
