import {
  getStTestSelectionState,
  shouldShowStTestAction,
} from '@plugin/helpers/st-test-action';

describe('shouldShowStTestAction', () => {
  it.each([
    [
      true,
      true,
      true,
    ],
    [
      false,
      false,
      false,
    ],
    [
      false,
      true,
      false,
    ],
    [
      false,
      false,
      true,
    ],
  ])(
    'returns %s for canBuild=%s and standardCustom=%s',
    (expected, canBuild, isStandardCustom) => {
      expect(shouldShowStTestAction({
        canBuild,
        isStandardCustom,
      }))
        .toBe(expected);
    },
  );
});

describe('getStTestSelectionState', () => {
  it.each([
    [
      0,
      'none',
    ],
    [
      1,
      'ready',
    ],
    [
      2,
      'multiple',
    ],
  ] as const)('maps %i selected operators to %s', (selectedCount, expected) => {
    expect(getStTestSelectionState(selectedCount))
      .toBe(expected);
  });
});
