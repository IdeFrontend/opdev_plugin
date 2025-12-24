import { request } from '@/core/request';

/** 跳转文件路径 */
export function jumpToFile(params) {
  return request.post<any, any>('msSanitizer/jumpToFile', params);
}

/** 获取检测异常数据列表 */
export function getMsSanitizerRunData(params) {
  return request.post<any, any[]>('msSanitizer/getRunData', params);
}

/** 标记/取消标记 */
export function toggleMsSanitizerMark(params) {
  return request.post<any, any>('msSanitizer/toggleMark', params);
}

/** 标记/取消标记 */
export function openMsSanitizerPanel(params) {
  return request.post<any, any>('msSanitizer/openPanel', params);
}
