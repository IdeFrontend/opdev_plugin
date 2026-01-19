import { request } from '@/core/request';
import {
  BuildCreateOpsParams,
  StartLinkCreateOpsParams,
  OpenProjectParams,
} from '@shared/api-types';

/**
 * 创建算子（通过原型）
 */
export function buildCreateOps(params: BuildCreateOpsParams = {}) {
  return request.post<BuildCreateOpsParams, void>(
    'webview/buildCreateOps',
    params,
  );
}

/**
 * 开始链接创建算子
 */
export function startLinkCreateOps(params: StartLinkCreateOpsParams = {}) {
  return request.post<StartLinkCreateOpsParams, void>(
    'webview/startLinkCreateOps',
    params,
  );
}

/**
 * 打开算子工程
 */
export function openProject(params: OpenProjectParams) {
  return request.post<OpenProjectParams, void>(
    'webview/openProject',
    params,
  );
}
