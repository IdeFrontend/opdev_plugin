import { request } from '@/core/request';
import {
  DownloadDataParams,
  DeleteNodeParams,
  SelectFolderResult,
  JumpToFileParams,
} from '@shared/api-types';

/**
 * 下载数据
 */
export function downloadData(params: DownloadDataParams) {
  return request.post<DownloadDataParams, void>('webview/downloadData', params);
}

/**
 * 删除节点
 */
export function deleteNode(params: DeleteNodeParams) {
  return request.post<DeleteNodeParams, void>('webview/deleteNode', params);
}

/**
 * 选择文件夹
 */
export function selectFolder() {
  return request.post<undefined, SelectFolderResult | null>('webview/selectFolder');
}

/**
 * 跳转到文件（webview版本）
 */
export function jumpToFileWebview(params: JumpToFileParams) {
  return request.post<JumpToFileParams, void>('webview/jumpToFile', params);
}
