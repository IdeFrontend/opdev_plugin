import { request } from '@/core/request';
import {
  SelectFolderParams,
  SelectFolderResult,
  SelectFileParams,
  SelectFileResult,
} from '@shared/api-types';

/**
 * 选择文件夹
 */
export function selectFolder(params?: SelectFolderParams) {
  return request.post<SelectFolderParams | undefined, SelectFolderResult | null>('webview/selectFolder', params);
}

/**
 * 选择文件
 */
export function selectFile(params?: SelectFileParams) {
  return request.post<SelectFileParams | undefined, SelectFileResult | null>('webview/selectFile', params);
}
