import fs from 'node:fs';
import os from 'node:os';

import * as vscode from 'vscode';

import { PermanentStorage } from 'plugin:/class/PermanentStorage';
import { ApiGroup } from 'plugin:/core/ApiServer';
import {
  CheckPathExistsParams,
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  InstallRemoteExtensionParams,
  InstallRemoteExtensionResult,
} from 'shared:/api-types';
import { RemoteInstaller } from 'plugin:/services/local/RemoteInstaller';
import { PerformanceRunData } from 'plugin:/services/performance/PerformanceRunData';
import RemoteServer from 'plugin:/services/local/RemoteServer';

export const apis: ApiGroup = {
  common: {
    // TODO 页面重构期间临时使用，预加载Webview渲染前的数据
    loadBeforeWebviewRender() {
      return {
        sshData: PermanentStorage.getInstance().get('sshData', []),
        userInfo: os.userInfo(),
        isRemote: vscode.env.remoteName !== undefined,
      };
    },
    installRemoteExtension(params: InstallRemoteExtensionParams): InstallRemoteExtensionResult {
      return new RemoteInstaller(params).installOnRemoteServer();
    },
    pathExists(params: CheckPathExistsParams): Promise<boolean> {
      if (RemoteServer.isRemote()) {
        return new Promise((resolve) => {
          fs.stat(params.path, (err) => {
            resolve(!err);
          });
        });
      } else {
        if (!params.ssh) {
          throw new Error('检查远程目录需要ssh配置');
        }
        return new RemoteServer(params.ssh).connect().then((server) => server.exists(params.path));
      }
    },
  },
  performance: {
    getRunData(params: GetPerformanceRunDataParams): GetPerformanceRunDataResult {
      return { data: PerformanceRunData.getInstance().queryExecutionRecords() };
    },
  },
};
