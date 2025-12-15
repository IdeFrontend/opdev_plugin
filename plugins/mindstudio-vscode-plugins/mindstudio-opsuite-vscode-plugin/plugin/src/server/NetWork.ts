/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import HttpClient from '../class/HttpClient';
import * as os from 'os';

let netWork: NetWork | null = null;
import { CommandExecutor } from '../class/CommandOptions';
import packageJson from '../../../package.json';


export default class NetWork {

    private server: any;
    public executor: CommandExecutor | undefined;

    constructor() {
        if (netWork) {
            return netWork;
        }
        this.server = null;
        this.executor = new CommandExecutor();
        netWork = this;
    }

    async getServer() {
        if (this.server) {
            return this.server;
        }
        for (let port = 3000; port < 4000; port++) {
            this.server = await this.testPort(port);
            if (this.server) {
                console.log('getServer port', port);
                break;
            } else if (this.server === -1) {
                const publisher = packageJson.publisher;
                const extensionName = packageJson.name;
                const version = packageJson.version;
                const extensionsPath = '.vscode-server/extensions/';
                const serviceFile = 'vscode_local_service';
                const pluigExtensionsPath = `${extensionsPath}${publisher}.${extensionName}-${version}`;
                const commandPath = `${pluigExtensionsPath}/out/server`;
                this.executor && await this.executor.execute(`chmod u+x ${commandPath}/${serviceFile}`);
                this.executor && await this.executor.execute(`${commandPath}/${serviceFile}  server --port ${port}`);
                await new Promise((reslove) => {
                    setTimeout(() => {
                        reslove(0);
                    }, 1000);
                });
                this.server = await this.testPort(port);
                if (this.server) {
                    console.log('getServer port', port);
                    break;
                }
            }
        }
        return this.server;
    }

    async testPort(port: number) {
        console.log(`尝试连接端口：${port}`);
        const host = 'http://127.0.0.1';
        const local = new HttpClient(`${host}:${port}`);
        const result = await local.get('/api/v1/health');
        console.log(port, result);
        if (result.code === 1) {
            return -1;
        }
        if (result?.data?.user !== os.userInfo().username) {
            return false;
        }
        return local;
    }
}