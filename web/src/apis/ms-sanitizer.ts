import { request } from '@/core/request';

/** 获取检测异常数据列表 */
export function getMsSanitizerRunData(params: unknown) {
  return request.post<unknown, unknown[]>('msSanitizer/getRunData', params);
}

/** 标记/取消标记 */
export function toggleMsSanitizerMark(params: unknown) {
  return request.post<unknown, unknown>('msSanitizer/toggleMark', params);
}

/** 标记/取消标记 */
export function openMsSanitizerPanel(params: unknown) {
  return request.post<unknown, unknown>('msSanitizer/openPanel', params);
}
