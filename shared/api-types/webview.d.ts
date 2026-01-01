// Webview 相关类型定义

export type GetProjectIdResult = string;

export type GetHomeResult = string;

export type GetProjectSHResult = string;

export type GetBuildConfigResult = string;

export type SaveAndStartBuildParams = {
  data: any;
};

export type SaveAndStartBuildExampleParams = {
  data: any;
};

export type GetSanitizerFormResult = string;

export type RemotePathSearchParams = {
  keyword: string;
  type: string;
};

export type RemotePathSearchResult = {
  type: string;
  list: any[];
};

export type SaveProjectSHParams = {
  accendEnvScript: string;
};

export type CreatedProjectParams = {
  projectPath: string;
  projectName: string;
  projectSH?: string;
  createOperatorProjectDictoryFileType?: number;
};

export type GetLastProjectPathResult = string | null;

export type GetWorkspaceResult = string | null;

export type SetActiveConfigParams = {
  configId: string;
};

export type GetActiveConfigResult = string;

export type BuildOpParams = {
  data?: any;
};

export type BuildExampleParams = {
  data?: any;
};

export type RunSanitizerParams = {
  data?: any;
};

export type RunExampleParams = {
  data?: any;
};

export type SimulateParams = {
  data?: any;
};

export type OnBoardParams = {
  data?: any;
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
  data?: any;
};

export type StartLinkCreateOpsParams = {
  fileName?: string;
  value?: string;
};
