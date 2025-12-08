/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface messageItem {
    command: string;
    callback: Function
}

let msg: Message | null = null

export default class Message {
    private messageList: messageItem[] = [];
    private isMessageListener: boolean = false;
    constructor() {
        if (msg) {
            return msg;
        }
        this.messageList = [];
        this.isMessageListener = false;
        msg = this;
    }

    addMessageListener(message: messageItem) {
        if (!this.isMessageListener) {
            this.messageListener();
        }
        const item: messageItem | undefined = this.messageList.find(v => v.command === message.command)
        if (item) {
            item.callback = message.callback;
        } else {
            this.messageList.push(message)
        }
    }

    deleteMessageListener(command: string) {
        this.messageList = this.messageList.filter(v => v.command !== command);
    }

    sendMessageToParent(message: Object, origin: string = '*') {
        window.postMessage(message, origin)
    }

    messageListener() {
        if (!this.isMessageListener) {
            window.addEventListener('message', event => {
                const message = event.data;
                for (const messageItem of this.messageList) {
                    if (messageItem.command === message.command) {
                        messageItem.callback(message)
                    }
                }

            });
        }
        this.isMessageListener = true;
    }
}

export const message = new Message()