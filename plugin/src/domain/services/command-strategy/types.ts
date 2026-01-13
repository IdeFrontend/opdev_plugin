import { ConfigRecord } from '@plugin/domain/models/config-model';
import { ProjectRecord } from '@plugin/domain/models/project-model';
import { OpRecord } from '@plugin/domain/models/model';

/**
 * 上下文接口，包含生成命令所需的基础信息
 */
export interface CommandContext {
  config: ConfigRecord;
  project: ProjectRecord | null;
  operator: OpRecord | null;
  sourceCannCmd: string;
  cdCmd: string;
}

/**
 * 命令构建参数接口
 */
export interface CommandBuildParams {
  config: ConfigRecord;
  operator: OpRecord | null;
  sourceCannCmd: string;
  cdCmd: string;
  compileOption?: string;
  advance_cmd?: string;
}

/**
 * 仿真/上板命令构建参数接口
 */
export interface ProfilerCommandParams {
  config: ConfigRecord;
  project: ProjectRecord | null;
  operator: OpRecord | null;
  sourceCannCmd: string;
  cdCmd: string;
  exampleTargetFile: string;
}

/**
 * 基础上下文信息（用于确定策略类型）
 */
export interface BaseContext {
  config: ConfigRecord;
  project: ProjectRecord | null;
  operator: OpRecord | null;
}

/**
 * 命令策略接口
 */
export interface CommandStrategy {
  /**
   * 构建命令上下文
   * @param baseContext 基础上下文信息
   * @returns 完整的命令上下文
   */
  buildCommandContext(baseContext: BaseContext): CommandContext;

  /**
   * 生成运行命令
   * @param context 命令上下文
   * @returns 运行命令字符串
   */
  buildRunCommand(context: CommandContext): string;

  /**
   * 生成编译命令
   */
  buildOpCommand(params: CommandBuildParams): string;

  /**
   * 生成示例编译命令
   */
  buildExampleCommand(params: CommandBuildParams): string;

  /**
   * 生成Sanitizer命令
   */
  buildSanitizerCommand(
    config: ConfigRecord,
    operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string
  ): string;

  /**
   * 生成仿真命令
   */
  buildSimulateCommand(params: ProfilerCommandParams): string;

  /**
   * 生成上板命令
   */
  buildOnBoardCommand(params: ProfilerCommandParams): string;
}
