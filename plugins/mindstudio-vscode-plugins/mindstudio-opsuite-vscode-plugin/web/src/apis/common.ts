import { request } from '@/core/request';
import { CheckPathExistsParams, SaveFileParams } from 'shared:/api-types';

/**
 * 检查路径是否存在
 */
export function checkPathExists(params: CheckPathExistsParams) {
  return request.post<CheckPathExistsParams, boolean>('common/pathExists', params);
}

/**
 * 保存至本地文件
 */
export function saveFileToLocal(params: SaveFileParams) {
  return request.post<SaveFileParams, boolean>('common/saveFileToLocal', params);
}
