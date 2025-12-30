// 算子操作相关类型定义

export type InitOpsParams = {
  accendEnvScript?: string;
  projectPath?: string;
  projectName?: string;
};

export type CreateOpsParams = {
  projectName?: string;
  projectId?: string;
  prototypeName?: string;
};

export type CreateOpsByPrototypeParams = {
  opsPrototypeFile: string;
  opType?: 'ascend' | 'cann';
};

export type BuildConfig = {
  config_id: number;
  config_name: string;
  config_type: 'build_op' | 'build_example' | 'simulate' | 'on_board' | 'sanitizer';
  user_options?: Record<string, any>;
};

export type GetConfigDataResult = {
  [key: string]: BuildConfig[];
};

export type StartBuildParams = {
  configId?: string;
  compileOption?: string;
};

export type StartRunParams = {
  configId?: string;
};

export type StartBuildExampleParams = {
  configId?: string;
};

export type SaveBuildConfigParams = {
  data: any;
  showMessage?: boolean;
};

export type SaveConfigParams = {
  type: string;
  data: any;
  showMessage?: boolean;
};

export type SaveSanitizerFormParams = {
  data: any;
  showMessage?: boolean;
};

export type UpdateShScriptParams = {
  accendEnvScript?: string;
};
