import { createApp } from 'vue';
import App from './app.vue';
import 'ant-design-vue/dist/reset.css';
import '../../../assets/css/tailwind.css';

if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {

  window.vscode = acquireVsCodeApi();
}

let isInitRun = false;

function init() {
  if (isInitRun) {
    console.log('isInitRun is true');

    return;
  }

  createApp(App)
    .mount('#app');
  isInitRun = true;
}

if (JSON.stringify((window as any)?.chrome) !== '{}') {
  init();
}

init();
