import { isStandardCustomProjectType } from '@shared/project-type-view-id';

describe('isStandardCustomProjectType', () => {
  it('accepts both detected and stored standard-custom project types', () => {
    expect(isStandardCustomProjectType('standard-custom'))
      .toBe(true);
    expect(isStandardCustomProjectType('ascend'))
      .toBe(true);
  });

  it('rejects non standard-custom project types', () => {
    expect(isStandardCustomProjectType('cann'))
      .toBe(false);
    expect(isStandardCustomProjectType('pyasc'))
      .toBe(false);
    expect(isStandardCustomProjectType('triton'))
      .toBe(false);
  });
});
