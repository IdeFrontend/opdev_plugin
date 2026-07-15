export function shouldShowStTestAction(params: {
  canBuild: boolean;
  isStandardCustom: boolean;
}): boolean {
  return params.canBuild && params.isStandardCustom;
}

export type StTestSelectionState = 'ready' | 'none' | 'multiple';

export function getStTestSelectionState(selectedCount: number): StTestSelectionState {
  if (selectedCount === 1) {
    return 'ready';
  }

  return selectedCount === 0 ? 'none' : 'multiple';
}
