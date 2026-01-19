import { request } from '@/core/request';
import {
  BuildOpParams,
  BuildExampleParams,
  RunExampleParams,
  SimulateParams,
  OnBoardParams,
} from '@shared/api-types';

/**
 * 构建算子（webview版本）
 */
export function buildOpWebview(params: BuildOpParams = {}) {
  return request.post<BuildOpParams, void>('webview/buildOp', params);
}

/**
 * 构建示例（webview版本）
 */
export function buildExampleWebview(params: BuildExampleParams = {}) {
  return request.post<BuildExampleParams, void>('webview/buildExample', params);
}

/**
 * 运行示例（webview版本）
 */
export function runExampleWebview(params: RunExampleParams = {}) {
  return request.post<RunExampleParams, void>('webview/runExample', params);
}

/**
 * 仿真（webview版本）
 */
export function simulateWebview(params: SimulateParams = {}) {
  return request.post<SimulateParams, void>('webview/simulate', params);
}

/**
 * 上板（webview版本）
 */
export function onBoardWebview(params: OnBoardParams = {}) {
  return request.post<OnBoardParams, void>('webview/onBoard', params);
}

/**
 * 停止任务（webview版本）
 */
export function stopTaskWebview() {
  return request.post<undefined, void>('webview/stopTask');
}

/**
 * 运行调试
 */
export function runDebug() {
  return request.post<undefined, void>('webview/runDebug');
}

/**
 * 调试配置
 */
export function debugConfig() {
  return request.post<undefined, void>('webview/debugConfig');
}

/**
 * CPU调试
 */
export function runCpuDebug() {
  return request.post<undefined, void>('webview/runCpuDebug');
}

/**
 * CPU调试配置
 */
export function cpuDebugConfig() {
  return request.post<undefined, void>('webview/cpuDebugConfig');
}

/**
 * 检查当前目录下是否有多个算子工程
 */
export function checkMultipleOperators() {
  return request.post<undefined, { hasMultiple: boolean }>('webview/checkMultipleOperators');
}
