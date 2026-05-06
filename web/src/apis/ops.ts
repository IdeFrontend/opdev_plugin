import {
  InitOpsParams,
  CreateOpsParams,
  CreateOpsByPrototypeParams,
  GetConfigDataResult,
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
  SaveBuildConfigParams,
  SaveConfigParams,
  SaveSanitizerFormParams,
  UpdateShScriptParams,
  BuildConfig,
  OperatorInfo,
} from '@shared/api-types';

import { request } from '@/core/request';

/** 初始化算子项目 */
export function initOps(params: InitOpsParams = {}) {
  return request.post<InitOpsParams, string>('ops/init', params);
}

/** 创建算子原型文件 */
export function createOps(params: CreateOpsParams = {}) {
  return request.post<CreateOpsParams, string>('ops/createOps', params);
}

/** 通过原型生成算子工程 */
export function createOpsByPrototype(params: CreateOpsByPrototypeParams) {
  return request.post<CreateOpsByPrototypeParams, void>(
    'ops/createOpsByPrototype',
    params,
  );
}

/** 获取配置数据 */
export function getConfigData(opName?: string, projectId?: number) {
  return request.post<{ opName?: string;
    projectId?: number }, GetConfigDataResult>('ops/getConfigData', {
    opName,
    projectId,
  });
}

/** 获取当前项目下的所有算子列表 */
export function getOperators() {
  return request.post<undefined, OperatorInfo[]>('ops/getOperators');
}

/** 获取构建配置列表 */
export function getBuildConfigs() {
  return request.post<undefined, BuildConfig[]>('ops/getBuildConfigs');
}

/** 保存构建配置 */
export function saveBuildConfig(params: SaveBuildConfigParams) {
  return request.post<SaveBuildConfigParams, void>(
    'ops/saveBuildConfig',
    params,
  );
}

/** 保存配置（仿真/上板） */
export function saveConfig(params: SaveConfigParams) {
  return request.post<SaveConfigParams, void>('ops/saveConfig', params);
}

/** 编译算子 */
export function startBuild(params: StartBuildParams = {}) {
  return request.post<StartBuildParams, void>(
    'ops/startBuild',
    params,
    { timeout: Number.POSITIVE_INFINITY }, // 编译可能耗时很长，设置无超时限制
  );
}

/** 运行算子 */
export function startRun(params: StartRunParams = {}) {
  return request.post<StartRunParams, void>(
    'ops/startRun',
    params,
    { timeout: Number.POSITIVE_INFINITY }, // 运行可能耗时很长，设置无超时限制
  );
}

/** 编译示例 */
export function startBuildExample(params: StartBuildExampleParams = {}) {
  return request.post<StartBuildExampleParams, void>(
    'ops/startBuildExample',
    params,
    { timeout: Number.POSITIVE_INFINITY }, // 编译可能耗时很长，设置无超时限制
  );
}

/** 开始仿真分析 */
export function startSimulate(params: { operatorNames?: string } = {}) {
  return request.post<{ operatorNames?: string }, void>(
    'ops/startSimulate',
    params,
    { timeout: Number.POSITIVE_INFINITY }, // 仿真分析可能耗时很长，设置无超时限制
  );
}

/** 开始上板分析 */
export function startOnBoard(params: { operatorNames?: string } = {}) {
  return request.post<{ operatorNames?: string }, void>(
    'ops/startOnBoard',
    params,
    { timeout: Number.POSITIVE_INFINITY }, // 上板分析可能耗时很长，设置无超时限制
  );
}

/** 获取构建配置ID */
export function getBuildConfig() {
  return request.post<undefined, number | undefined>('ops/getBuildConfig');
}

/** 获取示例构建配置ID */
export function getBuildExampleConfig() {
  return request.post<undefined, number | undefined>('ops/getBuildExampleConfig');
}

/** 获取仿真配置ID */
export function getSimulateConfig() {
  return request.post<undefined, string>('ops/getSimulateConfig');
}

/** 获取上板配置ID */
export function getOnBoardConfig() {
  return request.post<undefined, string>('ops/getOnBoardConfig');
}

/** 获取异常检测配置列表 */
export function getSanitizerConfigs() {
  return request.post<undefined, BuildConfig[]>('ops/getSanitizerConfigs');
}

/** 获取异常检测配置ID */
export function getSanitizerConfigId() {
  return request.post<undefined, number | undefined>('ops/getSanitizerConfigId');
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
    { timeout: Number.POSITIVE_INFINITY }, // 异常检测可能耗时很长，设置无超时限制
  );
}

/** 开始执行DumpTensor */
export function startDumpTensor(params: { operatorNames?: string,
  compileOption?: string } = {}) {
  return request.post<{ operatorNames?: string,
    compileOption?: string }, void>(
    'ops/startDumpTensor',
    params,
    { timeout: Number.POSITIVE_INFINITY }, // 运行可能耗时很长，设置无超时限制
  );
}

/** 导入DumpTensor二进制文件 */
export function importDumpTensorBinFile(params: { binFilePath: string }) {
  return request.post<{ binFilePath: string }, void>(
    'ops/importDumpTensorBinFile',
    params,
  );
}

/** 执行UT测试 */
export function startUtTest(params: { operatorNames?: string } = {}) {
  return request.post<{ operatorNames?: string }, void>(
    'ops/startUtTest',
    params,
    { timeout: Number.POSITIVE_INFINITY }, // 运行可能耗时很长，设置无超时限制
  );
}

/** 更新脚本文件 */
export function updateShScript(params: UpdateShScriptParams) {
  return request.post<UpdateShScriptParams, string>(
    'ops/updateShScript',
    params,
  );
}

/** 获取项目环境配置 */
export function getProjectEnv() {
  return request.post<undefined, { ascendEnvScript: string; socVersion: string }>(
    'ops/getProjectEnv',
  );
}

/** 保存项目环境配置 */
export function saveProjectEnv(params: { ascendEnvScript: string; socVersion: string }) {
  return request.post<{ ascendEnvScript: string; socVersion: string }, void>(
    'ops/saveProjectEnv',
    params,
  );
}

/** 检查 .vscode 目录 */
export function checkVscode() {
  return request.post<undefined, boolean>('ops/checkVscode');
}

/** 检查 devtool_config.json 配置文件是否存在 */
export function checkDevtoolConfig() {
  return request.post<undefined, boolean>('ops/checkDevtoolConfig');
}

/** 获取当前项目ID */
export function getProjectId() {
  return request.post<undefined, string>('ops/getProjectId');
}

/** 停止当前任务 */
export function stopTask() {
  return request.post<undefined, void>(
    'ops/stopTask',
    undefined,
    { timeout: Number.POSITIVE_INFINITY }, // 去掉超时时间限制（Infinity 表示无超时）
  );
}

/** 检查任务执行状态 */
export function checkTaskStatus() {
  return request.post<undefined, boolean>('ops/checkTaskStatus');
}

/** 获取当前任务名称 */
export function getCurrentTaskName() {
  return request.post<undefined, string | null>('ops/getCurrentTaskName');
}

/** 显示确认对话框 */
export function showConfirmDialog(params: {
  title: string;
  content: string;
  confirmText: string;
  cancelText: string;
}) {
  return request.post<{
    title: string;
    content: string;
    confirmText: string;
    cancelText: string;
  }, string | undefined>('ops/showConfirmDialog', params);
}

/** 打开配置页面 */
export function openConfig(params: { configName?: string } = {}) {
  return request.post<{ configName?: string }, void>('ops/openConfig', params);
}

/** 设置已选择的算子ID列表 */
export function setSelectedOperators(operatorIds: number[]) {
  return request.post<{ operatorIds: number[] }, void>('ops/setSelectedOperators', { operatorIds });
}

/** 获取已选择的算子ID列表 */
export function getSelectedOperatorIds() {
  return request.post<undefined, number[] | undefined>('ops/getSelectedOperatorIds', undefined);
}

/** 获取已选择的算子名称列表 */
export function getSelectedOperators() {
  return request.post<undefined, string | undefined>('ops/getSelectedOperators', undefined);
}
