import { createApp } from 'vue';

import App from './App.vue';
import { i18nPlugin } from './core/i18n';
import { queryPlugin } from './core/query';

const app = createApp(App);

app.use(i18nPlugin);
app.use(queryPlugin);

app.mount('#app');
