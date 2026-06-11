import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  resolveDebugTargetBinary,
  debugTargetCandidates,
  toWorkspaceRelativeTarget,
  shouldReplaceDebugTarget,
  updateMsdebugTarget,
} from '@plugin/domain/utils/debug-target';

const DEFAULT_TARGET = '${workspaceFolder}/build/${workspaceFolderBasename}';

describe('resolveDebugTargetBinary', () => {
  it('returns the first candidate present, honoring priority order', () => {
    expect(resolveDebugTargetBinary(
      [
        'add_custom',
        'test_aclnn_add_custom',
        'libkernel.so',
      ],
      [
        'test_aclnn_add_custom',
        'add_custom',
      ],
    ))
      .toBe('test_aclnn_add_custom');
  });

  it('falls back to the next candidate when the preferred one is absent', () => {
    expect(resolveDebugTargetBinary(
      ['add_custom'],
      [
        'test_aclnn_add_custom',
        'add_custom',
      ],
    ))
      .toBe('add_custom');
  });

  it('returns undefined when no candidate is among the build files', () => {
    expect(resolveDebugTargetBinary(
      [
        'libkernel.so',
        'add_custom.o',
      ],
      [
        'test_aclnn_add_custom',
        'add_custom',
      ],
    ))
      .toBeUndefined();
  });

  it('returns undefined for an empty candidate list (no guessing)', () => {
    expect(resolveDebugTargetBinary(['add_custom'], []))
      .toBeUndefined();
  });

  it('returns undefined for an empty build directory', () => {
    expect(resolveDebugTargetBinary([], ['add_custom']))
      .toBeUndefined();
  });
});

describe('debugTargetCandidates', () => {
  it('offers the AscendC aclnn example before the bare operator binary', () => {
    expect(debugTargetCandidates('add_custom'))
      .toEqual([
        'test_aclnn_add_custom',
        'add_custom',
      ]);
  });

  it('trims surrounding whitespace from the operator name', () => {
    expect(debugTargetCandidates('  matmul  '))
      .toEqual([
        'test_aclnn_matmul',
        'matmul',
      ]);
  });

  it('returns no candidates for a blank or missing operator name', () => {
    expect(debugTargetCandidates(''))
      .toEqual([]);
    expect(debugTargetCandidates(undefined))
      .toEqual([]);
  });
});

describe('toWorkspaceRelativeTarget', () => {
  it('expresses a nested operator binary relative to the workspace folder', () => {
    const root = path.join(path.sep, 'ws');

    expect(toWorkspaceRelativeTarget(
      root,
      path.join(root, 'math', 'add_custom', 'build', 'test_aclnn_add_custom'),
    ))
      .toBe('${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom');
  });

  it('falls back to an absolute posix path when the binary is outside the workspace', () => {
    const root = path.join(path.sep, 'ws');
    const outside = path.join(path.sep, 'other', 'build', 'add_custom');

    expect(toWorkspaceRelativeTarget(root, outside))
      .toBe('/other/build/add_custom');
  });
});

describe('shouldReplaceDebugTarget', () => {
  it('replaces a missing target', () => {
    expect(shouldReplaceDebugTarget(undefined, false))
      .toBe(true);
  });

  it('replaces the default placeholder target', () => {
    expect(shouldReplaceDebugTarget(DEFAULT_TARGET, true))
      .toBe(true);
  });

  it('replaces a target whose file does not exist', () => {
    expect(shouldReplaceDebugTarget('${workspaceFolder}/build/stale', false))
      .toBe(true);
  });

  it('keeps a user-customized target that exists', () => {
    expect(shouldReplaceDebugTarget(
      '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
      true,
    ))
      .toBe(false);
  });
});

describe('updateMsdebugTarget', () => {
  let root: string;

  function mkWorkspace(configs: Array<Record<string, unknown>>): void {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-'));
    const vscodeDir = path.join(root, '.vscode');

    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'launch.json'),
      JSON.stringify({
        version: '0.2.0',
        configurations: configs,
      }, null, 2),
      'utf-8',
    );
  }

  function buildOperatorBinary(opRelPath: string, binaryName: string): string {
    const buildDir = path.join(root, opRelPath, 'build');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, binaryName), '#!/bin/sh\n', 'utf-8');

    return path.join(root, opRelPath);
  }

  function readConfigs(): Array<Record<string, unknown>> {
    return JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'launch.json'), 'utf-8')).configurations;
  }

  afterEach(() => {
    if (root) {
      fs.rmSync(root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('auto-adapts the msdebug target to a nested AscendC operator binary (#17)', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom');
  });

  it('auto-adapts to the bare cann operator binary when there is no aclnn example', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);
    const opPath = buildOperatorBinary(path.join('math', 'add_custom'), 'add_custom');

    await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/math/add_custom/build/add_custom');
  });

  it('updates both msdebug and msdebug-cpu, leaving msdebug-python untouched', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
      {
        name: 'msdebug-cpu',
        target: DEFAULT_TARGET,
      },
      {
        name: 'msdebug-python',
        target: '/usr/local/bin/python',
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    const configs = readConfigs();
    const expected = '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom';

    expect(configs[0].target)
      .toBe(expected);
    expect(configs[1].target)
      .toBe(expected);
    expect(configs[2].target)
      .toBe('/usr/local/bin/python');
  });

  it('preserves a valid user-set target that points to an existing file', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: '${workspaceFolder}/custom/my_target',
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    fs.mkdirSync(path.join(root, 'custom'), { recursive: true });
    fs.writeFileSync(path.join(root, 'custom', 'my_target'), '', 'utf-8');

    await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/custom/my_target');
  });

  it('replaces a stale target that points to a missing file', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: '${workspaceFolder}/build/old_binary',
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom');
  });

  it('does nothing when the operator binary was not built (no clobbering)', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);

    await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: path.join(root, 'math', 'add_custom'),
    });

    expect(readConfigs()[0].target)
      .toBe(DEFAULT_TARGET);
  });

  it('does nothing when no operator is provided', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);

    await updateMsdebugTarget(root, undefined);

    expect(readConfigs()[0].target)
      .toBe(DEFAULT_TARGET);
  });

  it('does not throw or create a file when launch.json is absent', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-'));

    await expect(updateMsdebugTarget(root, {
      name: 'add_custom',
      path: path.join(root, 'math', 'add_custom'),
    }))
      .resolves
      .toBeUndefined();

    expect(fs.existsSync(path.join(root, '.vscode', 'launch.json')))
      .toBe(false);
  });
});
