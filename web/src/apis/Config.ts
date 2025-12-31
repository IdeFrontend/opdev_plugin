import { request } from '@/core/request';
import {
  GetBuildConfigResult,
  SaveAndStartBuildParams,
  SaveAndStartBuildExampleParams,
  SetActiveConfigParams,
  GetActiveConfigResult,
  CheckDevtoolConfigResult,
  RemotePathSearchParams,
  RemotePathSearchResult,
  SaveBuildConfigParams,
} from 'shared:/api-types';

/**
 * 获取构建配置（字符串格式）
 */
export function getBuildConfigString() {
  return request.post<undefined, GetBuildConfigResult>('webview/getBuildConfig');
}

/**
 * 保存构建配置（返回字符串格式）
 */
export function saveBuildConfigString(params: SaveBuildConfigParams) {
  return request.post<SaveBuildConfigParams, GetBuildConfigResult>('webview/saveBuildConfig', params);
}

/**
 * 保存并开始构建
 */
export function saveAndStartBuild(params: SaveAndStartBuildParams) {
  return request.post<SaveAndStartBuildParams, void>('webview/saveAndStartBuild', params);
}

/**
 * 保存并开始构建示例
 */
export function saveAndStartBuildExample(params: SaveAndStartBuildExampleParams) {
  return request.post<SaveAndStartBuildExampleParams, void>('webview/saveAndStartBuildExample', params);
}

/**
 * 设置激活的配置
 */
export function setActiveConfig(params: SetActiveConfigParams) {
  return request.post<SetActiveConfigParams, void>('webview/setActiveConfig', params);
}

/**
 * 获取激活的配置
 */
export function getActiveConfig() {
  return request.post<undefined, GetActiveConfigResult>('webview/getActiveConfig');
}

/**
 * 保存配置（webview版本）
 */
export function saveConfigWebview(params: { type: string; data: any }) {
  return request.post<{ type: string; data: any }, void>('webview/saveConfig', params);
}

/**
 * 远程路径搜索
 */
export function remotePathSearch(params: RemotePathSearchParams) {
  return request.post<RemotePathSearchParams, RemotePathSearchResult>('webview/remotePathSearch', params);
}

