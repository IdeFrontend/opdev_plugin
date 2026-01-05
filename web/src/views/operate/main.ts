import { createApp } from 'vue';
import antd from 'ant-design-vue';
import App from './app.vue';
import 'ant-design-vue/dist/reset.css';
import '../../assets/css/tailwind.css';

//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined' && !window.vscode) {
  //@ts-ignore
  window.vscode = acquireVsCodeApi();
}

let isInitRun = false;

function init() {
  if (isInitRun) {
    console.log('isInitRun is true');

    return;
  }
  createApp(App).mount('#app');
  isInitRun = true;
}

//@ts-ignore
console.log(JSON.stringify(window?.chrome) !== '{}');
//@ts-ignore
if (JSON.stringify(window?.chrome) !== '{}') {
  init();
}

init();
