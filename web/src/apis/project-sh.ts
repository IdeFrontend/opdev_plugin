import { request } from '@/core/request';
import { SaveProjectSHParams } from '@shared/api-types';

/**
 * 保存项目SH脚本
 */
export function saveProjectSH(params: SaveProjectSHParams) {
  return request.post<SaveProjectSHParams, void>(
    'webview/saveProjectSH',
    params,
  );
}
