import { request } from '@/core/request';
import {
  GetSanitizerFormResult,
  SaveSanitizerFormParams,
  RunSanitizerParams,
} from 'shared:/api-types';

/**
 * 获取 Sanitizer 配置（字符串格式）
 */
export function getSanitizerFormString() {
  return request.post<undefined, GetSanitizerFormResult>(
    'webview/getSanitizerForm',
  );
}

/**
 * 保存 Sanitizer 配置（返回字符串格式）
 */
export function saveSanitizerFormString(params: SaveSanitizerFormParams) {
  return request.post<SaveSanitizerFormParams, GetSanitizerFormResult>(
    'webview/saveSanitizerForm',
    params,
  );
}

/**
 * 运行 Sanitizer（webview版本）
 */
export function runSanitizerWebview(params: RunSanitizerParams = {}) {
  return request.post<RunSanitizerParams, void>('webview/runSanitizer', params);
}
