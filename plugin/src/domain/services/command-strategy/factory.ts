import { CommandStrategy } from './types';
import { AscendCommandStrategy } from './ascend-strategy';
import { CannCommandStrategy } from './cann-strategy';
import { PyAscCommandStrategy } from './pyasc-strategy';
import { TritonCommandStrategy } from './triton-strategy';

/**
 * command strategy factory
 *
 * Used to manage and obtain different types of command strategies
 *
 * @example
 * //Register new strategy
 * CommandStrategyFactory.register('trito', new TritoCommandStrategy());
 *
 * // Get strategy
 * const strategy = CommandStrategyFactory.getStrategy('ascend');
 */
export class CommandStrategyFactory {
  private static strategies: Map<string, CommandStrategy> = new Map([
    ['ascend', new AscendCommandStrategy()],
    ['cann', new CannCommandStrategy()],
    ['pyasc', new PyAscCommandStrategy()],
    ['triton', new TritonCommandStrategy()],
  ]);

  /**
   * Register a new command policy
   * @param opType operator type
   * @param strategy strategy instance
   *
   * @example
   * CommandStrategyFactory.register('trito', new TritoCommandStrategy());
   */
  static register(opType: string, strategy: CommandStrategy): void {
    this.strategies.set(opType, strategy);
  }

  /**
   * Get command strategy
   * @param opType operator type, if null or does not exist, returns cann strategy
   * Command strategy instance corresponding to @returns
   *
   * @example
   * const strategy = CommandStrategyFactory.getStrategy('ascend');
   * const defaultStrategy = CommandStrategyFactory.getStrategy(null); // Return cann strategy
   */
  static getStrategy(opType: string | null | undefined): CommandStrategy {
    if (!opType) {
      return this.strategies.get('cann')!;
    }

    return this.strategies.get(opType) || this.strategies.get('cann')!;
  }

  /**
   * Get all registered policy types
   * @returns strategy type array
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Check if a policy type is already registered
   * @param opType operator type
   * @returns Is it registered?
   */
  static hasStrategy(opType: string): boolean {
    return this.strategies.has(opType);
  }
}
