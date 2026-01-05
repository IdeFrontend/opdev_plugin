import antd from 'ant-design-vue';
import { createApp } from 'vue';

import App from './app.vue';
import 'ant-design-vue/dist/reset.css';
import '../../assets/css/tailwind.css';

const app = createApp(App);

app.use(antd);
app.mount('#app');
