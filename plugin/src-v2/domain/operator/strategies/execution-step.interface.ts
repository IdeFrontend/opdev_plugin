import { Result } from '@plugin-v2/domain/shared/types/result.type';
import { ICommandExecutor } from '@plugin-v2/application/interfaces/command-executor.interface';

/**
 * 执行步骤上下文
 * 包含执行所需的所有配置和状态
 */
export interface ExecutionContext {
  /** 主配置 ID (如上板配置、仿真配置) */
  primaryConfigId: number;

  /** 构建配置 ID */
  buildConfigId: number;

  /** 示例配置 ID */
  exampleConfigId: number;

  /** 算子类型特定参数 */
  parameters?: Record<string, unknown>;

  /** 执行器 */
  executor: ICommandExecutor;

  /** 前序步骤的执行结果 (用于责任链传递) */
  previousResult?: unknown;
}

/**
 * 执行步骤接口
 * 每个步骤都是独立的、可组合的单元
 */
export interface IExecutionStep {
  /**
   * 步骤名称 (用于日志和错误追踪)
   */
  readonly name: string;

  /**
   * 执行步骤
   * @param context 执行上下文
   * @returns 执行结果,包含可能传递给下一步的数据
   */
  execute(context: ExecutionContext): Promise<Result<unknown, Error>>;

  /**
   * 是否可以跳过此步骤 (可选)
   * @param context 执行上下文
   */
  canSkip?(context: ExecutionContext): boolean;
}
