import { GetConfigDataResult } from './ops';

// Webview 相关类型定义

export type GetProjectIdResult = string;

export type GetHomeResult = string;

export type GetProjectSHResult = string;

export type GetBuildConfigResult = GetConfigDataResult;

export type SaveAndStartBuildParams = {
  data: unknown;
};

export type SaveAndStartBuildExampleParams = {
  data: unknown;
};

export type GetSanitizerFormResult = unknown;

export type RemotePathSearchParams = {
  keyword: string;
  type: string;
};

export type RemotePathSearchResult = {
  type: string;
  list: Array<{ path: string }>;
};

export type SaveProjectSHParams = {
  ascendEnvScript: string;
};

export type CreatedProjectParams = {
  projectPath: string;
  projectName: string;
  projectSH?: string;
  createOperatorProjectDictoryFileType?: number;
  templateName?: string;
};

export type OpenProjectParams = {
  projectPath: string;
  projectName: string;
  projectSH?: string;
};

export type GetLastProjectPathResult = string | null;

export type GetWorkspaceResult = string | null;

export type SetActiveConfigParams = {
  configId: string;
};

export type GetActiveConfigResult = string;

export type BuildOpParams = {
  data?: unknown;
};

export type BuildExampleParams = {
  data?: unknown;
};

export type RunSanitizerParams = {
  data?: unknown;
};

export type RunExampleParams = {
  data?: unknown;
};

export type SimulateParams = {
  data?: unknown;
};

export type OnBoardParams = {
  data?: unknown;
};

export type DownloadDataParams = {
  filePath?: string;
  nodeKey?: string;
};

export type DeleteNodeParams = {
  nodeKey: string;
  filePath?: string;
};

export type SelectFolderResult = string;

export type CheckDevtoolConfigResult = boolean;

export type JumpToFileParams = {
  fileLink: string;
  row: number;
  col: number;
};

export type BuildCreateOpsParams = {
  data?: unknown;
};

export type StartLinkCreateOpsParams = {
  fileName?: string;
  value?: string;
};

export type OpenFileParams = {
  file: string;
};

export type OpenLinkParams = {
  url: string;
};
