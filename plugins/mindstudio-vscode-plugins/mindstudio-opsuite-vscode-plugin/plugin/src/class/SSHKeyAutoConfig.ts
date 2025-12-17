import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import RemoteServer from './RemoteServer';

interface SSHConfigInput {
    serverAddress?: string;
    address?: string;
    host?: string;
    port?: string;
    username?: string;
    user?: string;
    password?: string;
    pass?: string;
}

export class SSHKeyAutoConfig {
    private server: RemoteServer;

    constructor(server: RemoteServer) {
        this.server = server;
    }

    public registerCommands(): void {
        // 这里假设上下文由外部传入或不需要注册命令
    }

    public async configureSSH(args?: SSHConfigInput): Promise<void> {
        try {
            let serverAddress: string;
            let port: string;
            let username: string;
            let password: string;

            if (args && typeof args === 'object') {
                serverAddress = args.serverAddress || args.address || args.host || '';
                port = args.port || '22';
                username = args.username || args.user || '';
                password = args.password || args.pass || '';
            } else {
                serverAddress = await vscode.window.showInputBox({
                    prompt: '请输入服务器地址（IP或域名）',
                    placeHolder: '例如：example.com 或 192.168.1.100'
                }) || '';

                if (!serverAddress) {
                    vscode.window.showErrorMessage('服务器地址不能为空');
                    return;
                }

                port = await vscode.window.showInputBox({
                    prompt: '请输入SSH端口号',
                    placeHolder: '22',
                    value: '22'
                }) || '22';

                username = await vscode.window.showInputBox({
                    prompt: '请输入用户名',
                    placeHolder: '用户名'
                }) || '';

                if (!username) {
                    vscode.window.showErrorMessage('用户名不能为空');
                    return;
                }

                password = await vscode.window.showInputBox({
                    prompt: '请输入密码',
                    password: true
                }) || '';

                if (!password) {
                    vscode.window.showErrorMessage('密码不能为空');
                    return;
                }
            }

            if (!serverAddress || !username || !password) {
                vscode.window.showErrorMessage('缺少必要参数：服务器地址、用户名和密码为必填项');
                return;
            }

            // 解析 serverAddress 中是否包含端口
            if (serverAddress.includes(':')) {
                const parts = serverAddress.split(':');
                serverAddress = parts[0];
                port = parts[1];
            }

            // 使用ssh-keygen命令生成密钥对
            const keyName = `id_${serverAddress.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_')}_${port}`;
            const sshDir = path.join(os.homedir(), '.ssh');
            const privateKeyPath = path.join(sshDir, keyName);
            const publicKeyPath = path.join(sshDir, `${keyName}.pub`);

            // 确保SSH目录存在
            this.ensureDirectoryExists(sshDir);

            // 生成密钥对
            if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
                await this.generateSSHKeyPairWithSSHKeygen(keyName, sshDir);
            }

            // 直接使用逐条命令上传方法
            await this.uploadPublicKeyWithSequentialCommands(serverAddress, port, username, password, publicKeyPath);
            await this.updateSSHConfig(serverAddress, port, username, privateKeyPath);

        } catch (error) {
            vscode.window.showErrorMessage(`配置SSH密钥时发生错误：${error}`);
        }
    }

    private ensureDirectoryExists(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private async generateSSHKeyPairWithSSHKeygen(keyName: string, sshDir: string): Promise<void> {
        // 生成密钥对命令（本地执行）
        const keygenCmd = `ssh-keygen -t rsa -b 4096 -N "" -f "${path.join(sshDir, keyName)}"`;
        await new Promise((resolve, reject) => {
            child_process.exec(keygenCmd, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`生成SSH密钥对失败: ${stderr || error.message}`));
                } else {
                    resolve(stdout);
                }
            });
        });

        console.log('SSH密钥对生成成功');
    }

    private async uploadPublicKeyWithSequentialCommands(
        serverAddress: string,
        port: string,
        username: string,
        password: string,
        publicKeyPath: string
    ): Promise<void> {
        // 读取公钥内容
        const publicKeyContent = fs.readFileSync(publicKeyPath, 'utf8');
        
        // 创建临时公钥文件
        const tempPubKeyPath = `/tmp/temp_pub_key_${Date.now()}.pub`;
        
        // 写入公钥到临时文件
        const writePubKeyCmd = `echo '${publicKeyContent.trim()}' > ${tempPubKeyPath}`;
        const writeResult = await this.server.executeCommand(writePubKeyCmd);
        if (writeResult.code !== 0) {
            throw new Error(`写入临时公钥文件失败: ${writeResult.stderr}`);
        }

        // 创建 .ssh 目录
        const createDirCmd = `mkdir -p ~/.ssh`;
        const createDirResult = await this.server.executeCommand(createDirCmd);
        if (createDirResult.code !== 0) {
            throw new Error(`创建 .ssh 目录失败: ${createDirResult.stderr}`);
        }

        // 设置目录权限
        const chmodDirCmd = `chmod 700 ~/.ssh`;
        const chmodDirResult = await this.server.executeCommand(chmodDirCmd);
        if (chmodDirResult.code !== 0) {
            throw new Error(`设置 .ssh 目录权限失败: ${chmodDirResult.stderr}`);
        }

        const res = await this.server.executeCommand(`grep -qzFf ${tempPubKeyPath} .ssh/authorized_keys && echo "1" || echo "0"`)
        console.log(res);
        console.log('findout', res.stdout, res.stdout === "0\n");
        
        if (res.stdout === "0\n") {
            // 将公钥追加到 authorized_keys
            const appendCmd = `cat ${tempPubKeyPath} >> ~/.ssh/authorized_keys`;
            const appendResult = await this.server.executeCommand(appendCmd);
            if (appendResult.code !== 0) {
                throw new Error(`合并公钥到 authorized_keys 失败: ${appendResult.stderr}`);
            }
            // 设置 authorized_keys 权限
            const chmodFileCmd = `chmod 600 ~/.ssh/authorized_keys`;
            const chmodFileResult = await this.server.executeCommand(chmodFileCmd);
            if (chmodFileResult.code !== 0) {
                throw new Error(`设置 authorized_keys 权限失败: ${chmodFileResult.stderr}`);
            }
    
            // 确保所有者是当前用户
            const chownCmd = `chown $USER:$USER ~/.ssh ~/.ssh/authorized_keys`;
            const chownResult = await this.server.executeCommand(chownCmd);
            if (chownResult.code !== 0) {
                console.warn(`设置文件所有者失败: ${chownResult.stderr}`);
            }
        }


        // 删除临时文件
        const rmTempCmd = `rm ${tempPubKeyPath}`;
        const rmTempResult = await this.server.executeCommand(rmTempCmd);
        if (rmTempResult.code !== 0) {
            console.warn(`删除临时文件失败: ${rmTempResult.stderr}`);
        }

        console.log('SSH密钥配置完成');
    }

    private async updateSSHConfig(
        serverAddress: string,
        port: string,
        username: string,
        privateKeyPath: string
    ): Promise<void> {
        const sshDir = path.join(os.homedir(), '.ssh');
        const configPath = path.join(sshDir, 'config');

        // 确保SSH目录存在
        this.ensureDirectoryExists(sshDir);

        let configContent = '';
        if (fs.existsSync(configPath)) {
            configContent = fs.readFileSync(configPath, 'utf8');
        }

        const hostPattern = new RegExp(`^Host\\s+${serverAddress.replace(/\./g, '\\.')}$`, 'mi');
        if (hostPattern.test(configContent)) {
            const startMatch = configContent.match(new RegExp(`^Host\\s+${serverAddress.replace(/\./g, '\\.')}$.*?^(?=Host|$)`, 'msi'));
            if (startMatch) {
                const beforeMatch = configContent.substring(0, startMatch.index!);
                const afterMatch = configContent.substring(startMatch.index! + startMatch[0].length);
                configContent = beforeMatch + afterMatch;
            }
        }

        const newConfig = `\nHost ${serverAddress}
    HostName ${serverAddress}
    Port ${port}
    User ${username}
    IdentityFile ${privateKeyPath}
    IdentitiesOnly yes\n`;

        configContent += newConfig;
        fs.writeFileSync(configPath, configContent);
        fs.chmodSync(configPath, 0o600);
    }
}

