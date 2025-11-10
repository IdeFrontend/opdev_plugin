import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SSHHelper } from './SSHHelper';
import { ConnectionStatus, RemoteServerConfig } from './types';

export class RemoteServerOpener {
    private sshHelper: SSHHelper;
    private context: vscode.ExtensionContext | undefined;

    constructor(context?: vscode.ExtensionContext) {
        this.sshHelper = new SSHHelper();
        this.context = context;
    }

    /**
     * 打开远程目录
     */
    async open(config: RemoteServerConfig): Promise<boolean> {
        try {
            const { host, port, username, remotePath } = config;

            // 验证必要参数
            if (!host || !username || !remotePath) {
                throw new Error('缺少必要参数: host, username, remotePath');
            }

            // 显示连接进度
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在连接到 ${username}@${host}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });

                // 建立SSH连接并验证目录
                const connection = await this.sshHelper.connect(config);
                
                progress.report({ increment: 60, message: '连接成功，正在打开远程工作区...' });

                // 打开远程工作区
                await this.openRemoteWorkspace(config);

                progress.report({ increment: 100, message: '成功打开远程工作区!' });
            });

            vscode.window.showInformationMessage(`成功连接到 ${username}@${host}`);
            return true;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`连接失败: ${errorMessage}`);
            return false;
        }
    }

    /**
     * 打开远程工作区
     */
    private async openRemoteWorkspace(config: RemoteServerConfig): Promise<void> {
        const { host, port, username, remotePath } = config;
        
        try {
            // 方法1: 使用VSCode的Remote SSH扩展
            await this.openWithRemoteSSH(host, port, username, remotePath);
        } catch (error) {
            // 方法2: 备用方案 - 使用终端连接
            await this.openWithTerminalFallback(host, port, username, remotePath);
        }
    }

    /**
     * 使用Remote SSH扩展打开
     */
    private async openWithRemoteSSH(host: string, port: number, username: string, remotePath: string): Promise<void> {
        try {
            // 更新SSH配置
            await this.updateSSHConfig(host, port, username);
            
            // 构造Remote SSH URI
            const sshConfigName = `${username}@${host}`;
            const remoteUri = vscode.Uri.parse(`vscode-remote://ssh-remote+${sshConfigName}${remotePath}`);
            
            // 打开远程工作区
            await vscode.commands.executeCommand('vscode.openFolder', remoteUri, {
                forceNewWindow: false
            });
            
        } catch (error) {
            throw new Error(`Remote SSH打开失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 更新SSH配置以支持Remote SSH扩展
     */
    private async updateSSHConfig(host: string, port: number, username: string): Promise<void> {
        try {
            const sshDir = path.join(os.homedir(), '.ssh');
            const sshConfigPath = path.join(sshDir, 'config');
            
            // 确保.ssh目录存在
            if (!fs.existsSync(sshDir)) {
                fs.mkdirSync(sshDir, { mode: 0o700 });
            }

            let sshConfig = '';
            
            // 读取现有配置
            if (fs.existsSync(sshConfigPath)) {
                sshConfig = fs.readFileSync(sshConfigPath, 'utf8');
            }
            
            // 检查是否已存在该主机的配置
            const hostIdentifier = `${username}@${host}`;
            const hostConfig = `\nHost ${hostIdentifier}\n    HostName ${host}\n    User ${username}\n    Port ${port}\n`;
            
            if (!sshConfig.includes(`HostName ${host}`) || !sshConfig.includes(`User ${username}`)) {
                // 添加新配置
                fs.appendFileSync(sshConfigPath, hostConfig);
                vscode.window.showInformationMessage(`已更新SSH配置: ${hostIdentifier}`);
            }
        } catch (error) {
            console.warn('更新SSH配置失败:', error);
            // 不抛出错误，继续尝试连接
        }
    }

    /**
     * 备用方案：使用终端连接
     */
    private async openWithTerminalFallback(host: string, port: number, username: string, remotePath: string): Promise<void> {
        vscode.window.showWarningMessage('使用终端方式连接远程服务器');
        
        const terminal = vscode.window.createTerminal('Remote Server');
        terminal.show();
        
        const sshCommand = port === 22 ? 
            `ssh ${username}@${host} -t "cd ${remotePath} && bash --login"` :
            `ssh ${username}@${host} -p ${port} -t "cd ${remotePath} && bash --login"`;
        
        terminal.sendText(sshCommand);
    }

    /**
     * 执行远程命令
     */
    async executeCommand(config: RemoteServerConfig, command: string): Promise<string> {
        try {
            const connection = await this.sshHelper.connect(config);
            const result = await this.sshHelper.executeCommand(connection, command);
            
            if (result.code === 0) {
                return result.stdout;
            } else {
                throw new Error(`命令执行失败: ${result.stderr}`);
            }
        } catch (error) {
            throw new Error(`执行命令失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 关闭连接
     */
    closeConnection(config: RemoteServerConfig): void {
        const { host, port, username } = config;
        this.sshHelper.disconnect(host, port, username);
    }

    /**
     * 关闭所有连接并清理资源
     */
    dispose(): void {
        this.sshHelper.closeAll();
        this.sshHelper.cleanup();
    }

    /**
     * 获取连接状态
     */
    getConnectionStatus(): ConnectionStatus {
        return this.sshHelper.getConnectionStatus();
    }

    /**
     * 测试连接
     */
    async testConnection(config: RemoteServerConfig): Promise<boolean> {
        try {
            const connection = await this.sshHelper.connect(config);
            return await this.sshHelper.testConnection(connection);
        } catch (error) {
            return false;
        }
    }
}