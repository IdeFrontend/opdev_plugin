import { CommandStrategy } from './types';
import { AscendCommandStrategy } from './ascend-strategy';
import { CannCommandStrategy } from './cann-strategy';
import { PyAscCommandStrategy } from './pyasc-strategy';

/**
 * 命令策略工厂
 *
 * 用于管理和获取不同类型的命令策略
 *
 * @example
 * // 注册新策略
 * CommandStrategyFactory.register('trito', new TritoCommandStrategy());
 *
 * // 获取策略
 * const strategy = CommandStrategyFactory.getStrategy('ascend');
 */
export class CommandStrategyFactory {
  private static strategies: Map<string, CommandStrategy> = new Map([
    ['ascend', new AscendCommandStrategy()],
    ['cann', new CannCommandStrategy()],
    ['pyasc', new PyAscCommandStrategy()],
  ]);

  /**
   * 注册新的命令策略
   * @param opType 算子类型
   * @param strategy 策略实例
   *
   * @example
   * CommandStrategyFactory.register('trito', new TritoCommandStrategy());
   */
  static register(opType: string, strategy: CommandStrategy): void {
    this.strategies.set(opType, strategy);
  }

  /**
   * 获取命令策略
   * @param opType 算子类型，如果为 null 或不存在，返回 cann 策略
   * @returns 对应的命令策略实例
   *
   * @example
   * const strategy = CommandStrategyFactory.getStrategy('ascend');
   * const defaultStrategy = CommandStrategyFactory.getStrategy(null); // 返回 cann 策略
   */
  static getStrategy(opType: string | null | undefined): CommandStrategy {
    if (!opType) {
      return this.strategies.get('cann')!;
    }

    return this.strategies.get(opType) || this.strategies.get('cann')!;
  }

  /**
   * 获取所有已注册的策略类型
   * @returns 策略类型数组
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 检查是否已注册某个策略类型
   * @param opType 算子类型
   * @returns 是否已注册
   */
  static hasStrategy(opType: string): boolean {
    return this.strategies.has(opType);
  }
}
