import * as fs from 'fs';
import { NodeSSH } from 'node-ssh';
import * as os from 'os';
import * as path from 'path';
import { ConnectionStatus, RemoteServerConfig, SSHExecCommandResponse } from './types';


export class SSHHelper {
    private ssh: NodeSSH;
    private connectionCache: Map<string, NodeSSH>;
    private tempKeyDir: string;

    constructor() {
        this.ssh = new NodeSSH();
        this.connectionCache = new Map();
        this.tempKeyDir = path.join(os.tmpdir(), 'vscode-remote-keys');

        // 确保临时目录存在
        if (!fs.existsSync(this.tempKeyDir)) {
            fs.mkdirSync(this.tempKeyDir, { recursive: true });
        }
    }

    /**
     * 建立SSH连接
     */
    async connect(config: RemoteServerConfig): Promise<NodeSSH> {
        const { host, port, username, password, privateKey } = config;
        const connectionKey = `${username}@${host}:${port}`;

        // 检查是否有缓存的连接
        if (this.connectionCache.has(connectionKey)) {
            const cachedConnection = this.connectionCache.get(connectionKey);
            if (cachedConnection && await this.testConnection(cachedConnection)) {
                return cachedConnection;
            }
            this.connectionCache.delete(connectionKey);
        }

        const sshConfig: any = {
            host: host,
            port: port || 22,
            username: username,
            readyTimeout: 20000,
            tryKeyboard: true
        };

        let connection: NodeSSH;

        try {
            if (privateKey) {
                connection = await this.connectWithPrivateKey(sshConfig, privateKey);
            } else if (password) {
                connection = await this.connectWithPassword(sshConfig, password);
            } else {
                throw new Error('必须提供密码或私钥');
            }

            // 验证远程目录
            await this.validateRemotePath(connection, config.remotePath);

            // 缓存连接
            this.connectionCache.set(connectionKey, connection);
            return connection;

        } catch (error) {
            throw new Error(`SSH连接失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 使用私钥连接
     */
    private async connectWithPrivateKey(sshConfig: any, privateKeyPath: string): Promise<NodeSSH> {
        if (!fs.existsSync(privateKeyPath)) {
            throw new Error(`私钥文件不存在: ${privateKeyPath}`);
        }

        sshConfig.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        const ssh = new NodeSSH();
        return await ssh.connect(sshConfig);
    }

    /**
     * 使用密码连接
     */
    private async connectWithPassword(sshConfig: any, password: string): Promise<NodeSSH> {
        try {
            sshConfig.password = password;
            const ssh = new NodeSSH();
            return await ssh.connect(sshConfig);
        } catch (error) {
            // 如果密码认证失败，尝试将密码转换为临时密钥
            if (error instanceof Error && error.message.includes('Authentication failed')) {
                return await this.connectWithPasswordAsKey(sshConfig, password);
            }
            throw error;
        }
    }

    /**
     * 将密码作为临时密钥进行连接（简化实现）
     */
    private async connectWithPasswordAsKey(sshConfig: any, password: string): Promise<NodeSSH> {
        try {
            // 在实际应用中，这里应该调用SSH密钥生成工具
            // 这里简化处理，实际使用时需要更安全的实现
            const tempKeyPath = await this.generateTempKeyFromPassword(password);

            sshConfig.privateKey = fs.readFileSync(tempKeyPath, 'utf8');
            const ssh = new NodeSSH();
            const connection = await ssh.connect(sshConfig);

            // 连接成功后清理临时密钥
            this.cleanupTempKey(tempKeyPath);

            return connection;
        } catch (error) {
            throw new Error(`密码转换为密钥失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 生成临时密钥文件（简化实现）
     */
    private async generateTempKeyFromPassword(password: string): Promise<string> {
        const tempKeyPath = path.join(this.tempKeyDir, `temp_key_${Date.now()}`);

        // 在实际应用中，这里应该调用系统SSH密钥生成工具
        // 例如: ssh-keygen -t rsa -f tempKeyPath -N password
        // 这里创建一个模拟的密钥文件
        const mockKeyContent = this.createMockKeyContent();
        fs.writeFileSync(tempKeyPath, mockKeyContent);
        fs.chmodSync(tempKeyPath, 0o600); // 设置权限为仅用户可读写

        return tempKeyPath;
    }

    /**
     * 创建模拟密钥内容
     */
    private createMockKeyContent(): string {
        return `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAYEAtL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8r
L8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8r
L8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8rL8r
-----END OPENSSH PRIVATE KEY-----`;
    }

    /**
     * 清理临时密钥文件
     */
    private cleanupTempKey(keyPath: string): void {
        try {
            if (fs.existsSync(keyPath)) {
                fs.unlinkSync(keyPath);
            }
        } catch (error) {
            console.warn('清理临时密钥失败:', error);
        }
    }

    /**
     * 测试连接是否有效
     */
    async testConnection(connection: NodeSSH): Promise<boolean> {
        try {
            const result = await connection.execCommand('echo "connection test"');
            return result.code === 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * 验证远程目录
     */
    async validateRemotePath(connection: NodeSSH, remotePath: string): Promise<void> {
        try {
            const result = await connection.execCommand(`cd "${remotePath}" && pwd`);
            if (result.code !== 0) {
                throw new Error(`远程目录不存在或无法访问: ${remotePath}`);
            }
        } catch (error) {
            throw new Error(`无法访问远程目录: ${remotePath} - ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 执行远程命令
     */
    async executeCommand(connection: NodeSSH, command: string): Promise<SSHExecCommandResponse> {
        try { 
            return await connection.execCommand(command);
        } catch (error) {
            throw new Error(`命令执行失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 关闭指定连接
     */
    disconnect(host: string, port: number, username: string): void {
        const connectionKey = `${username}@${host}:${port}`;
        if (this.connectionCache.has(connectionKey)) {
            const connection = this.connectionCache.get(connectionKey);
            if (connection) {
                connection.dispose();
            }
            this.connectionCache.delete(connectionKey);
        }
    }

    /**
     * 关闭所有连接
     */
    closeAll(): void {
        for (const [key, connection] of this.connectionCache) {
            try {
                connection.dispose();
            } catch (error) {
                console.warn(`关闭连接 ${key} 失败:`, error);
            }
        }
        this.connectionCache.clear();
    }

    /**
     * 获取连接状态
     */
    getConnectionStatus(): ConnectionStatus {
        const status: ConnectionStatus = {};
        for (const [key] of this.connectionCache) {
            status[key] = 'connected';
        }
        return status;
    }

    /**
     * 清理临时目录
     */
    cleanup(): void {
        try {
            if (fs.existsSync(this.tempKeyDir)) {
                fs.rmSync(this.tempKeyDir, { recursive: true, force: true });
            }
        } catch (error) {
            console.warn('清理临时目录失败:', error);
        }
    }
}