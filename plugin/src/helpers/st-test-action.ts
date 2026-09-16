export function shouldShowStTestAction(params: {
  canBuild: boolean;
  isStandardCustom: boolean;
}): boolean {
  return params.canBuild && params.isStandardCustom;
}

export function shouldShowStTestHistoryView(params: {
  hasOperateTree: boolean;
  isStandardCustomContext: boolean;
  historyWorkspaceCount: number;
}): boolean {
  return params.hasOperateTree
    && (
      params.isStandardCustomContext
      || params.historyWorkspaceCount > 0
    );
}

export type StTestSelectionState = 'ready' | 'none' | 'multiple' | 'noNpu';

export function getStTestSelectionState(selectedCount: number, npuAvailable: boolean): StTestSelectionState {
  if (selectedCount === 0) {
    return 'none';
  }

  if (selectedCount > 1) {
    return 'multiple';
  }

  return npuAvailable ? 'ready' : 'noNpu';
}
