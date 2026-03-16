import { Result } from '@plugin-v2/domain/shared/types/result.type';
import { ICommandExecutor } from '@plugin-v2/application/interfaces/command-executor.interface';

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
