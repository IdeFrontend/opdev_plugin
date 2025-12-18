/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client, ConnectConfig, ExecOptions, SFTPWrapper } from 'ssh2';

export interface RemoteServerConfig {
    host: string;
    port?: number;
    username: string;
    password: string;
    privateKey: string;
}

export default class RemoteServer {
    private client: Client;
    private config: RemoteServerConfig;
    private sftp: SFTPWrapper | null = null;
    private isConnected: boolean = false;

    constructor(config: RemoteServerConfig) {
        this.config = {
            port: config?.port || 22,
            ...config
        };
        this.client = new Client();
    }

    /**
     * 连接到远程服务器
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const connectConfig: ConnectConfig = {
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                readyTimeout: 30000
            };

            if (this.config.privateKey) {
                connectConfig.privateKey = fs.readFileSync(this.config.privateKey, 'utf8');
            }
            if (this.config.password) {
                connectConfig.password = this.config.password
            }

            this.client.on('ready', () => {
                console.log('SSH连接已建立');
                this.isConnected = true;
                resolve();
            });

            this.client.on('error', (err: any) => {
                console.error('SSH连接错误:', err);
                reject(err);
            });

            this.client.on('close', () => {
                console.log('SSH连接已关闭');
                this.isConnected = false;
                this.sftp = null;
            });

            this.client.connect(connectConfig);
        });
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        if (this.sftp) {
            this.sftp.end();
        }
        this.client.end();
        this.isConnected = false;
    }

    /**
     * 获取SFTP实例
     */
    private async getSFTP(): Promise<SFTPWrapper> {
        if (this.sftp) {
            return this.sftp;
        }

        return new Promise((resolve, reject) => {
            this.client.sftp((err: any, sftp: any) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.sftp = sftp;
                resolve(sftp);
            });
        });
    }

    /**
     * 上传文件到远程服务器
     * @param localPath 本地文件路径
     * @param remotePath 远程文件路径
     */
    async uploadFile(localPath: string, fileName: string, remotePath: string): Promise<void> {
        if (!this.isConnected) {
            throw new Error('请先连接到服务器');
        }

        const sftp = await this.getSFTP();

        console.log('remotePath', remotePath);
        
        return new Promise((resolve, reject) => {

            this.client.exec(`mkdir -p ${remotePath}`, (err: any) => {
                if (err) {
                    throw new Error(`创建远程文件失败：${err}`);
                }

                console.log('创建目录成功')

                const remoteFilePath = path.posix.join(remotePath, fileName)
                const localFilePath = `${localPath}${fileName}`

                sftp.fastPut(localFilePath, remoteFilePath, (err: any) => {
                    if (err) {
                        throw new Error(`上传远程文件失败：${err}`);
                    }
                    resolve();
                })


            })
        });
    }

    /**
     * 解压远程文件到指定目录
     * @param remoteFilePath 远程压缩文件路径
     * @param extractToPath 解压目标目录
     * @param options 解压选项
     */
    async unzipFile(
        remoteFilePath: string,
        extractToPath: string,
        options: {
            overwrite?: boolean;
            deleteAfterExtract?: boolean;
            zipType?: 'zip' | 'tar' | 'tar.gz';
        } = {}
    ): Promise<void> {
        if (!this.isConnected) {
            throw new Error('请先连接到服务器');
        }

        const {
            overwrite = true,
            deleteAfterExtract = false,
            zipType = 'tar.gz'
        } = options;

        let command: string;

        // 创建目标目录
        await this.executeCommand(`mkdir -p "${extractToPath}"`);

        // 根据压缩类型选择解压命令
        switch (zipType) {
            case 'zip':
                command = `unzip ${overwrite ? '-o' : ''} "${remoteFilePath}" -d "${extractToPath}"`;
                break;
            case 'tar':
                command = `tar -xf "${remoteFilePath}" -C "${extractToPath}"`;
                break;
            case 'tar.gz':
                command = `tar -xzf "${remoteFilePath}" -C "${extractToPath}"`;
                break;
            default:
                throw new Error(`不支持的压缩类型: ${zipType}`);
        }

        console.log(command)

        // 执行解压命令
        await this.executeCommand(command);

        // 如果设置了解压后删除
        if (deleteAfterExtract) {
            await this.executeCommand(`rm -f "${remoteFilePath}"`);
            console.log(`原压缩文件已删除: ${remoteFilePath}`);
        }

        console.log(`文件解压完成: ${remoteFilePath} -> ${extractToPath}`);
    }

    /**
     * 在指定远程目录下执行命令
     * @param command 要执行的命令
     * @param workingDirectory 工作目录
     * @param options 执行选项
     */
    async executeCommand(
        command: string,
        workingDirectory?: string,
        options: ExecOptions = {}
    ): Promise<{ stdout: string; stderr: string; code: number | null }> {
        if (!this.isConnected) {
            throw new Error('请先连接到服务器');
        }

        // 如果有工作目录，先切换到该目录
        let fullCommand = command;
        if (workingDirectory) {
            fullCommand = `cd ${workingDirectory} && ${command}`;
        }

        console.log(fullCommand)

        return new Promise((resolve, reject) => {
            this.client.exec(fullCommand, options, (err: any, stream: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                let stdout = '';
                let stderr = '';
                let code: number | null = null;

                stream.on('data', (data: Buffer) => {
                    stdout += data.toString();
                    console.log(data.toString())
                    if (stdout.indexOf('服务地址') !== -1) {
                        resolve({ stdout, stderr, code });
                    }
                });

                stream.stderr.on('data', (data: Buffer) => {
                    stderr += data.toString();
                });

                stream.on('close', (exitCode: number) => {
                    code = exitCode;

                    if (code === 0) {
                        resolve({ stdout, stderr, code });
                    } else {
                        resolve({ stdout, stderr, code });
                    }
                });

                stream.on('error', (error: any) => {
                    resolve({ stdout, stderr, code });
                });
            });
        });
    }

    /**
     * 检查远程文件或目录是否存在
     * @param remotePath 远程路径
     */
    async exists(remotePath: string): Promise<boolean> {
        if (!this.isConnected) {
            throw new Error('请先连接到服务器');
        }

        const sftp = await this.getSFTP();

        return new Promise((resolve) => {
            sftp.stat(remotePath, (err: any) => {
                resolve(!err);
            });
        });
    }

    /**
     * 创建远程目录
     * @param remotePath 远程目录路径
     */
    async createDirectory(remotePath: string): Promise<void> {
        if (!this.isConnected) {
            throw new Error('请先连接到服务器');
        }

        const sftp = await this.getSFTP();

        return new Promise((resolve, reject) => {
            sftp.mkdir(remotePath, (err: { message: any; } | any) => {
                if (err) {
                    reject(new Error(`创建目录失败: ${err.message}`));
                    return;
                }
                console.log(`目录已创建: ${remotePath}`);
                resolve();
            });
        });
    }

    /**
     * 列出远程目录内容
     * @param remotePath 远程目录路径
     */
    async listDirectory(remotePath: string): Promise<any[]> {
        if (!this.isConnected) {
            throw new Error('请先连接到服务器');
        }

        const sftp = await this.getSFTP();

        return new Promise((resolve, reject) => {
            sftp.readdir(remotePath, (err: { message: any; } | any, list: any[] | PromiseLike<any[]> | any) => {
                if (err) {
                    reject(new Error(`读取目录失败: ${err.message}`));
                    return;
                }
                resolve(list);
            });
        });
    }

    /**
     * 检查连接状态
     */
    getConnectionStatus(): boolean {
        return this.isConnected;
    }

    /**
     * 销毁实例
     */
    destroy(): void {
        this.disconnect();
        this.client.removeAllListeners();
    }
}
