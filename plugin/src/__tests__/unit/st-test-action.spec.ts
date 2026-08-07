import {
  getStTestSelectionState,
  shouldShowStTestAction,
  shouldShowStTestHistoryView,
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

describe('shouldShowStTestHistoryView', () => {
  it.each([
    [
      true,
      true,
      true,
      0,
    ],
    [
      true,
      true,
      false,
      1,
    ],
    [
      false,
      true,
      false,
      0,
    ],
    [
      false,
      false,
      true,
      0,
    ],
  ])(
    'returns %s for hasOperateTree=%s isStandardCustomContext=%s historyWorkspaceCount=%i',
    (expected, hasOperateTree, isStandardCustomContext, historyWorkspaceCount) => {
      expect(shouldShowStTestHistoryView({
        hasOperateTree,
        isStandardCustomContext,
        historyWorkspaceCount,
      }))
        .toBe(expected);
    },
  );
});
