import { Result } from '@plugin-v2/domain/shared/types/result.type';
import {
  ExecutionContext, IExecutionStep,
} from './execution-step.interface';

/**
 * 执行策略接口
 * 定义完整的算子任务执行策略
 */
export interface IExecutionStrategy {
  /**
   * 策略名称 (如 'standard-onboard', 'custom-onboard-with-validation')
   */
  readonly strategyName: string;

  /**
   * 获取执行步骤链
   * @returns 按顺序执行的步骤数组
   */
  getSteps(): IExecutionStep[];

  /**
   * 执行策略
   * 按顺序执行所有步骤,支持责任链传递
   * @param context 执行上下文
   */
  execute(context: ExecutionContext): Promise<Result<void, Error>>;
}

/**
 * 抽象执行策略基类
 * 提供模板方法实现
 */
export abstract class AbstractExecutionStrategy implements IExecutionStrategy {
  abstract readonly strategyName: string;
  abstract getSteps(): IExecutionStep[];

  /**
   * 模板方法:执行策略
   * 子类无需重写,可通过组合不同步骤实现差异化
   */
  async execute(context: ExecutionContext): Promise<Result<void, Error>> {
    const steps = this.getSteps();

    for (const step of steps) {
      // 检查是否可以跳过
      if (step.canSkip?.(context)) {
        continue;
      }

      // 执行步骤
      const stepResult = await step.execute(context);

      // 如果失败,立即返回
      if (this.isError(stepResult)) {
        return stepResult as Result<void, Error>;
      }

      // 将结果传递给下一步 (责任链模式)
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
