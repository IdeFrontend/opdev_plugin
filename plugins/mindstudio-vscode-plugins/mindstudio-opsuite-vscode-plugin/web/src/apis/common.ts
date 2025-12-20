import { request } from '@/core/request';
import { CheckPathExistsParams } from 'shared:/api-types';

/**
 * 检查路径是否存在
 */
export function checkPathExists(params: CheckPathExistsParams) {
  return request.post<CheckPathExistsParams, boolean>('common/pathExists', params);
}
