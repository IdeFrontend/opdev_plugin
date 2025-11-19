/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as net from 'net';

/**
 * 端口查找器 - 负责查找可用的端口
 */
export class PortFinder {
    /**
     * 检查端口是否可用
     * @param port 要检查的端口号
     * @returns 如果端口可用返回true，否则返回false
     */
    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.listen(port, () => {
                server.close(() => {
                    resolve(true);
                });
            });
            
            server.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false);
                } else {
                    resolve(false);
                }
            });

            // 设置超时
            setTimeout(() => {
                server.close();
                resolve(false);
            }, 100);
        });
    }

    /**
     * 从指定端口开始查找可用的端口
     * @param startPort 起始端口号
     * @param maxAttempts 最大尝试次数，默认50
     * @returns 可用的端口号
     */
    public async findAvailablePort(startPort: number, maxAttempts: number = 50): Promise<number> {
        console.log(`查找可用端口，起始端口: ${startPort}, 最大尝试: ${maxAttempts}`);
        
        for (let port = startPort; port < startPort + maxAttempts; port++) {
            const available = await this.isPortAvailable(port);
            if (available) {
                console.log(`找到可用端口: ${port}`);
                return port;
            }
        }
        
        throw new Error(`在端口 ${startPort} 到 ${startPort + maxAttempts - 1} 范围内找不到可用端口`);
    }
}