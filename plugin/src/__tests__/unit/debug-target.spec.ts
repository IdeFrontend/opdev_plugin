import {
  resolveDebugTargetBinary,
  shouldReplaceDebugTarget,
} from '@plugin/domain/utils/debug-target';

describe('resolveDebugTargetBinary', () => {
  it('returns the operator-named binary when the build emitted it', () => {
    expect(resolveDebugTargetBinary(
      [
        'addn_custom',
        'CMakeCache.txt',
        'libkernel.so',
        'addn_custom.o',
      ],
      'addn_custom',
    ))
      .toBe('addn_custom');
  });

  it('selects the binary for the requested operator, ignoring siblings', () => {
    expect(resolveDebugTargetBinary(
      [
        'add_custom',
        'sub_custom',
      ],
      'sub_custom',
    ))
      .toBe('sub_custom');
  });

  it('trims surrounding whitespace from the operator name', () => {
    expect(resolveDebugTargetBinary(['matmul'], '  matmul  '))
      .toBe('matmul');
  });

  it('returns undefined when the operator binary is not among the build files', () => {
    expect(resolveDebugTargetBinary(
      [
        'Makefile',
        'libkernel.so',
        'add_custom.o',
      ],
      'add_custom',
    ))
      .toBeUndefined();
  });

  it('returns undefined when no operator name is given (no guessing)', () => {
    expect(resolveDebugTargetBinary(['addn_custom']))
      .toBeUndefined();
  });

  it('returns undefined for an empty build directory', () => {
    expect(resolveDebugTargetBinary([], 'addn_custom'))
      .toBeUndefined();
  });
});

describe('shouldReplaceDebugTarget', () => {
  it('replaces a missing target', () => {
    expect(shouldReplaceDebugTarget(undefined, false))
      .toBe(true);
  });

  it('replaces the default placeholder target', () => {
    expect(shouldReplaceDebugTarget(
      '${workspaceFolder}/build/${workspaceFolderBasename}',
      true,
    ))
      .toBe(true);
  });

  it('replaces a target whose file does not exist', () => {
    expect(shouldReplaceDebugTarget('${workspaceFolder}/build/stale', false))
      .toBe(true);
  });

  it('keeps a user-customized target that exists', () => {
    expect(shouldReplaceDebugTarget(
      '${workspaceFolder}/build/test_aclnn_add_example',
      true,
    ))
      .toBe(false);
  });
});
