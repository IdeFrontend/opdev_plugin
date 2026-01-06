import { request } from '@/core/request';
import {
  DownloadDataParams,
  DeleteNodeParams,
  SelectFolderResult,
  JumpToFileParams,
} from 'shared:/api-types';

/**
 * 选择文件夹
 */
export function selectFolder() {
  return request.post<undefined, SelectFolderResult | null>(
    'webview/selectFolder',
  );
}

/**
 * 跳转到文件（webview版本）
 */
export function jumpToFileWebview(params: JumpToFileParams) {
  return request.post<JumpToFileParams, void>('webview/jumpToFile', params);
}
