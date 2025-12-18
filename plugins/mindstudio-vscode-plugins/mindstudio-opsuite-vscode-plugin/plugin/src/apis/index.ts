import os from 'node:os';

import * as vscode from 'vscode';

import { PermanentStorage } from 'plugin:/class/PermanentStorage';
import { ApiGroup } from 'plugin:/core/ApiServer';
import { InstallRemoteExtensionParams, InstallRemoteExtensionResult } from 'shared:/api-types';
import { RemoteInstaller } from 'plugin:/services/local/RemoteInstaller';

export const apis: ApiGroup = {
  common: {
    // TODO 页面重构期间临时使用，预加载Webview渲染前的数据
    loadBeforeWebviewRender: () => {
      return {
        sshData: PermanentStorage.getInstance().get('sshData', []),
        userInfo: os.userInfo(),
        isRemote: vscode.env.remoteName !== undefined,
      };
    },
    installRemoteExtension: (params:InstallRemoteExtensionParams): InstallRemoteExtensionResult => {
      return new RemoteInstaller(params).installOnRemoteServer();
    }
  },
};
