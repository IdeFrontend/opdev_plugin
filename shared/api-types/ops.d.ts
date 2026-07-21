// 算子操作相关类型定义

import type { OperatorOpType } from '../operator-op-type';
import type { StTestMode } from '../st-test-results';

export type { OperatorOpType };

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
  /** When set, write the prototype JSON here instead of the project record's path. */
  outputPath?: string;
};

export type CreateOpsByPrototypeParams = {
  opsPrototypeFile: string;
  opType?: OperatorOpType;
  templateName?: string;
  /** Canonical operator / entrypoint name (e.g. New Project `projectName`). Passed to `generateStructure` as `op_name`. */
  opName?: string;
  /** Override the project id used for scaffolding (e.g. the parent collection id). */
  projectId?: string | number;
  /** Override the operator output directory passed to generateStructure as op_path. */
  opPath?: string;
  /**
   * When true, skip operator source-file generation in generateStructure
   * (genop already produced the source) and only register metadata/IDE artifacts.
   */
  skipFileGeneration?: boolean;
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
  soc_version?: string;
};

export type StartUtTestParams = {
  operatorNames?: string; // 算子名称，多个用逗号分隔
  compileOption?: string;
  configId?: string;
  projectId?: string | number; // 项目ID
};

export type StartSimulateParams = {
  operatorNames?: string; // 算子名称，多个用逗号分隔
  compileOption?: string;
};

export type StartOnBoardParams = {
  operatorNames?: string; // 算子名称，多个用逗号分隔
  compileOption?: string;
};

export type StartSanitizerParams = {
  operatorNames?: string; // 算子名称，多个用逗号分隔
};

export type StartDumpTensorParams = {
  operatorNames?: string; // 算子名称，多个用逗号分隔
  compileOption?: string;
};

export type StTestArgumentsByMode = Record<StTestMode, string[]>;

export type StTestOptionsResult = {
  contextToken: string;
  operatorName: string;
  availableModes: StTestMode[];
  selectedModes: StTestMode[];
  argumentsByMode: StTestArgumentsByMode;
  defaultArgumentsByMode: StTestArgumentsByMode;
};

export type RunStTestOptionsParams = {
  contextToken: string;
  selectedModes: string[];
  argumentsByMode: Partial<StTestArgumentsByMode>;
};
