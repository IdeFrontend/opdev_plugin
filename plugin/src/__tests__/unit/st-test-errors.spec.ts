import {
  StTestCancelledError,
  isStTestCancelledError,
} from '@plugin/domain/services/st-test-errors';

describe('StTestCancelledError / isStTestCancelledError', () => {
  it('isStTestCancelledError matches the class instance via instanceof', () => {
    expect(isStTestCancelledError(new StTestCancelledError()))
      .toBe(true);
  });

  it('matches a structurally identical error carrying the marker name', () => {
    // Errors serialized across the task/terminal boundary lose their class but
    // keep the name — the name-based fallback must still recognize them.
    const revived = Object.assign(new Error('ST test cancelled'), { name: 'StTestCancelledError' });

    expect(isStTestCancelledError(revived))
      .toBe(true);
  });

  it('rejects a plain Error with a different name', () => {
    expect(isStTestCancelledError(new Error('boom')))
      .toBe(false);
  });

  it('rejects non-Error values', () => {
    expect(isStTestCancelledError('ST test cancelled'))
      .toBe(false);
    expect(isStTestCancelledError({ name: 'StTestCancelledError' }))
      .toBe(false);
    expect(isStTestCancelledError(undefined))
      .toBe(false);
    expect(isStTestCancelledError(null))
      .toBe(false);
  });

  it('StTestCancelledError carries its message and name', () => {
    const error = new StTestCancelledError();

    expect(error.message)
      .toBe('ST test cancelled');
    expect(error.name)
      .toBe('StTestCancelledError');
  });
});
