import {
  RunStTestOptionsParams,
  StTestOptionsResult,
  OnBoardOptions,
  SimulateOptions,
  SanitizerOptions,
} from '@shared/api-types';
import type { DataCollectionConfig } from '@shared/data-collection-config';

import { request } from '@/core/request';

/** 获取上板分析选项（flat payload，dotted settings） */
export function getOnBoardOptions() {
  return request.post<undefined, OnBoardOptions>('ops/getOnBoardOptions');
}

/** 保存上板分析选项（flat payload，dotted settings） */
export function saveOnBoardOptions(params: OnBoardOptions) {
  return request.post<OnBoardOptions, void>('ops/saveOnBoardOptions', params);
}

/** 获取仿真分析选项（flat payload，dotted settings） */
export function getSimulateOptions() {
  return request.post<undefined, SimulateOptions>('ops/getSimulateOptions');
}

/** 保存仿真分析选项（flat payload，dotted settings） */
export function saveSimulateOptions(params: SimulateOptions) {
  return request.post<SimulateOptions, void>('ops/saveSimulateOptions', params);
}

/** 获取异常检测选项（flat payload，dotted settings） */
export function getSanitizerOptions() {
  return request.post<undefined, SanitizerOptions>('ops/getSanitizerOptions');
}

/** 保存异常检测选项（flat payload，dotted settings） */
export function saveSanitizerOptions(params: SanitizerOptions) {
  return request.post<SanitizerOptions, void>('ops/saveSanitizerOptions', params);
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

/** 获取 A5 数据采集配置弹窗的初始配置 */
export function getDataCollectionConfig() {
  return request.post<undefined, DataCollectionConfig>('ops/getDataCollectionConfig');
}

/** 保存 A5 数据采集配置弹窗的配置（按采集类型持久化，下次打开时回显） */
export function saveDataCollectionConfig(config: DataCollectionConfig) {
  return request.post<DataCollectionConfig, void>('ops/saveDataCollectionConfig', config);
}

/** A5 新工具（npu-compute / npu-emulate）数据采集：编译并执行工具，随后打开报告 */
export function startNewToolCollection(params: {
  config: DataCollectionConfig;
  operatorNames?: string;
}) {
  return request.post<{ config: DataCollectionConfig;
    operatorNames?: string }, void>(
    'ops/startNewToolCollection',
    params,
    { timeout: Number.POSITIVE_INFINITY },
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
