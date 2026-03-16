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

void i18next.init({
  resources: i18nResource,
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
}).then(() => {
  createApp(App).mount('#app');
});
