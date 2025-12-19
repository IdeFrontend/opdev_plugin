import { request } from '@/core/request';
import { InstallRemoteExtensionParams, InstallRemoteExtensionResult } from 'shared:/api-types';

/** 安装远程扩展 */
export function installRemoteExtension(remoteConfig: InstallRemoteExtensionParams) {
  return request.post<InstallRemoteExtensionParams, InstallRemoteExtensionResult>('common/installRemoteExtension', remoteConfig);
}
