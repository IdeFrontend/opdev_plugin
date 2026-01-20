import { request } from '@/core/request';
import {
  GetProjectIdResult,
  GetHomeResult,
  GetProjectSHResult,
  GetLastProjectPathResult,
  GetWorkspaceResult,
} from '@shared/api-types';

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
 * 获取最后项目路径
 */
export function getLastProjectPath() {
  return request.post<undefined, GetLastProjectPathResult>('webview/getLastProjectPath');
}

/**
 * 获取工作区路径
 */
export function getWorkspace() {
  return request.post<undefined, GetWorkspaceResult>('webview/getWorkspace');
}

/**
 * 获取当前项目类型
 */
export function getProjectType() {
  return request.post<undefined, { projectType: string | null; projectTypeName: string }>('webview/getProjectType');
}
