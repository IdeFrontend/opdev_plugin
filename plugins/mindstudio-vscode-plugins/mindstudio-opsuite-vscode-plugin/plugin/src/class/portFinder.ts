/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as net from 'net';
import * as http from 'http';
import * as https from 'https';

/**
 * 端口查找器 - 负责查找可用的端口
 */
export class PortFinder {
    private readonly requestTimeout = 2000; // 请求超时时间

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
     * 发送HTTP请求检查响应内容
     * @param url 请求的URL
     * @param validator 验证函数，返回true表示是自己的服务
     * @returns 如果是自己的服务返回true，否则返回false
     */
    private async checkService(url: string, validator: (data: string) => boolean): Promise<boolean> {
        return new Promise((resolve) => {
            const protocol = url.startsWith('https') ? https : http;
            const request = protocol.get(url, { timeout: this.requestTimeout }, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                    // 防止接收过多数据，我们只需要检查关键内容
                    if (data.length > 10000) {
                        request.destroy();
                        resolve(false);
                    }
                });
                
                response.on('end', () => {
                    try {
                        const isOurService = validator(data);
                        resolve(isOurService);
                    } catch (error) {
                        resolve(false);
                    }
                });
            });
            
            request.on('error', () => {
                resolve(false);
            });
            
            request.on('timeout', () => {
                request.destroy();
                resolve(false);
            });
        });
    }

    /**
     * 检查是否是自己的前端服务
     * @param port 端口号
     * @returns 如果是自己的前端服务返回true，否则返回false
     */
    private async isOurWebService(port: number): Promise<boolean> {
        try {
            return await this.checkService(
                `http://127.0.0.1:${port}`,
                (data: string) => {
                    // 检查页面title是否包含 "mindistudio opsuite"
                    const titleMatch = data.match(/<title[^>]*>([^<]*)<\/title>/i);
                    return titleMatch ? titleMatch[1].toLowerCase().includes('mindistudio opsuite') : false;
                }
            );
        } catch {
            return false;
        }
    }

    /**
     * 检查是否是自己的后端服务
     * @param port 端口号
     * @returns 如果是自己的后端服务返回true，否则返回false
     */
    private async isOurServerService(port: number): Promise<boolean> {
        try {
            return await this.checkService(
                `http://127.0.0.1:${port}/api/v1/health`,
                (data: string) => {
                    // 健康检查接口只要能正常响应就认为是自己的服务
                    // 如果需要更严格的检查，可以解析JSON验证具体字段
                    try {
                        const result = JSON.parse(data);
                        // 如果有status字段且为ok，确认是自己的服务
                        return result && result.status === 'ok';
                    } catch {
                        // 如果能响应但不是JSON，也认为是自己的服务（根据您的实际情况调整）
                        return data.length > 0;
                    }
                }
            );
        } catch {
            return false;
        }
    }

    /**
     * 查找后端服务端口
     * @param startPort 起始端口号
     * @param maxAttempts 最大尝试次数，默认50
     * @returns 可用的端口号，如果检测到自己的服务则返回-1
     */
    public async findServerPort(startPort: number, maxAttempts: number = 50): Promise<number> {
        console.log(`查找后端可用端口，起始端口: ${startPort}, 最大尝试: ${maxAttempts}`);
        
        for (let port = startPort; port < startPort + maxAttempts; port++) {
            const available = await this.isPortAvailable(port);
            if (available) {
                console.log(`找到后端可用端口: ${port}`);
                return port;
            } else {
                // 端口被占用，检查是否是自己的服务
                const isOurService = await this.isOurServerService(port);
                if (isOurService) {
                    console.log(`检测到自己的后端服务已在端口 ${port} 运行`);
                    return -1;
                }
                // 不是自己的服务，继续查找
                console.log(`端口 ${port} 被其他服务占用，继续查找...`);
            }
        }
        
        throw new Error(`在端口 ${startPort} 到 ${startPort + maxAttempts - 1} 范围内找不到可用后端端口`);
    }

    /**
     * 通用的端口查找方法（保持向后兼容）
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