import { Result } from '@plugin-v2/domain/shared/types/result.type';
import {
  ExecutionContext, IExecutionStep,
} from './execution-step.interface';

/**
 * Execution strategy interface
 * Defines full operator task execution strategy
 */
export interface IExecutionStrategy {
  /**
   * Strategy name (e.g. 'standard-onboard', 'custom-onboard-with-validation')
   */
  readonly strategyName: string;

  /**
   * Get the step chain
   * @returns Steps to run in order
   */
  getSteps(): IExecutionStep[];

  /**
   * Execute strategy
   * Runs all steps in order; supports chain passing
   * @param context Execution context
   */
  execute(context: ExecutionContext): Promise<Result<void, Error>>;
}

/**
 * Abstract execution strategy base
 * Provides template method implementation
 */
export abstract class AbstractExecutionStrategy implements IExecutionStrategy {
  abstract readonly strategyName: string;
  abstract getSteps(): IExecutionStep[];

  /**
   * Template method: execute strategy
   * Subclasses need not override; vary by composing steps
   */
  async execute(context: ExecutionContext): Promise<Result<void, Error>> {
    const steps = this.getSteps();

    for (const step of steps) {
      // Check if step can be skipped
      if (step.canSkip?.(context)) {
        continue;
      }

      // Execute step
      const stepResult = await step.execute(context);

      // On failure, return immediately
      if (this.isError(stepResult)) {
        return stepResult as Result<void, Error>;
      }

      // Pass result to next step (chain of responsibility)
      context.previousResult = (stepResult as any).value;
    }

    return {
      ok: true,
      value: undefined,
    } as Result<void, Error>;
  }

  private isError<T, E>(result: Result<T, E>): boolean {
    return 'error' in result && result.error !== undefined;
  }
}
