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
 * 标准仿真策略
 * 步骤: 仿真前编译 -> 仿真分析
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
 * 标准上板策略
 * 步骤: 上板前编译 -> 上板分析
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
 * 标准异常检测策略
 * 步骤: 异常检测前编译 -> 异常检测
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
 * 自定义上板策略示例
 * 步骤: 普通编译 -> 验证 -> 上板分析
 * 演示如何扩展新策略
 */
export class CustomOnBoardWithValidationStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'custom-onboard-with-validation';

  constructor(private commandGenerator: CommandGeneratorService) {
    super();
  }

  getSteps(): IExecutionStep[] {
    return [
      // 先进行普通编译
      new BuildStep(this.commandGenerator, undefined, 'PreValidationBuild'),

      // 自定义验证步骤 (示例)
      // new ValidationStep(),

      // 上板前编译
      new BuildForOnBoardStep(this.commandGenerator),

      // 上板分析
      new OnBoardStep(this.commandGenerator),
    ];
  }
}

/**
 * 快速上板策略 (跳过编译)
 * 适用于已编译的算子
 */
export class FastOnBoardStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'fast-onboard';

  constructor(private commandGenerator: CommandGeneratorService) {
    super();
  }

  getSteps(): IExecutionStep[] {
    return [
      // 直接上板,跳过编译
      new OnBoardStep(this.commandGenerator),
    ];
  }
}
