import { request } from '@/core/request';
import {
  DownloadDataParams,
  DeleteNodeParams,
  SelectFolderParams,
  SelectFolderResult,
  SelectFileParams,
  SelectFileResult,
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
export function selectFolder(params?: SelectFolderParams) {
  return request.post<SelectFolderParams | undefined, SelectFolderResult | null>('webview/selectFolder', params);
}

/**
 * 选择文件
 */
export function selectFile(params?: SelectFileParams) {
  return request.post<SelectFileParams | undefined, SelectFileResult | null>('webview/selectFile', params);
}

/**
 * 跳转到文件（webview版本）
 */
export function jumpToFileWebview(params: JumpToFileParams) {
  return request.post<JumpToFileParams, void>('webview/jumpToFile', params);
}
