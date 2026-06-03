import { socFromCoreName } from '@plugin/domain/utils/ascend-util';

describe('socFromCoreName host-detection rules', () => {
  it.each([
    'Ascend910_9362',
    'Ascend910_9372',
    'Ascend910_9381',
    'Ascend910_9382',
    'Ascend910_9391',
    'Ascend910_9392',
  ])('maps A3 core name %s to ascend910_93', (coreName) => {
    expect(socFromCoreName(coreName))
      .toBe('ascend910_93');
  });

  it.each([
    [
      'Ascend910B',
      'ascend910b',
    ],
    [
      'Ascend910B1',
      'ascend910b',
    ],
    [
      'Ascend910B2C',
      'ascend910b',
    ],
    [
      'Ascend910B3',
      'ascend910b',
    ],
    [
      'Ascend910B4',
      'ascend910b',
    ],
  ])('keeps 910B core name %s as %s', (coreName, slug) => {
    expect(socFromCoreName(coreName))
      .toBe(slug);
  });

  it('maps Ascend910A to ascend910b (910B family)', () => {
    expect(socFromCoreName('Ascend910A'))
      .toBe('ascend910b');
  });

  it.each([
    'Ascend950PR_9589',
    'Ascend950PR_9571',
    'Ascend950PR_95A1',
  ])('maps A5 core name %s to ascend950', (coreName) => {
    expect(socFromCoreName(coreName))
      .toBe('ascend950');
  });
});
