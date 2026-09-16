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
      true,
      'none',
    ],
    [
      0,
      false,
      'none',
    ],
    [
      1,
      true,
      'ready',
    ],
    [
      1,
      false,
      'noNpu',
    ],
    [
      2,
      true,
      'multiple',
    ],
    [
      2,
      false,
      'multiple',
    ],
  ] as const)('maps %i selected operators with npuAvailable=%s to %s', (selectedCount, npuAvailable, expected) => {
    expect(getStTestSelectionState(selectedCount, npuAvailable))
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
