export interface RemoteServerConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    remotePath: string;
}

export interface ConnectionStatus {
    [key: string]: 'connected' | 'disconnected' | 'connecting' | 'error';
}

export interface SSHCommandResult {
    code: number;
    signal: string | null;
    stdout: string;
    stderr: string;
}

export interface SSHExecCommandResponse {
    code: number| null;
    signal: string | null;
    stdout: string;
    stderr: string;
}