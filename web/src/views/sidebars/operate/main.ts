import i18next from 'i18next';
import { createApp } from 'vue';
import App from './app.vue';
import 'ant-design-vue/dist/reset.css';
import '../../../assets/css/tailwind.css';
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

let isInitRun = false;

function init() {
  if (isInitRun) {
    return;
  }

  createApp(App)
    .mount('#app');
  isInitRun = true;
}

init();
