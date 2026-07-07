import { isSubOperatorCreation } from '@plugin/domain/utils/sub-operator-creation';

describe('isSubOperatorCreation', () => {
  const base = {
    subOpDir: '/repo/ops-math/math/add',
    workspaceRoot: '/repo/ops-math',
    isStandardCustomViewId: true,
    currentProjectType: 'standard-custom',
  };

  it('is true for a standard-custom view id nested under the current standard-custom workspace', () => {
    expect(isSubOperatorCreation(base))
      .toBe(true);
  });

  it('treats legacy stored project_type=ascend as the current standard-custom workspace', () => {
    expect(isSubOperatorCreation({
      ...base,
      currentProjectType: 'ascend',
    }))
      .toBe(true);
  });

  it('is false when the requested view id is not standard-custom', () => {
    expect(isSubOperatorCreation({
      ...base,
      isStandardCustomViewId: false,
    }))
      .toBe(false);
  });

  it('is false when the current workspace is not standard-custom', () => {
    expect(isSubOperatorCreation({
      ...base,
      currentProjectType: 'cann',
    }))
      .toBe(false);
  });

  it('is false when the target directory is outside the current workspace', () => {
    expect(isSubOperatorCreation({
      ...base,
      subOpDir: '/repo/other/math/add',
    }))
      .toBe(false);
  });
});
