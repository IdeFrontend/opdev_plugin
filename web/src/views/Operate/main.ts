import { createApp } from 'vue'
import antd from 'ant-design-vue';
import App from './APP.vue'
import 'ant-design-vue/dist/reset.css'

let isInitRun = false

function init() {
    if (isInitRun) {
        console.log('isInitRun is true')
        return;
    }
    createApp(App).use(antd).mount('#app')
    isInitRun = true;
}

//@ts-ignore
console.log(JSON.stringify(window?.chrome) !== '{}')
//@ts-ignore
if (JSON.stringify(window?.chrome) !== '{}') {
    init()
}

init()
