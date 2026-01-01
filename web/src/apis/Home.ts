import { request } from '@/core/request';
import {
  GetProjectIdResult,
  GetHomeResult,
  GetProjectSHResult,
  GetLastProjectPathResult,
  GetWorkspaceResult,
} from 'shared:/api-types';

/**
 * 获取项目ID（webview版本）
 */
export function getProjectIdWebview() {
  return request.post<undefined, GetProjectIdResult>('webview/getProjectId');
}

/**
 * 获取HOME目录
 */
export function getHome() {
  return request.post<undefined, GetHomeResult>('webview/getHome');
}

/**
 * 获取项目SH脚本
 */
export function getProjectSH() {
  return request.post<undefined, GetProjectSHResult>('webview/getProjectSH');
}

/**
 * 更新Project
 */
export function updateProject() {
  return request.post<undefined, void>('webview/updateProject');
}

/**
 * 获取最后项目路径
 */
export function getLastProjectPath() {
  return request.post<undefined, GetLastProjectPathResult>(
    'webview/getLastProjectPath',
  );
}

/**
 * 获取工作区路径
 */
export function getWorkspace() {
  return request.post<undefined, GetWorkspaceResult>('webview/getWorkspace');
}
