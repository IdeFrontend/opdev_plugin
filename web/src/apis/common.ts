import { request } from '@/core/request';
import { CheckPathExistsParams } from '@shared/api-types';

/**
 * 检查路径是否存在
 */
export function checkPathExists(params: CheckPathExistsParams) {
  return request.post<CheckPathExistsParams, boolean>(
    'common/pathExists',
    params,
  );
}

/**
 * 打开外部网站
 */
export function openExternalLink(url: string) {
  return request.post(
    'common/openExternalLink',
    url,
  );
}

/**
 * 执行 VSCode 命令
 */
export function executeVscodeCommand(command: string, ...args: any[]) {
  return request.post(
    'common/executeVscodeCommand',
    {
      command,
      args,
    },
  );
}

export function getSanitizerShowQuickOptions() {
  return request.post<undefined, boolean>('common/getSanitizerShowQuickOptions', undefined);
}

export function setSanitizerShowQuickOptions(value: boolean) {
  return request.post<{ value: boolean }, void>('common/setSanitizerShowQuickOptions', { value });
}

export function getSimulationShowQuickOptions() {
  return request.post<undefined, boolean>('common/getSimulationShowQuickOptions', undefined);
}

export function setSimulationShowQuickOptions(value: boolean) {
  return request.post<{ value: boolean }, void>('common/setSimulationShowQuickOptions', { value });
}

export function getOnBoardAnalysisShowQuickOptions() {
  return request.post<undefined, boolean>('common/getOnBoardAnalysisShowQuickOptions', undefined);
}

export function setOnBoardAnalysisShowQuickOptions(value: boolean) {
  return request.post<{ value: boolean }, void>('common/setOnBoardAnalysisShowQuickOptions', { value });
}

export function getProjectTypeSupportEnabled(projectType: string | number) {
  return request.post<{ projectType: string | number }, boolean>(
    'common/getProjectTypeSupportEnabled',
    { projectType },
  );
}
