import { Result } from '@plugin-v2/domain/shared/types/result.type';
import { ICommandExecutor } from '@plugin-v2/application/interfaces/command-executor.interface';
import { IOperatorPlugin } from '@plugin/domain/plugins/operator-plugin.interface';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';

/**
 * Execution step context
 * Holds all config and state needed for execution
 */
export interface ExecutionContext {
  /** Primary config ID (e.g. on-board, simulate) */
  primaryConfigId: number;

  /** Build config ID */
  buildConfigId: number;

  /** Example config ID */
  exampleConfigId: number;

  /** Operator-type-specific parameters */
  parameters?: Record<string, unknown>;

  /** Executor */
  executor: ICommandExecutor;

  /** Previous step result (for chain passing) */
  previousResult?: unknown;

  /**
   * Operator-type plugin for the current operator.
   * Provides command generation and build behavior flags.
   * Looked up by operator.op_type via OperatorPluginRegistry.
   */
  opPlugin?: IOperatorPlugin;

  /**
   * Project type of the current workspace (from OperatorPluginRegistry.detectProject()).
   * Used by ExampleBuildStep to skip the example build for non-STANDARD_CUSTOM projects.
   */
  projectType?: OperatorProjectType;
}

/**
 * Execution step interface
 * Each step is an independent, composable unit
 */
export interface IExecutionStep {
  /**
   * Step name (for logging and error tracking)
   */
  readonly name: string;

  /**
   * Execute the step
   * @param context Execution context
   * @returns Result, possibly with data for next step
   */
  execute(context: ExecutionContext): Promise<Result<unknown, Error>>;

  /**
   * Whether this step can be skipped (optional)
   * @param context Execution context
   */
  canSkip?(context: ExecutionContext): boolean;
}
