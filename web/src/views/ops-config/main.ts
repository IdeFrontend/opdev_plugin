import { createApp } from 'vue';
import App from './app.vue';
import 'ant-design-vue/dist/reset.css';
import '../../assets/css/tailwind.css';

//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {
  //@ts-ignore
  window.vscode = acquireVsCodeApi();
}

const app = createApp(App);

app.mount('#app');
