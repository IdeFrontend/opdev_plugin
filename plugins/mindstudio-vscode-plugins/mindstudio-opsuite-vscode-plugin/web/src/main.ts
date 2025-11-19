/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createApp } from 'vue'
import './style.css'
import antd from 'ant-design-vue';
import App from './App.vue'
import router from './router'
import 'ant-design-vue/dist/reset.css'

import { message, messageItem } from './untils/Message';
const item: messageItem = {
    command: 'iframeSetSSHData',
    callback: (message: any) => localStorage.setItem('sshData', JSON.stringify(message.data))
}

const getDisposed: messageItem = {
    command: 'iframeGetDisposed',
    callback: (message: any) => localStorage.setItem('isRemote', JSON.stringify(message.data))
}

message.addMessageListener(item)
message.addMessageListener(getDisposed)

message.sendMessageToParent({ command: 'vscodeGetssh' });

createApp(App).use(router).use(antd).mount('#app')
