import { request } from '@/core/request';

/** 获取检测异常数据列表 */
export function getMsSanitizerRunData(params: unknown) {
  return request.post<unknown, unknown[]>('msSanitizer/getRunData', params);
}

/** 标记/取消标记 */
export function toggleMsSanitizerMark(params: unknown) {
  return request.post<unknown, unknown>('msSanitizer/toggleMark', params);
}

/** 打开异常检测数据面板 */
export function openMsSanitizerPanel(params: unknown) {
  return request.post<unknown, unknown>('msSanitizer/openPanel', params);
}

/** 复制报告内容到剪贴板 */
export function copyMsSanitizerReport(params: { path: string }) {
  return request.post<{ path: string }, void>('msSanitizer/copyReport', params);
}

/** 下载报告文件 */
export function downloadMsSanitizerReport(params: { path: string }) {
  return request.post<{ path: string }, void>('msSanitizer/downloadReport', params);
}
