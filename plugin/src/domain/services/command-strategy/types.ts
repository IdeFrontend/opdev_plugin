import { ConfigRecord } from '@plugin/domain/models/config-model';
import { ProjectRecord } from '@plugin/domain/models/project-model';
import { OpRecord } from '@plugin/domain/models/model';

/**
 * Context interface, containing basic information required to generate commands
 */
export interface CommandContext {
  config: ConfigRecord;
  project: ProjectRecord | null;
  operator: OpRecord | null;
  sourceCannCmd: string;
  cdCmd: string;
  cdBuildCmd: string;
}

/**
 * Command build parameter interface
 */
export interface CommandBuildParams {
  config: ConfigRecord;
  operator: OpRecord | null;
  sourceCannCmd: string;
  cdCmd: string;
  compileOption?: string;
  advance_cmd?: string;
  operatorNames?: string; // Operator name, multiple separated by commas (used in scenarios such as standard custom operators)
  scriptField?: string | undefined | null // Script field, the default is script, there are also cpu_debug_script and npu_debug_script
}

/**
 * Simulation/boarding command build parameter interface
 */
export interface ProfilerCommandParams {
  config: ConfigRecord;
  project: ProjectRecord | null;
  operator: OpRecord | null;
  sourceCannCmd: string;
  cdCmd: string;
  exampleTargetFile: string;
  cdBuildCmd: string;
}

/**
 * Basic context information (used to determine policy type)
 */
export interface BaseContext {
  config: ConfigRecord;
  project: ProjectRecord | null;
  operator: OpRecord | null;
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
  buildCommandContext(baseContext: BaseContext): CommandContext;

  /**
   * Generate run command
   * @param context command context
   * @returns run command string
   */
  buildRunCommand(context: CommandContext): string;

  /**
   * Generate compilation command
   */
  buildOpCommand(params: CommandBuildParams): string;

  /**
   * Generate sample compilation commands
   */
  buildExampleCommand(params: CommandBuildParams): string;

  /**
   * Generate Sanitizer command
   */
  buildSanitizerCommand(
    config: ConfigRecord,
    operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string,
    cdBuildCmd?: string
  ): string;

  /**
   * Generate simulation commands
   */
  buildSimulateCommand(params: ProfilerCommandParams): string;

  /**
   * Generate board command
   */
  buildOnBoardCommand(params: ProfilerCommandParams): string;

  /**
   * Build UT test command
   */
  buildUtTestCommand(params: CommandBuildParams): string;

  /**
   * Get the target file for running the command
   * @param config current configuration
   * @param operator operator information
   * @returns target file path
   */
  getRunTargetFile(config: ConfigRecord, operator: OpRecord | null): string;

  /**
   * Get the target file of the simulation/boarding/detection command
   * @param config current configuration
   * @param operator operator information
   * @param exampleConfigId example configuration ID (for ascend type)
   * @returns target file path
   * FIXME: Implementations still read profiler/sanitizer targets from legacy configs.json, not workspace settings.
   */
  getProfilerTargetFile(config: ConfigRecord, operator: OpRecord | null, exampleConfigId: number): string;
}
