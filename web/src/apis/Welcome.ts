import { request } from '@/core/request';
import { CreatedProjectParams } from 'shared:/api-types';

/**
 * 创建项目
 */
export function createdProject(params: CreatedProjectParams) {
  return request.post<CreatedProjectParams, void>('webview/createdProject', params);
}

