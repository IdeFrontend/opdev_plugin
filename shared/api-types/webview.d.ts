import { OperatorProjectViewIdValue } from '../project-type-view-id';

// Webview 相关类型定义

export type GetHomeResult = string;

export type GetProjectSHResult = string;

export type RemotePathSearchParams = {
  keyword: string;
  type: string;
};

export type RemotePathSearchResult = {
  type: string;
  list: Array<{ path: string }>;
};

export type CreatedProjectParams = {
  projectPath: string;
  projectName: string;
  projectSH?: string;
  createOperatorProjectDictoryFileType?: OperatorProjectViewIdValue;
  templateName?: string;
};

export type OpenProjectParams = {
  projectPath: string;
  projectName?: string;
  projectSH?: string;
};

export type GetLastProjectPathResult = string | null;

export type GetWorkspaceResult = string | null;

export type DownloadDataParams = {
  filePath?: string;
  nodeKey?: string;
};

export type DeleteNodeParams = {
  nodeKey: string;
  filePath?: string;
};

export type SelectFolderParams = {
  defaultPath?: string;
};

export type SelectFolderResult = string;

export type SelectFileParams = {
  defaultPath?: string;
  fileTypes?: Array<{
    label: string;
    extensions: string[];
  }>;
};

export type SelectFileResult = string;

export type JumpToFileParams = {
  fileLink: string;
  row: number;
  col: number;
  errorMessage?: string; // 错误信息，用于在高亮时显示
  errorTitle?: string; // 错误标题
};

export type OpenFileParams = {
  file: string;
};
