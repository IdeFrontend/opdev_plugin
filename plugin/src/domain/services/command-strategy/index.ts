/**
 * 命令策略模块
 *
 * 提供了基于策略模式的命令生成系统，支持不同类型的算子命令生成。
 *
 * @module command-strategy
 *
 * @example
 * // 导入策略工厂
 * import { CommandStrategyFactory } from './command-strategy';
 *
 * // 获取策略
 * const strategy = CommandStrategyFactory.getStrategy('ascend');
 *
 * // 使用策略生成命令
 * const command = strategy.buildOpCommand(params);
 *
 * @example
 * // 注册自定义策略
 * import { CommandStrategyFactory } from './command-strategy';
 * import type { CommandStrategy } from './command-strategy';
 *
 * class CustomStrategy implements CommandStrategy {
 *   // 实现接口方法...
 * }
 *
 * CommandStrategyFactory.register('custom', new CustomStrategy());
 */

// 导出类型定义
export type {
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
  BaseContext,
  CommandStrategy,
} from './types';

// 导出策略实现
export { AscendCommandStrategy } from './ascend-strategy';
export { CannCommandStrategy } from './cann-strategy';

// 导出工厂类
export { CommandStrategyFactory } from './factory';
