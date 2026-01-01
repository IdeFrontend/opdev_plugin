/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface RemoteServerConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  query?: string;
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
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}
