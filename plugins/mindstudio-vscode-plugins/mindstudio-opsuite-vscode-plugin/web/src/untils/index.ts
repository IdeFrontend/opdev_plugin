/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { message } from "./Message"

export function getLocalData(key: string) {
    return JSON.parse(localStorage.getItem(key) || '{}')
}

export function setLoaclData(key: string, value: any) {
    localStorage.setItem(key, JSON.stringify(value))
    message.sendMessageToParent({ command: 'vscodeUpdateLocalData', key, value })
}