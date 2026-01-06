import { request } from '@/core/request';
import {
  RemotePathSearchParams,
  RemotePathSearchResult,
} from 'shared:/api-types';

/**
 * 远程路径搜索
 */
export function remotePathSearch(params: RemotePathSearchParams) {
  return request.post<RemotePathSearchParams, RemotePathSearchResult>(
    'webview/remotePathSearch',
    params,
  );
}
