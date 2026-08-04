import {
  GetConfigDataResult,
  SaveConfigParams,
  SaveSanitizerFormParams,
  BuildConfig,
  RunStTestOptionsParams,
  StTestOptionsResult,
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
  return request.post<undefined, {
    ascendEnvScript: string;
    socVersion: string;
  }>('ops/getProjectEnv');
}

/** 扩展主机是否检测到昇腾 NPU 硬件 */
export function getNpuHardwareAvailable() {
  return request.post<undefined, boolean>('ops/getNpuHardwareAvailable');
}

export function getOnBoardExecutionAvailable() {
  return request.post<undefined, boolean>('ops/getOnBoardExecutionAvailable');
}

/** 获取当前 SOC 下仿真器支持的可选 aic-metrics（与命令生成同源，isSimulator:true 解析） */
export function getSimulatorSupportedMetrics() {
  return request.post<undefined, {
    ResourceConflictRatio: boolean;
    PMSampling: boolean;
  }>('ops/getSimulatorSupportedMetrics');
}

/** 获取已选择的算子名称列表 */
export function getSelectedOperators() {
  return request.post<undefined, string | undefined>('ops/getSelectedOperators', undefined);
}

export function loadStTestOptions() {
  return request.post<undefined, StTestOptionsResult>('ops/loadStTestOptions');
}

export function runStTestOptions(params: RunStTestOptionsParams) {
  return request.post<RunStTestOptionsParams, void>(
    'ops/runStTestOptions',
    params,
    {
      timeout: Number.POSITIVE_INFINITY,
      useCustomErrorHandler: true,
    },
  );
}
