import {
  GetConfigDataResult,
  SaveConfigParams,
  SaveSanitizerFormParams,
  BuildConfig,
} from '@shared/api-types';

import { request } from '@/core/request';

/** 获取配置数据 */
export function getConfigData(opName?: string, projectId?: number) {
  return request.post<{ opName?: string;
    projectId?: number }, GetConfigDataResult>('ops/getConfigData', {
    opName,
    projectId,
  });
}

/** 保存配置（仿真/上板） */
export function saveConfig(params: SaveConfigParams) {
  return request.post<SaveConfigParams, void>('ops/saveConfig', params);
}

/** 开始仿真分析 */
export function startSimulate(params: { operatorNames?: string } = {}) {
  return request.post<{ operatorNames?: string }, void>(
    'ops/startSimulate',
    params,
    { timeout: Number.POSITIVE_INFINITY },
  );
}

/** 开始上板分析 */
export function startOnBoard(params: { operatorNames?: string } = {}) {
  return request.post<{ operatorNames?: string }, void>(
    'ops/startOnBoard',
    params,
    { timeout: Number.POSITIVE_INFINITY },
  );
}

/** 获取异常检测配置列表 */
export function getSanitizerConfigs() {
  return request.post<undefined, BuildConfig[]>('ops/getSanitizerConfigs');
}

/** 保存异常检测表单配置 */
export function saveSanitizerForm(params: SaveSanitizerFormParams) {
  return request.post<SaveSanitizerFormParams, void>(
    'ops/saveSanitizerForm',
    params,
  );
}

/** 运行异常检测 */
export function runSanitizer(params: { operatorNames?: string } = {}) {
  return request.post<{ operatorNames?: string }, void>(
    'ops/runSanitizer',
    params,
    { timeout: Number.POSITIVE_INFINITY },
  );
}

/** 导入DumpTensor二进制文件 */
export function importDumpTensorBinFile(params: { binFilePath: string }) {
  return request.post<{ binFilePath: string }, void>(
    'ops/importDumpTensorBinFile',
    params,
  );
}

/** 获取项目环境配置 */
export function getProjectEnv() {
  return request.post<undefined, { ascendEnvScript: string; socVersion: string }>(
    'ops/getProjectEnv',
  );
}

/** 获取当前 SOC 下仿真器支持的可选 aic-metrics（与命令生成同源，isSimulator:true 解析） */
export function getSimulatorSupportedMetrics() {
  return request.post<undefined, { ResourceConflictRatio: boolean; PMSampling: boolean }>(
    'ops/getSimulatorSupportedMetrics',
  );
}

/** 获取已选择的算子名称列表 */
export function getSelectedOperators() {
  return request.post<undefined, string | undefined>('ops/getSelectedOperators', undefined);
}
