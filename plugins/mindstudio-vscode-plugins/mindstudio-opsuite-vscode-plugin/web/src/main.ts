import antd from 'ant-design-vue';
import { createApp } from 'vue';

import App from './App.vue';
import { i18nPlugin } from './core/i18n';
import { queryPlugin } from './core/query';

import 'ant-design-vue/dist/reset.css';
import { request } from './core/request';

const app = createApp(App);
app.use(i18nPlugin);
app.use(queryPlugin);
app.use(antd);

// 临时适配command：iframeSetSSHData、iframeSetUserInfo、iframeGetDisposed
request.post<null, any>('common/loadBeforeWebviewRender').then((res) => {
  localStorage.setItem('sshData', JSON.stringify(res.sshData ?? []));
  localStorage.setItem('userInfo', JSON.stringify(res.userInfo ?? []));
  localStorage.setItem('isRemote', JSON.stringify(res.isRemote ?? false));

  app.mount('#app');
});
