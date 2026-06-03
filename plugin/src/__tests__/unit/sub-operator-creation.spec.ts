import { isSubOperatorCreation } from '@plugin/domain/utils/sub-operator-creation';

describe('isSubOperatorCreation', () => {
  const base = {
    subOpDir: '/repo/experimental/add',
    isStandardCustomViewId: true,
    hasAncestorGenop: () => true,
  };

  it('is true for a standard-custom view id nested under a --genop collection', () => {
    expect(isSubOperatorCreation(base))
      .toBe(true);
  });

  it('is false when the requested view id is not standard-custom', () => {
    expect(isSubOperatorCreation({
      ...base,
      isStandardCustomViewId: false,
    }))
      .toBe(false);
  });

  it('is false when there is no --genop ancestor collection', () => {
    expect(isSubOperatorCreation({
      ...base,
      hasAncestorGenop: () => false,
    }))
      .toBe(false);
  });
});
