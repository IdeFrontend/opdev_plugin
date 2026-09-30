/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type {
  BuildOpConfig,
  BuildExampleConfig,
  UtTestConfig,
  SimulateConfig,
  OnBoardConfig,
  SanitizerConfig,
} from '@plugin/service/config-service';
import { ProjectRecord } from '@plugin/domain/models/project-model';
import { OpRecord } from '@plugin/domain/models/op-record';

/**
 * Union of the per-section config DAOs the command chain consumes. Section-specific
 * strategies narrow to the concrete DAO they build for; `op` (the resolved operator
 * name the DAO was built for, the row `user_options.op`) is carried by the contexts
 * and params instead of the config rows.
 */
export type SectionConfig = BuildOpConfig | BuildExampleConfig | UtTestConfig | SimulateConfig | OnBoardConfig | SanitizerConfig;

/** Sections whose configs flow into buildOpCommand: the simulate/on-board/sanitizer pre-builds run the build_op builder with their own section config. */
export type BuildableConfig = BuildOpConfig | SimulateConfig | OnBoardConfig | SanitizerConfig;

/** Sections whose configs flow into getProfilerTargetFile (simulate / on-board / sanitizer). */
export type ProfilerTargetConfig = SimulateConfig | OnBoardConfig | SanitizerConfig;

/**
 * Context interface, containing basic information required to generate commands
 */
export interface BaseContext<TConfig = SectionConfig> {
  config: TConfig;
  project: ProjectRecord | null;
  operator: OpRecord | null;
  /** Resolved operator name the config was built for (the row `user_options.op`). */
  op: string;
}

/**
 * Command context interface, containing basic information required to generate commands
 */
export interface CommandContext<TConfig = SectionConfig> extends BaseContext<TConfig> {
  sourceCannCmd: string;
  cdCmd: string;
  cdBuildCmd: string;
}

/**
 * Command build parameter interface
 */
export interface CommandBuildParams<TConfig = SectionConfig> extends Omit<CommandContext<TConfig>, 'project' | 'cdBuildCmd' | 'operator'> {
  compileOption?: string;
  advance_cmd?: string;
  operatorNames?: string; // Operator name, multiple separated by commas (used in scenarios such as standard custom operators)
  scriptField?: string | undefined | null // Script field, the default is script, there are also cpu_debug_script and npu_debug_script
  exampleMode?: 'eager' | 'graph'; // Resolved run_example mode; overrides config.executionMode when set
  buildExampleOnly?: boolean; // Standard-custom: build an existing --run_example target without executing it
}

/**
 * Simulation/boarding command build parameter interface
 */
export interface ProfilerCommandParams<TConfig = SimulateConfig | OnBoardConfig> extends CommandContext<TConfig> {
  exampleTargetFile: string;
}

/**
 * command strategy interface
 */
export interface CommandStrategy {
  /**
   * Build command context
   * @param baseContext basic context information
   * @returns complete command context
   */
  buildCommandContext<TConfig extends SectionConfig>(baseContext: BaseContext<TConfig>): CommandContext<TConfig>;

  /**
   * Generate run command
   * @param context command context
   * @returns run command string
   */
  buildRunCommand(context: CommandContext<BuildOpConfig | BuildExampleConfig>): string;

  /**
   * Generate compilation command
   */
  buildOpCommand(params: CommandBuildParams<BuildableConfig>): string;

  /**
   * Generate sample compilation commands
   */
  buildExampleCommand(params: CommandBuildParams<BuildExampleConfig>): string;

  /**
   * Generate Sanitizer command
   */
  buildSanitizerCommand(context: CommandContext<SanitizerConfig>, exampleTargetFile?: string): string;

  /**
   * Generate simulation commands
   */
  buildSimulateCommand(params: ProfilerCommandParams<SimulateConfig>): string;

  /**
   * Generate board command
   */
  buildOnBoardCommand(params: ProfilerCommandParams<OnBoardConfig>): string;

  /**
   * Build UT test command
   */
  buildUtTestCommand(params: CommandBuildParams<UtTestConfig>): string;

  /**
   * Get the target file for running the command
   * @param op resolved operator name (the row `user_options.op`)
   * @param operator operator information (fallback source for the default-path target)
   * @param project project record (default-path layout source: standard-custom
   *   collections resolve the ascend artifact layout)
   * @returns target file path
   */
  getRunTargetFile(op: string, operator?: OpRecord | null, project?: ProjectRecord | null): string;

  /**
   * Get the target file of the simulation/boarding/detection command
   * @param config current configuration
   * @param operator operator information
   * @param op resolved operator name (the row `user_options.op`)
   * @param project project record (default-path layout source: standard-custom
   *   collections resolve the ascend artifact layout)
   * @returns target file path
   */
  getProfilerTargetFile(config: ProfilerTargetConfig, operator: OpRecord | null, op: string, project?: ProjectRecord | null): string;
}
