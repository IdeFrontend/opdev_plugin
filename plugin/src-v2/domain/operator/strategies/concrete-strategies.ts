import { AbstractExecutionStrategy } from './execution-strategy.interface';
import { IExecutionStep } from './execution-step.interface';
import { CommandGeneratorService } from '../services/command-generator.service';
import {
  BuildWithSimulatorStep,
  BuildForOnBoardStep,
  BuildForSanitizerStep,
  BuildStep,
} from './steps/build-steps';
import {
  SimulateStep,
  OnBoardStep,
  SanitizerStep,
} from './steps/analysis-steps';

/**
 * Standard simulate strategy
 * Steps: pre-simulate build -> simulate analysis
 */
export class StandardSimulateStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'standard-simulate';

  constructor(private commandGenerator: CommandGeneratorService) {
    super();
  }

  getSteps(): IExecutionStep[] {
    return [
      new BuildWithSimulatorStep(this.commandGenerator),
      new SimulateStep(this.commandGenerator),
    ];
  }
}

/**
 * Standard on-board strategy
 * Steps: pre-on-board build -> on-board analysis
 */
export class StandardOnBoardStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'standard-onboard';

  constructor(private commandGenerator: CommandGeneratorService) {
    super();
  }

  getSteps(): IExecutionStep[] {
    return [
      new BuildForOnBoardStep(this.commandGenerator),
      new OnBoardStep(this.commandGenerator),
    ];
  }
}

/**
 * Standard sanitizer strategy
 * Steps: pre-sanitizer build -> sanitizer
 */
export class StandardSanitizerStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'standard-sanitizer';

  constructor(private commandGenerator: CommandGeneratorService) {
    super();
  }

  getSteps(): IExecutionStep[] {
    return [
      new BuildForSanitizerStep(this.commandGenerator),
      new SanitizerStep(this.commandGenerator),
    ];
  }
}

/**
 * Custom on-board strategy example
 * Steps: build -> validation -> on-board analysis
 * Shows how to extend with new strategies
 */
export class CustomOnBoardWithValidationStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'custom-onboard-with-validation';

  constructor(private commandGenerator: CommandGeneratorService) {
    super();
  }

  getSteps(): IExecutionStep[] {
    return [
      // Normal build first
      new BuildStep(this.commandGenerator, undefined, 'PreValidationBuild'),

      // Custom validation step (example)
      // new ValidationStep(),

      // Pre-on-board build
      new BuildForOnBoardStep(this.commandGenerator),

      // On-board analysis
      new OnBoardStep(this.commandGenerator),
    ];
  }
}

/**
 * Fast on-board strategy (skip build)
 * For already-built operators
 */
export class FastOnBoardStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'fast-onboard';

  constructor(private commandGenerator: CommandGeneratorService) {
    super();
  }

  getSteps(): IExecutionStep[] {
    return [
      // On-board only, skip build
      new OnBoardStep(this.commandGenerator),
    ];
  }
}
