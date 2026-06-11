import {
  getFlavorDefault,
  isFlavorGated,
  FLAVOR_GATES,
} from '@shared/flavor';
import {
  isDumpTensorEnabled,
  isMsAgentAiFixEnabled,
  isOperatorSupportEnabled,
  isSanitizerEnabled,
} from '@plugin/helpers/feature-toggle';

describe('feature-toggle with huawei flavor defaults', () => {
  it('exposes only operatorSupport.triton in generated flavor gates', () => {
    expect(FLAVOR_GATES['operatorSupport.triton'])
      .toBe(true);
    expect(isFlavorGated('operatorSupport.triton'))
      .toBe(true);
  });

  it('uses flavor default for operator support triton', () => {
    expect(getFlavorDefault('operatorSupport.triton'))
      .toBe(false);
    expect(isSanitizerEnabled())
      .toBe(true);
    expect(isDumpTensorEnabled())
      .toBe(true);
  });

  it('delegates operator support to settings when flavor gate is on', () => {
    expect(isOperatorSupportEnabled('cann'))
      .toBe(true);
    expect(isOperatorSupportEnabled('triton'))
      .toBe(false);
  });

  it('msAgent respects manifest default when setting unset', () => {
    expect(isMsAgentAiFixEnabled())
      .toBe(false);
  });
});
