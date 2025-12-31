import { request } from '@/core/request';
import {
  GetProjectIdResult,
  GetHomeResult,
  GetProjectSHResult,
  GetBuildConfigResult,
  SaveAndStartBuildParams,
  SaveAndStartBuildExampleParams,
  GetSanitizerFormResult,
  RemotePathSearchParams,
  RemotePathSearchResult,
  SaveProjectSHParams,
  CreatedProjectParams,
  GetLastProjectPathResult,
  GetWorkspaceResult,
  SetActiveConfigParams,
  GetActiveConfigResult,
  BuildOpParams,
  BuildExampleParams,
  RunSanitizerParams,
  RunExampleParams,
  SimulateParams,
  OnBoardParams,
  DownloadDataParams,
  DeleteNodeParams,
  SelectFolderResult,
  CheckDevtoolConfigResult,
  JumpToFileParams,
  BuildCreateOpsParams,
  StartLinkCreateOpsParams,
  SaveBuildConfigParams,
  SaveSanitizerFormParams,
} from 'shared:/api-types';

/**
 * 获取HOME目录
 */
export function getHome() {
  return request.post<undefined, GetHomeResult>('webview/getHome');
}

/**
 * 获取项目SH脚本
 */
export function getProjectSH() {
  return request.post<undefined, GetProjectSHResult>('webview/getProjectSH');
}

/**
 * 更新Project
 */
export function updateProject() {
  return request.post<undefined, void>('webview/updateProject');
}

/**
 * 获取构建配置（字符串格式）
 */
export function getBuildConfigString() {
  return request.post<undefined, GetBuildConfigResult>('webview/getBuildConfig');
}

/**
 * 保存构建配置（返回字符串格式）
 */
export function saveBuildConfigString(params: SaveBuildConfigParams) {
  return request.post<SaveBuildConfigParams, GetBuildConfigResult>('webview/saveBuildConfig', params);
}

/**
 * 保存并开始构建
 */
export function saveAndStartBuild(params: SaveAndStartBuildParams) {
  return request.post<SaveAndStartBuildParams, void>('webview/saveAndStartBuild', params);
}

/**
 * 保存并开始构建示例
 */
export function saveAndStartBuildExample(params: SaveAndStartBuildExampleParams) {
  return request.post<SaveAndStartBuildExampleParams, void>('webview/saveAndStartBuildExample', params);
}

/**
 * 获取 Sanitizer 配置（字符串格式）
 */
export function getSanitizerFormString() {
  return request.post<undefined, GetSanitizerFormResult>('webview/getSanitizerForm');
}

/**
 * 保存 Sanitizer 配置（返回字符串格式）
 */
export function saveSanitizerFormString(params: SaveSanitizerFormParams) {
  return request.post<SaveSanitizerFormParams, GetSanitizerFormResult>('webview/saveSanitizerForm', params);
}

/**
 * 远程路径搜索
 */
export function remotePathSearch(params: RemotePathSearchParams) {
  return request.post<RemotePathSearchParams, RemotePathSearchResult>('webview/remotePathSearch', params);
}

/**
 * 保存项目SH脚本
 */
export function saveProjectSH(params: SaveProjectSHParams) {
  return request.post<SaveProjectSHParams, void>('webview/saveProjectSH', params);
}

/**
 * 创建项目
 */
export function createdProject(params: CreatedProjectParams) {
  return request.post<CreatedProjectParams, void>('webview/createdProject', params);
}

/**
 * 获取最后项目路径
 */
export function getLastProjectPath() {
  return request.post<undefined, GetLastProjectPathResult>('webview/getLastProjectPath');
}

/**
 * 获取工作区路径
 */
export function getWorkspace() {
  return request.post<undefined, GetWorkspaceResult>('webview/getWorkspace');
}

/**
 * 设置激活的配置
 */
export function setActiveConfig(params: SetActiveConfigParams) {
  return request.post<SetActiveConfigParams, void>('webview/setActiveConfig', params);
}

/**
 * 获取激活的配置
 */
export function getActiveConfig() {
  return request.post<undefined, GetActiveConfigResult>('webview/getActiveConfig');
}

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
 * 运行 Sanitizer（webview版本）
 */
export function runSanitizerWebview(params: RunSanitizerParams = {}) {
  return request.post<RunSanitizerParams, void>('webview/runSanitizer', params);
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
 * 保存配置（webview版本）
 */
export function saveConfigWebview(params: { type: string; data: any }) {
  return request.post<{ type: string; data: any }, void>('webview/saveConfig', params);
}

/**
 * 下载数据
 */
export function downloadData(params: DownloadDataParams) {
  return request.post<DownloadDataParams, void>('webview/downloadData', params);
}

/**
 * 删除节点
 */
export function deleteNode(params: DeleteNodeParams) {
  return request.post<DeleteNodeParams, void>('webview/deleteNode', params);
}

/**
 * 选择文件夹
 */
export function selectFolder() {
  return request.post<undefined, SelectFolderResult | null>('webview/selectFolder');
}

/**
 * 检查 devtool 配置（webview版本）
 */
export function checkDevtoolConfigWebview() {
  return request.post<undefined, CheckDevtoolConfigResult>('webview/checkDevtoolConfig');
}

/**
 * 跳转到文件（webview版本）
 */
export function jumpToFileWebview(params: JumpToFileParams) {
  return request.post<JumpToFileParams, void>('webview/jumpToFile', params);
}

/**
 * 创建算子（通过原型）
 */
export function buildCreateOps(params: BuildCreateOpsParams = {}) {
  return request.post<BuildCreateOpsParams, void>('webview/buildCreateOps', params);
}

/**
 * 开始链接创建算子
 */
export function startLinkCreateOps(params: StartLinkCreateOpsParams = {}) {
  return request.post<StartLinkCreateOpsParams, void>('webview/startLinkCreateOps', params);
}

