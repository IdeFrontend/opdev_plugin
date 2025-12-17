import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as os from 'os';

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
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public registerCommands(): void {
        const configureSSHCommand = vscode.commands.registerCommand(
            'ssh-key-auto.configure',
            (args?: SSHConfigInput) => this.configureSSH(args)
        );
        this.context.subscriptions.push(configureSSHCommand);
    }

    private async configureSSH(args?: SSHConfigInput): Promise<void> {
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

            const { privateKey, publicKey } = this.generateSSHKeyPair(password);
            const keyName = `id_${serverAddress.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_')}_${port}`;
            const sshDir = path.join(os.homedir(), '.ssh');
            const privateKeyPath = path.join(sshDir, keyName);
            const publicKeyPath = path.join(sshDir, `${keyName}.pub`);

            this.ensureDirectoryExists(sshDir);
            fs.writeFileSync(privateKeyPath, privateKey);
            fs.writeFileSync(publicKeyPath, publicKey);
            fs.chmodSync(privateKeyPath, 0o600);
            fs.chmodSync(publicKeyPath, 0o644);

            await this.uploadPublicKeyToServer(serverAddress, port, username, password, publicKey);
            await this.updateSSHConfig(serverAddress, port, username, privateKeyPath);

            const selection = await vscode.window.showInformationMessage(
                `SSH密钥配置已完成！服务器：${serverAddress}:${port} 用户：${username}`,
                '通过Remote-SSH连接',
                '查看SSH配置'
            );

            if (selection === '通过Remote-SSH连接') {
                await vscode.commands.executeCommand(
                    'workbench.action.remote-ssh.connectToHost',
                    `${username}@${serverAddress}`,
                    { port: parseInt(port) }
                );
            } else if (selection === '查看SSH配置') {
                const configPath = path.join(sshDir, 'config');
                const document = await vscode.workspace.openTextDocument(configPath);
                await vscode.window.showTextDocument(document);
            }

        } catch (error) {
            vscode.window.showErrorMessage(`配置SSH密钥时发生错误：${error}`);
        }
    }

    private generateSSHKeyPair(password: string) {
        const rsaKeyPair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
                cipher: 'aes-256-cbc',
                passphrase: password
            }
        });

        return {
            privateKey: rsaKeyPair.privateKey.toString(),
            publicKey: rsaKeyPair.publicKey.toString()
        };
    }

    private ensureDirectoryExists(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private uploadPublicKeyToServer(
        serverAddress: string,
        port: string,
        username: string,
        password: string,
        publicKey: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const tempPublicKeyPath = path.join(os.tmpdir(), `temp_public_key_${Date.now()}`);
            fs.writeFileSync(tempPublicKeyPath, publicKey);

            const uploadCmd = `sshpass -p '${password}' ssh-copy-id -i "${tempPublicKeyPath}" -p ${port} ${username}@${serverAddress}`;

            child_process.exec(uploadCmd, (error, stdout, stderr) => {
                fs.unlinkSync(tempPublicKeyPath);

                if (error) {
                    this.manualUploadPublicKey(serverAddress, port, username, password, publicKey)
                        .then(() => resolve())
                        .catch(err => reject(err));
                } else {
                    console.log('公钥上传成功：', stdout);
                    resolve();
                }
            });
        });
    }

    private manualUploadPublicKey(
        serverAddress: string,
        port: string,
        username: string,
        password: string,
        publicKey: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const commands = [
                'mkdir -p ~/.ssh',
                `echo "${publicKey.trim()}" >> ~/.ssh/authorized_keys`,
                'chmod 700 ~/.ssh',
                'chmod 600 ~/.ssh/authorized_keys'
            ].join('; ');

            const sshCmd = `printf '%s\\n' "${password}" | ssh -p ${port} -o StrictHostKeyChecking=no ${username}@${serverAddress} '${commands}'`;

            child_process.exec(sshCmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('手动上传错误：', error);
                    reject(error);
                } else {
                    console.log('公钥已手动上传：', stdout);
                    resolve();
                }
            });
        });
    }

    private async updateSSHConfig(
        serverAddress: string,
        port: string,
        username: string,
        privateKeyPath: string
    ): Promise<void> {
        const sshDir = path.join(os.homedir(), '.ssh');
        const configPath = path.join(sshDir, 'config');

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

// 激活入口
export function initSSHKeyAutoConfig(context: vscode.ExtensionContext) {
    console.log('SSH密钥自动配置插件已激活！');
    const plugin = new SSHKeyAutoConfig(context);
    plugin.registerCommands();
}

export function deactivate() {}