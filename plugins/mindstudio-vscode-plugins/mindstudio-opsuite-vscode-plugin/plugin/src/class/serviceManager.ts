/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import { PortFinder } from './portFinder';

let serviceManager: ServiceManager | null = null;

/**
 * 服务管理器 - 负责启动和管理前后端服务
 * 后端服务现在为可执行文件
 */
export class ServiceManager implements vscode.Disposable {
    private frontendProcess: cp.ChildProcess | undefined;
    private backendProcess: cp.ChildProcess | undefined;
    private frontendPort: number | undefined;
    private backendPort: number | undefined;
    private portFinder: PortFinder | undefined;
    public static: string | undefined;

    constructor(private context: vscode.ExtensionContext) {
        console.log('ServiceManager 初始化');
        if (serviceManager) {
            return serviceManager
        }
        this.portFinder = new PortFinder();
        this.static = 'end'
        serviceManager = this;

    }

    /**
     * 启动所有服务
     */
    public async startServices(): Promise<{ frontendPort: number; backendPort: number }> {
        console.log('开始启动服务...');
        try {
            // 查找可用端口
            this.backendPort = await this.portFinder?.findAvailablePort(3000);
            this.frontendPort = await this.portFinder?.findAvailablePort(8000);

            console.log(`找到可用端口 - 前端: ${this.frontendPort}, 后端: ${this.backendPort}`);

            // 启动后端可执行文件服务
            await this.startBackendService();

            // 启动前端静态文件服务
            await this.startFrontendService();

            console.log('所有服务启动完成');

            this.static = 'start'

            return {
                frontendPort: this.frontendPort || 3000,
                backendPort: this.backendPort || 8000
            };
        } catch (error) {
            console.error('启动服务失败:', error);
            vscode.window.showErrorMessage(`启动服务失败: ${error}`);
            throw error;
        }
    }

    /**
     * 启动后端可执行文件服务
     */
    private async startBackendService(): Promise<void> {
        console.log('启动后端可执行文件服务...');

        return new Promise(async (resolve, reject) => {
            try {
                const serverDir = path.join(this.context.extensionPath, 'server');
                const executablePath = path.join(serverDir, 'vscode_local_service.exe');

                console.log('后端服务目录:', serverDir);
                console.log('可执行文件路径:', executablePath);

                // 检查可执行文件是否存在
                try {
                    await fs.promises.access(executablePath);
                    console.log('找到后端可执行文件');
                } catch (err) {
                    console.error('后端可执行文件不存在:', executablePath);
                    // 尝试使用同步方法再次检查
                    if (!fs.existsSync(executablePath)) {
                        // 读取目录，看看dist目录下有什么文件
                        const distDir = path.dirname(executablePath);
                        try {
                            const files = fs.readdirSync(distDir);
                            console.error(`目录 ${distDir} 中的文件:`, files);
                        } catch (readDirErr) {
                            console.error(`读取目录 ${distDir} 失败:`, readDirErr);
                        }
                        reject(new Error(`后端可执行文件不存在: ${executablePath}`));
                        return;
                    } else {
                        // 同步检查存在，说明可能是权限问题，但我们还是继续启动
                        console.log('同步检查文件存在，继续启动');
                    }
                }

                console.log(`启动后端服务在端口 ${this.backendPort}...`);

                // 启动可执行文件
                // 在Windows下，直接运行exe文件[citation:1]
                this.backendProcess = cp.spawn(executablePath, [`-p ${this.backendPort}`], {
                    cwd: path.join(serverDir, 'dist'), // 在工作目录为dist文件夹
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true // 在Windows下隐藏子进程窗口
                });

                // 处理标准输出
                this.backendProcess.stdout?.on('data', (data) => {
                    const output = data.toString().trim();
                    console.log(`[后端服务] ${output}`);

                    // 检测服务启动消息（根据您的可执行文件的实际输出调整）
                    if (output.includes('启动') ||
                        output.includes('启动成功') ||
                        output.includes('Server started') ||
                        output.includes('Running on') ||
                        output.includes('Listening on')) {
                        console.log('检测到后端服务启动成功消息');
                    }
                });

                // 处理错误输出
                this.backendProcess.stderr?.on('data', (data) => {
                    const error = data.toString().trim();
                    console.error(`[后端服务错误] ${error}`);
                });

                // 处理进程错误
                this.backendProcess.on('error', (error) => {
                    console.error('后端服务进程错误:', error);
                    reject(error);
                });

                // 处理进程退出
                this.backendProcess.on('exit', (code, signal) => {
                    if (code !== 0) {
                        console.error(`后端服务异常退出，代码: ${code}, 信号: ${signal}`);
                        // 不要在这里reject，因为可能是正常退出
                    } else {
                        console.log('后端服务正常退出');
                    }
                });

                // 等待服务真正启动 - 通过端口检测
                await this.waitForServiceStart(this.backendPort!, 20000);
                console.log('后端服务启动成功，端口已监听');
                resolve();

            } catch (error) {
                console.error('启动后端服务失败:', error);
                reject(error);
            }
        });
    }

    /**
     * 启动前端静态文件服务
     */
    private async startFrontendService(): Promise<void> {
        console.log('启动前端静态文件服务...');

        return new Promise(async (resolve, reject) => {
            try {
                const serverDir = path.join(this.context.extensionPath, 'server');
                const staticServerPath = path.join(serverDir, 'static_server.js');
                const webDistPath = path.join(this.context.extensionPath, 'web', 'dist');

                console.log('静态服务器脚本路径:', staticServerPath);
                console.log('前端静态文件目录:', webDistPath);

                // 检查静态服务器脚本是否存在
                try {
                    await fs.promises.access(staticServerPath);
                    console.log('找到静态服务器脚本');
                } catch (err) {
                    console.error('静态服务器脚本不存在:', staticServerPath);
                    reject(new Error(`静态服务器脚本不存在: ${staticServerPath}`));
                    return;
                }

                // 检查前端静态文件目录是否存在
                try {
                    await fs.promises.access(webDistPath);
                    console.log('找到前端静态文件目录');
                } catch (err) {
                    console.warn('前端静态文件目录不存在，尝试使用源码目录:', webDistPath);
                    // 如果 dist 目录不存在，尝试使用 web 目录本身
                    const webPath = path.join(this.context.extensionPath, 'web');
                    try {
                        await fs.promises.access(webPath);
                        console.log('使用前端源码目录作为静态文件目录');
                    } catch (webErr) {
                        console.error('前端目录也不存在:', webPath);
                        // 继续执行，静态服务器会处理目录不存在的情况
                    }
                }

                // 设置环境变量
                const env = {
                    ...process.env,
                    PORT: this.frontendPort!.toString(),
                    STATIC_PATH: webDistPath
                };

                console.log(`启动前端静态文件服务在端口 ${this.frontendPort}...`);

                // 启动静态文件服务器
                this.frontendProcess = cp.spawn('node', [staticServerPath], {
                    cwd: serverDir,
                    env: env,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                // 处理标准输出
                this.frontendProcess.stdout?.on('data', (data) => {
                    const output = data.toString().trim();
                    console.log(`[前端静态服务] ${output}`);

                    // 检测服务启动消息
                    if (output.includes('静态文件服务器已启动')) {
                        console.log('检测到前端静态服务启动成功消息');
                    }
                });

                // 处理错误输出
                this.frontendProcess.stderr?.on('data', (data) => {
                    const error = data.toString().trim();
                    console.error(`[前端静态服务错误] ${error}`);
                });

                // 处理进程错误
                this.frontendProcess.on('error', (error) => {
                    console.error('前端静态服务进程错误:', error);
                    reject(error);
                });

                // 处理进程退出
                this.frontendProcess.on('exit', (code, signal) => {
                    if (code !== 0) {
                        console.error(`前端静态服务异常退出，代码: ${code}, 信号: ${signal}`);
                    } else {
                        console.log('前端静态服务正常退出');
                    }
                });

                // 等待服务真正启动 - 通过端口检测
                await this.waitForServiceStart(this.frontendPort!, 15000);
                console.log('前端静态服务启动成功，端口已监听');
                resolve();

            } catch (error) {
                console.error('启动前端静态服务失败:', error);
                reject(error);
            }
        });
    }

    /**
     * 等待服务启动（通过端口检测）
     */
    private async waitForServiceStart(port: number, timeout: number = 20000): Promise<void> {
        console.log(`等待服务在端口 ${port} 启动，超时: ${timeout}ms`);

        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let attempts = 0;

            const checkPort = () => {
                const currentTime = Date.now();
                attempts++;

                // 检查超时
                if (currentTime - startTime > timeout) {
                    reject(new Error(`等待服务启动超时 (${timeout}ms)，尝试次数: ${attempts}`));
                    return;
                }

                // 尝试连接
                const client = new net.Socket();
                const connectTimeout = setTimeout(() => {
                    client.destroy();
                    // 连接超时，继续等待
                    setTimeout(checkPort, 500);
                }, 1000);

                client.connect(port, '127.0.0.1', () => {
                    clearTimeout(connectTimeout);
                    console.log(`端口 ${port} 已可连接，服务已启动 (尝试次数: ${attempts})`);
                    client.destroy();
                    resolve();
                });

                client.on('error', (err) => {
                    clearTimeout(connectTimeout);
                    client.destroy();
                    // 端口还未监听，继续等待
                    setTimeout(checkPort, 500);
                });
            };

            checkPort();
        });
    }

    /**
     * 检查后端服务健康状态
     */
    public async checkBackendHealth(): Promise<boolean> {
        if (!this.backendPort) return false;

        try {
            // 简单的健康检查，尝试连接端口
            await this.waitForServiceStart(this.backendPort, 3000);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 停止所有服务
     */
    public stopServices(): void {
        console.log('停止所有服务...');

        if (this.frontendProcess) {
            console.log('停止前端静态服务');
            this.frontendProcess.kill('SIGTERM');
            this.frontendProcess = undefined;
        }

        if (this.backendProcess) {
            console.log('停止后端服务');
            // 在Windows下使用taskkill命令确保进程被终止[citation:1]
            if (process.platform === 'win32') {
                try {
                    cp.execSync(`taskkill /pid ${this.backendProcess.pid} /T /F`);
                    console.log('后端服务进程已被强制终止');
                } catch (error) {
                    console.warn('终止后端服务进程时发生错误:', error);
                    // 如果taskkill失败，回退到普通kill
                    this.backendProcess.kill('SIGTERM');
                }
            } else {
                this.backendProcess.kill('SIGTERM');
            }
            this.backendProcess = undefined;
        }
    }

    /**
     * 获取前端服务URL
     */
    public getFrontendUrl(router: string = ''): string {
        const url = `http://localhost:${this.frontendPort}/#/${router}?backendPort=${this.backendPort}`;
        console.log('前端服务URL2:', url);
        return url;
    }

    /**
     * 获取后端服务URL
     */
    public getBackendUrl(): string {
        const url = `http://localhost:${this.backendPort}`;
        console.log('后端服务URL:', url);
        return url;
    }

    /**
     * 获取服务状态信息
     */
    public getServiceStatus(): { backend: string; frontend: string } {
        return {
            backend: this.backendProcess ? '运行中' : '已停止',
            frontend: this.frontendProcess ? '运行中' : '已停止'
        };
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        console.log('ServiceManager dispose');
        this.stopServices();
    }
}