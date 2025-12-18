import { createApp } from 'vue'
import antd from 'ant-design-vue';
import App from './APP.vue'
import 'ant-design-vue/dist/reset.css'
import { message } from '../../untils/Message';

let isInitRun = false

let vscode = null;
//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined') {
    //@ts-ignore
    vscode = acquireVsCodeApi();
}

// 监听来自VSCode扩展和iframe的消息
window.addEventListener('message', event => {
    const message = event.data;
    console.log('性能调优-----------外层页面接收到的message:', message)
    if (message.command && message.command.indexOf('vscode') === 0) {
        if (vscode) {
            //@ts-ignore
            vscode.postMessage({
                command: message.command,
                message
            });
        }
    }
});

function init() {
    if(isInitRun){
        console.log('isInitRun is true')
        return;
    }
    createApp(App).use(antd).mount('#app')
    isInitRun=true;
}

// 在 VSCode webview 环境中，直接初始化
//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined') {
    // VSCode webview 环境，直接初始化
    init()
} else {
    // 浏览器环境，检查 chrome 对象
    //@ts-ignore
    console.log(JSON.stringify(window?.chrome) !== '{}')
    //@ts-ignore
    if (JSON.stringify(window?.chrome) !== '{}') {
        init()
    } else {
        // 如果都不满足，延迟初始化（用于开发环境）
        setTimeout(() => {
            if (!isInitRun) {
                init()
            }
        }, 100)
    }
}

