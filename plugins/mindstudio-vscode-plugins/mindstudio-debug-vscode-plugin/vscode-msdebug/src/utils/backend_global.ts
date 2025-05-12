/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { EventEmitter } from 'events';
import * as log4js from 'log4js';

export interface KernelInfo {
    currentKernel?: number;
    kernelType?: 'aic' | 'aiv';
    allKernel?: Array<number>;
    isNpu?: boolean;
}

export interface BackendGlobal {
    kernel: KernelInfo
}

function createKernel(): KernelInfo {
    return {
        currentKernel: 1,
        kernelType: 'aic',
        allKernel: [1],
        isNpu: false
    };
}

const kernel: KernelInfo = createKernel();

const backendGlobal: BackendGlobal = {
    kernel
};

export const globalKernelEvents = new EventEmitter();

export function kernelChangeFocus(isNpu: boolean): void {
    const preIsNpu = backendGlobal.kernel.isNpu;

    setBackendGlobalKernel({ isNpu });

    if (isNpu !== preIsNpu) globalKernelEvents.emit('npuFocus', isNpu);
}

export function setBackendGlobalKernel(data: KernelInfo): void {
    backendGlobal.kernel = {
        ...backendGlobal.kernel,
        ...data
    };

};

export function initBackendGlobal() {
    backendGlobal.kernel = createKernel();
}

let logger = null;

export function initLogger() {
    log4js.configure({
        appenders: {
            console: { type: 'console' },
            file: { type: 'file', filename: 'msdebuglogs/msdebug.log', maxLogSize: 104857600, flags: 'w' }
        },
        categories: {
            default: { appenders: ['console', 'file'], level: 'debug' }
        }
    });

    // 创建 Logger
    logger = log4js.getLogger();
}

export const msdebugLogger = (type, msg) => {
    try {
        if (logger) {
            logger.level = 'debug';
            logger.debug((`[${type}]` + msg).trim());
        }
    } catch (e) {
        console.log(e);
    }
};

export default backendGlobal;