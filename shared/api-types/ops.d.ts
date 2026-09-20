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
  /** Target project path (the workspace root project or a parent collection). */
  projectPath?: string;
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
  /** Override the project path used for scaffolding (e.g. the parent collection path). */
  projectPath?: string;
  /** Override the operator output directory passed to generateStructure as op_path. */
  opPath?: string;
  /**
   * When true, skip operator source-file generation in generateStructure
   * (genop already produced the source) and only register metadata/IDE artifacts.
   */
  skipFileGeneration?: boolean;
};

/** On-board profiler options (dotted `performanceTuning.onBoard.*` settings, flat payload). */
export type OnBoardOptions = {
  interCoreLoad?: boolean;
  roofline?: boolean;
  operatorCodeHotspot?: boolean;
  cacheHeatmap?: boolean;
  pcSampling?: boolean;
  cubeAndVectorInstructionTimeAndRatio?: boolean;
  l2CacheHitRate?: boolean;
  memoryReadWriteBandwidth?: boolean;
  l0ReadWriteBandwidth?: boolean;
  ubReadWriteBandwidth?: boolean;
  computeAndMoveUnitTimeRatio?: boolean;
  resourceConflictRatio?: boolean;
  operatorMetrics?: boolean;
};

/** Simulator options (dotted `performanceTuning.simulation.*` settings, flat payload). */
export type SimulateOptions = {
  memoryThroughputWaveform?: boolean;
  resourceConflictRatio?: boolean;
};

/** Sanitizer options (dotted `sanitizer.*` settings, flat payload). */
export type SanitizerOptions = {
  toolType?: 'mssanitizer' | 'npu-check';
  memory?: boolean;
  memCheck?: boolean;
  sync?: boolean;
  race?: boolean;
  uninitialized?: boolean;
  memoryLeak?: boolean;
  allocUnused?: boolean;
  reportLogLevel?: 'info' | 'warn' | 'error';
  maxSingleLogFileSize?: number;
  detectionScope?: 'global' | 'singleBlock';
  blockId?: number | null;
};

export type StartBuildParams = {
  compileOption?: string;
  operatorNames?: string; // 算子名称，多个用逗号分隔
  operatorType?: string; // 算子类型，用于标识编译哪种类型的算子（如 'standard-custom'）
  scriptField?: string; // 指定使用哪个字段作为脚本
};

export type StartRunParams = {
  filePath?: string; // 文件路径（右键调用时传入）
};

export type StartBuildExampleParams = {
  compileOption?: string;
  operatorNames?: string; // 算子名称，多个用逗号分隔
  operatorType?: string; // 算子类型，用于标识编译哪种类型的算子（如 'standard-custom'）
};

export type UpdateShScriptParams = {
  ascendEnvScript?: string;
};

export type StartUtTestParams = {
  operatorNames?: string; // 算子名称，多个用逗号分隔
  compileOption?: string;
};

export type StartSimulateParams = {
  operatorNames?: string; // 算子名称，多个用逗号分隔
  compileOption?: string;
};

export type StartOnBoardParams = {
  operatorNames?: string; // 算子名称，多个用逗号分隔
  compileOption?: string;
};

/**
 * A5 new-tool (npu-compute / npu-emulate) data-collection run params. `config` is the
 * "数据采集配置" dialog payload (its `collectionType` selects on-board vs simulate).
 */
export type StartNewToolCollectionParams = {
  config: import('../data-collection-config').DataCollectionConfig;
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
