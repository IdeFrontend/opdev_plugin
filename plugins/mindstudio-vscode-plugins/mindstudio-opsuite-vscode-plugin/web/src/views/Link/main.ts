/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createApp } from 'vue'
import antd from 'ant-design-vue';
import App from './APP.vue'
import 'ant-design-vue/dist/reset.css'

import { message, messageItem } from '../../untils/Message';
const item: messageItem = {
    command: 'iframeSetSSHData',
    callback: (message: any) => localStorage.setItem('sshData', JSON.stringify(message.data ?? []))
}

const getDisposed: messageItem = {
    command: 'iframeGetDisposed',
    callback: (message: any) => {
        localStorage.setItem('isRemote', JSON.stringify(message.data ?? false))
        init();
    }
}

message.addMessageListener(item)
message.addMessageListener(getDisposed)
message.sendMessageToParent({ command: 'vscodeGetssh' });

let vscode = null;
//@ts-ignore
if (typeof acquireVsCodeApi !== 'undefined') {
    //@ts-ignore
    vscode = acquireVsCodeApi();
}


// 监听来自VSCode扩展和iframe的消息
window.addEventListener('message', event => {
    const message = event.data;
    console.log('外层页面接收到的message:', message)
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
    createApp(App).use(antd).mount('#app')
}
//@ts-ignore
if (JSON.stringify(window.chrome) !== '{}') {
    init()
}
