import { createApp } from 'vue'
import antd from 'ant-design-vue';
import App from './APP.vue'
import 'ant-design-vue/dist/reset.css'
import { message, messageItem } from '../../untils/Message';

const getProjectIdItem: messageItem = {
    command: 'iframeSetProjectId',
    callback: (message: any) => { localStorage.setItem('projectId', message.data); }
}

let isInitRun =false

message.addMessageListener(getProjectIdItem)
message.sendMessageToParent({ command: 'vscodeGetProjectIdBoard' });

let vscode = null;
//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined') {
    //@ts-ignore
    vscode = acquireVsCodeApi();
}

// 监听来自VSCode扩展和iframe的消息
window.addEventListener('message', event => {
    const message = event.data;
    console.log('操作面板-----------外层页面接收到的message:', message)
    if (message.command.indexOf('vscode') === 0) {
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

//@ts-ignore
console.log(JSON.stringify(window?.chrome) !== '{}')
//@ts-ignore
if (JSON.stringify(window?.chrome) !== '{}') {
    init()
}

init()
