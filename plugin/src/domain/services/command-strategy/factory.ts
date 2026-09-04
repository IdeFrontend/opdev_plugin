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
 * // Get strategy
 * const strategy = CommandStrategyFactory.getStrategy('ascend');
 */
export class CommandStrategyFactory {
  private static strategies = new Map<string, CommandStrategy>([
    [
      'ascend',
      new AscendCommandStrategy(),
    ],
    [
      'cann',
      new CannCommandStrategy(),
    ],
    [
      'pyasc',
      new PyAscCommandStrategy(),
    ],
    [
      'triton',
      new TritonCommandStrategy(),
    ],
  ]);

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
}
