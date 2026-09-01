import { CommandStrategyFactory } from '@plugin/domain/services/command-strategy/factory';
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import { PyAscCommandStrategy } from '@plugin/domain/services/command-strategy/pyasc-strategy';
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';

describe('CommandStrategyFactory.getStrategy', () => {
  it('returns the strategy registered for each known op type', () => {
    expect(CommandStrategyFactory.getStrategy('ascend'))
      .toBeInstanceOf(AscendCommandStrategy);
    expect(CommandStrategyFactory.getStrategy('cann'))
      .toBeInstanceOf(CannCommandStrategy);
    expect(CommandStrategyFactory.getStrategy('pyasc'))
      .toBeInstanceOf(PyAscCommandStrategy);
    expect(CommandStrategyFactory.getStrategy('triton'))
      .toBeInstanceOf(TritonCommandStrategy);
  });

  it('returns the cann strategy for a null or undefined op type', () => {
    expect(CommandStrategyFactory.getStrategy(null))
      .toBeInstanceOf(CannCommandStrategy);
    expect(CommandStrategyFactory.getStrategy(undefined))
      .toBeInstanceOf(CannCommandStrategy);
  });

  it('returns the cann strategy for an empty op type', () => {
    expect(CommandStrategyFactory.getStrategy(''))
      .toBeInstanceOf(CannCommandStrategy);
  });

  it('falls back to the cann strategy for an unknown op type', () => {
    expect(CommandStrategyFactory.getStrategy('unknown-op-type'))
      .toBeInstanceOf(CannCommandStrategy);
  });
});
