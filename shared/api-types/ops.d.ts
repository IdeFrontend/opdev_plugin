// 算子操作相关类型定义

export type InitOpsParams = {
  ascendEnvScript?: string;
  projectPath?: string;
  projectName?: string;
  templateName?: string,
  projectType?: string
};

export type CreateOpsParams = {
  projectName?: string;
  projectId?: string;
  prototypeName?: string;
};

export type CreateOpsByPrototypeParams = {
  opsPrototypeFile: string;
  opType?: 'ascend' | 'cann' | 'pyasc';
  templateName?: string;
};

export type BuildConfig = {
  config_id: number;
  config_name: string;
  config_type:
    | 'build_op'
    | 'build_example'
    | 'simulate'
    | 'on_board'
    | 'sanitizer';
  user_options?: Record<string, unknown>;
};

export type GetConfigDataResult = {
  [key: string]: BuildConfig[];
};

export type StartBuildParams = {
  configId?: string;
  compileOption?: string;
  operatorNames?: string; // 算子名称，多个用逗号分隔
  operatorType?: string; // 算子类型，用于标识编译哪种类型的算子（如 'standard-custom'）
  projectId?: string | number; // 项目ID
  scriptField?: string; // 指定使用哪个字段作为脚本
};

export type StartRunParams = {
  configId?: string;
  filePath?: string; // 文件路径（右键调用时传入）
};

export type StartBuildExampleParams = {
  configId?: string;
  compileOption?: string;
  operatorNames?: string; // 算子名称，多个用逗号分隔
  operatorType?: string; // 算子类型，用于标识编译哪种类型的算子（如 'standard-custom'）
  projectId?: string | number; // 项目ID（从 projects.json 根据根目录查找）
};

export type SaveBuildConfigParams = {
  data: unknown;
  showMessage?: boolean;
};

export type SaveConfigParams = {
  type: string;
  data: unknown;
  showMessage?: boolean;
};

export type SaveSanitizerFormParams = {
  data: unknown;
  showMessage?: boolean;
};

export type UpdateShScriptParams = {
  ascendEnvScript?: string;
};

export type OperatorInfo = {
  id: number;
  op_name: string;
  op_type: string;
  op_path: string;
  config_name: string;
};
