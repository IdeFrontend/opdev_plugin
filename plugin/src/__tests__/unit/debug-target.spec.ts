/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  listBuildFiles,
  resolveDebugTargetBinary,
  debugTargetCandidates,
  collectDebugTargetCandidates,
  basenameFromTargetFile,
  toWorkspaceRelativeTarget,
  shouldReplaceDebugTarget,
  patchMsdebugLaunchConfigTarget,
  updateMsdebugTarget,
  msdebugConfiguredTargetExists,
  registerMsdebugTargetAutoAdapt,
  DEFAULT_MSDEBUG_TARGET,
  DEFAULT_REMOTE_MSDEBUG_TARGET,
} from '@plugin/domain/utils/debug-target';

jest.mock('vscode', () => ({
  debug: { registerDebugConfigurationProvider: jest.fn() },
  env: { uriScheme: 'vscode' },
  workspace: { getConfiguration: () => ({ get: (_key: string, defaultValue?: unknown) => defaultValue }) },
}));

const DEFAULT_TARGET = DEFAULT_MSDEBUG_TARGET;

// File symlinks need elevation (or Developer Mode) on Windows; probe once and
// skip the one test that cannot be expressed as a directory junction instead.
const FILE_SYMLINKS_AVAILABLE = ((): boolean => {
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-probe-'));

  try {
    const probeTarget = path.join(probeRoot, 'target');

    fs.writeFileSync(probeTarget, '');
    fs.symlinkSync(probeTarget, path.join(probeRoot, 'link'));

    return true;
  }
  catch {
    return false;
  }
  finally {
    fs.rmSync(probeRoot, {
      force: true,
      recursive: true,
    });
  }
})();

// Junctions link directories without privileges on Windows.
const dirLinkType = process.platform === 'win32' ? 'junction' : 'dir';

describe('listBuildFiles', () => {
  let buildDir: string;

  beforeEach(() => {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-files-'));
  });

  afterEach(() => {
    fs.rmSync(buildDir, {
      force: true,
      recursive: true,
    });
  });

  (FILE_SYMLINKS_AVAILABLE ? it : it.skip)('lists a symlinked binary — withFileTypes reports the link, not its target', () => {
    fs.writeFileSync(path.join(buildDir, 'add_custom'), '');
    fs.symlinkSync(path.join(buildDir, 'add_custom'), path.join(buildDir, 'test_aclnn_add_custom'));
    fs.mkdirSync(path.join(buildDir, 'CMakeFiles'));

    expect(listBuildFiles(buildDir)
      .sort())
      .toEqual([
        'add_custom',
        'test_aclnn_add_custom',
      ]);
  });

  it('drops a dangling symlink left over from an earlier build', () => {
    fs.writeFileSync(path.join(buildDir, 'add_custom'), '');
    fs.symlinkSync(
      path.join(buildDir, 'removed_binary'),
      path.join(buildDir, 'test_aclnn_stale'),
      dirLinkType,
    );

    expect(listBuildFiles(buildDir))
      .toEqual(['add_custom']);
  });

  it('drops a link to a directory — msdebug cannot run one', () => {
    fs.writeFileSync(path.join(buildDir, 'add_custom'), '');
    fs.mkdirSync(path.join(buildDir, 'CMakeFiles'));
    fs.symlinkSync(
      path.join(buildDir, 'CMakeFiles'),
      path.join(buildDir, 'test_aclnn_add_custom'),
      dirLinkType,
    );

    expect(listBuildFiles(buildDir))
      .toEqual(['add_custom']);
  });

  it('survives a self-referencing link instead of losing the listing to ELOOP', () => {
    fs.writeFileSync(path.join(buildDir, 'add_custom'), '');
    fs.symlinkSync(
      path.join(buildDir, 'loop'),
      path.join(buildDir, 'loop'),
      dirLinkType,
    );

    expect(listBuildFiles(buildDir))
      .toEqual(['add_custom']);
  });

  it('returns nothing for a missing or unreadable directory instead of throwing', () => {
    expect(listBuildFiles(path.join(buildDir, 'nope')))
      .toEqual([]);
    expect(listBuildFiles(''))
      .toEqual([]);
  });
});

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
  it('offers the AscendC aclnn example before graph and the bare operator binary', () => {
    expect(debugTargetCandidates('add_custom'))
      .toEqual([
        'test_aclnn_add_custom',
        'test_geir_add_custom',
        'add_custom',
      ]);
  });

  it('trims surrounding whitespace from the operator name', () => {
    expect(debugTargetCandidates('  matmul  '))
      .toEqual([
        'test_aclnn_matmul',
        'test_geir_matmul',
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

describe('collectDebugTargetCandidates', () => {
  it('prefers build_example target_file basename when it differs from defaults', () => {
    expect(collectDebugTargetCandidates(
      'customop',
      '/ws/math/customop/build/demo_customop',
    ))
      .toEqual([
        'demo_customop',
        'test_aclnn_customop',
        'test_geir_customop',
        'customop',
      ]);
  });

  it('does not duplicate a basename already in the default list', () => {
    expect(collectDebugTargetCandidates(
      'add_custom',
      '/ws/add_custom/build/test_aclnn_add_custom',
    ))
      .toEqual(debugTargetCandidates('add_custom'));
  });
});

describe('basenameFromTargetFile', () => {
  it('returns the basename of a target_file path', () => {
    expect(basenameFromTargetFile('/ws/math/op/build/test_aclnn_op'))
      .toBe('test_aclnn_op');
  });

  it('returns undefined for a path with no basename', () => {
    expect(basenameFromTargetFile('/'))
      .toBeUndefined();
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

  it('replaces a stale 1.3.2 workspace-root build/ target when the nested path is known', () => {
    expect(shouldReplaceDebugTarget(
      '${workspaceFolder}/build/add_custom',
      true,
      '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
    ))
      .toBe(true);
  });

  it('keeps a custom existing target that is not the root build pattern', () => {
    expect(shouldReplaceDebugTarget(
      '${workspaceFolder}/custom/my_target',
      true,
      '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
    ))
      .toBe(false);
  });

  it('replaces a missing remote-debug target using the remote placeholder', () => {
    expect(shouldReplaceDebugTarget(undefined, false, undefined, 'remote-debug'))
      .toBe(true);
  });

  it('replaces the untouched remote-debug placeholder target', () => {
    expect(shouldReplaceDebugTarget(DEFAULT_REMOTE_MSDEBUG_TARGET, true, undefined, 'remote-debug'))
      .toBe(true);
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

  it('auto-adapts the msdebug target to a nested AscendC operator binary', async () => {
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

  it('falls back to the repo-root build dir when the operator has none (ops-nn / ops-math, #17)', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);
    // build.sh of a standard-custom repo builds into `<repo>/build`, not `<op>/build`.
    buildOperatorBinary('.', 'test_aclnn_ada_layer_norm_v2');

    await updateMsdebugTarget(root, {
      name: 'ada_layer_norm_v2',
      path: path.join(root, 'norm', 'ada_layer_norm_v2'),
    });

    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/build/test_aclnn_ada_layer_norm_v2');
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

  it('auto-adapts to a graph-only operator binary', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'pows'),
      'test_geir_pows',
    );

    const result = await updateMsdebugTarget(root, {
      name: 'pows',
      path: opPath,
    });

    expect(result)
      .toEqual({
        status: 'patched',
        target: '${workspaceFolder}/math/pows/build/test_geir_pows',
      });
    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/math/pows/build/test_geir_pows');
  });

  it('replaces a stale workspace-root build/ target that still exists on disk', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: '${workspaceFolder}/build/add_custom',
      },
    ]);
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    fs.writeFileSync(path.join(root, 'build', 'add_custom'), '#!/bin/sh\n', 'utf-8');
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

  it('reports noop when the operator binary was not built', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);

    const result = await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: path.join(root, 'math', 'add_custom'),
    });

    expect(result)
      .toEqual({
        status: 'noop',
        reason: 'no_binary',
      });
    expect(readConfigs()[0].target)
      .toBe(DEFAULT_TARGET);
  });

  it('reports noop when no operator is provided', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);

    const result = await updateMsdebugTarget(root, undefined);

    expect(result)
      .toEqual({
        status: 'noop',
        reason: 'no_operator',
      });
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
      .toEqual({
        status: 'noop',
        reason: 'no_launch_json',
      });

    expect(fs.existsSync(path.join(root, '.vscode', 'launch.json')))
      .toBe(false);
  });

  it('reports unparseable when launch.json is not valid JSON', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_TARGET,
      },
    ]);
    fs.writeFileSync(path.join(root, '.vscode', 'launch.json'), '{ not json', 'utf-8');
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    await expect(updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    }))
      .resolves
      .toEqual({
        status: 'noop',
        reason: 'unparseable',
      });
  });

  it('reports unparseable when launch.json has no configurations array', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-'));
    const vscodeDir = path.join(root, '.vscode');

    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'launch.json'),
      JSON.stringify({ version: '0.2.0' }, null, 2),
      'utf-8',
    );
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    await expect(updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    }))
      .resolves
      .toEqual({
        status: 'noop',
        reason: 'unparseable',
      });
  });

  it('auto-adapts the remote-debug target to the remote workspace binary', async () => {
    mkWorkspace([
      {
        name: 'remote-debug',
        target: DEFAULT_REMOTE_MSDEBUG_TARGET,
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    const result = await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    // The returned target prefers the plain msdebug resolution (workspaceFolder),
    // while the config itself is patched to the remote variant.
    expect(result)
      .toEqual({
        status: 'patched',
        target: '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
      });
    expect(readConfigs()[0].target)
      .toBe('${remoteWorkspaceFolder}/math/add_custom/build/test_aclnn_add_custom');
  });

  it('does not overwrite a valid user-set remote-debug target', async () => {
    mkWorkspace([
      {
        name: 'remote-debug',
        target: '${workspaceFolder}/custom/my_remote_target',
      },
    ]);
    fs.mkdirSync(path.join(root, 'custom'), { recursive: true });
    fs.writeFileSync(path.join(root, 'custom', 'my_remote_target'), '', 'utf-8');
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    const result = await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    expect(result)
      .toEqual({
        status: 'noop',
        reason: 'user_target',
      });
    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/custom/my_remote_target');
  });

  it('patches a remote-debug config whose target is not a string', async () => {
    mkWorkspace([
      {
        name: 'remote-debug',
        target: 42,
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    const result = await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    expect(result)
      .toEqual({
        status: 'patched',
        target: '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
      });
    expect(readConfigs()[0].target)
      .toBe('${remoteWorkspaceFolder}/math/add_custom/build/test_aclnn_add_custom');
  });

  it('patches an msdebug config whose target is not a string', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: 42,
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    const result = await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    expect(result)
      .toEqual({
        status: 'patched',
        target: '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
      });
    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom');
  });

  it('returns unchanged when the msdebug target already matches the binary', async () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
      },
    ]);
    const opPath = buildOperatorBinary(
      path.join('math', 'add_custom'),
      'test_aclnn_add_custom',
    );

    const result = await updateMsdebugTarget(root, {
      name: 'add_custom',
      path: opPath,
    });

    expect(result)
      .toEqual({ status: 'unchanged' });
    expect(readConfigs()[0].target)
      .toBe('${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom');
  });
});

describe('patchMsdebugLaunchConfigTarget', () => {
  it('patches an in-memory msdebug config for the Run panel flow', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-patch-'));
    const opPath = path.join(root, 'math', 'add_custom');
    const buildDir = path.join(opPath, 'build');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'test_aclnn_add_custom'), '#!/bin/sh\n', 'utf-8');

    const patched = patchMsdebugLaunchConfigTarget(
      root,
      {
        name: 'msdebug',
        type: 'msdebug-mi',
        request: 'launch',
        target: DEFAULT_TARGET,
      },
      {
        name: 'add_custom',
        path: opPath,
      },
    );

    expect(patched.target)
      .toBe('${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom');

    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('leaves a non-msdebug config untouched', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-patch-'));
    const opPath = path.join(root, 'math', 'add_custom');
    const buildDir = path.join(opPath, 'build');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'test_aclnn_add_custom'), '#!/bin/sh\n', 'utf-8');

    const config = {
      name: 'other',
      type: 'some-other-adapter',
      request: 'launch',
      target: '/usr/local/bin/tool',
    };

    expect(patchMsdebugLaunchConfigTarget(root, config, {
      name: 'add_custom',
      path: opPath,
    }))
      .toBe(config);

    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('patches a remote-debug config to the remote workspace binary', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-patch-'));
    const opPath = path.join(root, 'math', 'add_custom');
    const buildDir = path.join(opPath, 'build');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'test_aclnn_add_custom'), '#!/bin/sh\n', 'utf-8');

    const patched = patchMsdebugLaunchConfigTarget(
      root,
      {
        name: 'remote-debug',
        type: 'msdebug-mi-remote',
        request: 'launch',
        target: DEFAULT_REMOTE_MSDEBUG_TARGET,
      },
      {
        name: 'add_custom',
        path: opPath,
      },
    );

    expect(patched.target)
      .toBe('${remoteWorkspaceFolder}/math/add_custom/build/test_aclnn_add_custom');

    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('leaves the config unchanged when the operator binary was not built', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-patch-'));

    const config = {
      name: 'msdebug',
      type: 'msdebug-mi',
      request: 'launch',
      target: DEFAULT_TARGET,
    };

    expect(patchMsdebugLaunchConfigTarget(root, config, {
      name: 'add_custom',
      path: path.join(root, 'math', 'add_custom'),
    }))
      .toBe(config);

    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('patches when the configured target is not a string', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-patch-'));
    const opPath = path.join(root, 'math', 'add_custom');
    const buildDir = path.join(opPath, 'build');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'test_aclnn_add_custom'), '#!/bin/sh\n', 'utf-8');

    const patched = patchMsdebugLaunchConfigTarget(
      root,
      {
        name: 'msdebug',
        type: 'msdebug-mi',
        request: 'launch',
        target: 42,
      },
      {
        name: 'add_custom',
        path: opPath,
      },
    );

    expect(patched.target)
      .toBe('${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom');

    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  it('keeps a valid existing user target', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-patch-'));
    const opPath = path.join(root, 'math', 'add_custom');
    const buildDir = path.join(opPath, 'build');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'test_aclnn_add_custom'), '#!/bin/sh\n', 'utf-8');
    fs.mkdirSync(path.join(root, 'custom'), { recursive: true });
    fs.writeFileSync(path.join(root, 'custom', 'my_target'), '', 'utf-8');

    const config = {
      name: 'msdebug',
      type: 'msdebug-mi',
      request: 'launch',
      target: '${workspaceFolder}/custom/my_target',
    };

    expect(patchMsdebugLaunchConfigTarget(root, config, {
      name: 'add_custom',
      path: opPath,
    }))
      .toBe(config);

    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });
});

describe('msdebugConfiguredTargetExists', () => {
  let root: string;

  function mkWorkspace(configs: Array<Record<string, unknown>>): void {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-exists-'));
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

  function writeTargetBinary(relTarget: string): void {
    const abs = path.join(root, relTarget);

    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '#!/bin/sh\n', 'utf-8');
  }

  afterEach(() => {
    if (root) {
      fs.rmSync(root, {
        recursive: true,
        force: true,
      });
      root = '';
    }
  });

  it('returns true when the configured target exists on disk', () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
      },
    ]);
    writeTargetBinary(path.join('math', 'add_custom', 'build', 'test_aclnn_add_custom'));

    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBe(true);
  });

  it('returns false when the configured target is a concrete path that is missing', () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: '${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
      },
    ]);

    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBe(false);
  });

  it('returns false for the untouched default placeholder target', () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: DEFAULT_MSDEBUG_TARGET,
      },
    ]);

    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBe(false);
  });

  it('resolves the requested config independently (msdebug-cpu)', () => {
    mkWorkspace([
      {
        name: 'msdebug',
        target: '${workspaceFolder}/build/npu_bin',
      },
      {
        name: 'msdebug-cpu',
        target: '${workspaceFolder}/build/cpu_bin',
      },
    ]);
    writeTargetBinary(path.join('build', 'cpu_bin'));

    expect(msdebugConfiguredTargetExists(root, 'msdebug-cpu'))
      .toBe(true);
    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBe(false);
  });

  it('returns undefined when the named config is absent (do not block)', () => {
    mkWorkspace([
      {
        name: 'msdebug-python',
        target: '/usr/local/bin/python',
      },
    ]);

    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBeUndefined();
  });

  it('returns undefined when the config has no target field (do not block)', () => {
    mkWorkspace([{ name: 'msdebug' }]);

    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBeUndefined();
  });

  it('returns undefined when launch.json is absent (do not block)', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-exists-'));

    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBeUndefined();
  });

  it('returns undefined when launch.json is unparseable (do not block)', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-exists-'));
    const vscodeDir = path.join(root, '.vscode');

    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, 'launch.json'), '{ not json', 'utf-8');

    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBeUndefined();
  });

  it('returns undefined when launch.json declares no configurations array (do not block)', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-exists-'));
    const vscodeDir = path.join(root, '.vscode');

    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'launch.json'),
      JSON.stringify({ version: '0.2.0' }, null, 2),
      'utf-8',
    );

    expect(msdebugConfiguredTargetExists(root, 'msdebug'))
      .toBeUndefined();
  });

  it('returns false for a remote-debug config without a remote workspace folder', () => {
    mkWorkspace([
      {
        name: 'remote-debug',
        target: DEFAULT_REMOTE_MSDEBUG_TARGET,
      },
    ]);

    expect(msdebugConfiguredTargetExists(root, 'remote-debug'))
      .toBe(false);
  });

  it('returns false for a remote-debug config with a non-string remote workspace folder', () => {
    mkWorkspace([
      {
        name: 'remote-debug',
        target: DEFAULT_REMOTE_MSDEBUG_TARGET,
        remoteConfig: { remoteWorkspaceFolder: 123 },
      },
    ]);

    expect(msdebugConfiguredTargetExists(root, 'remote-debug'))
      .toBe(false);
  });

  it('returns true when the remote-debug target exists on disk', () => {
    mkWorkspace([
      {
        name: 'remote-debug',
        target: '${remoteWorkspaceFolder}/math/add_custom/build/test_aclnn_add_custom',
        remoteConfig: { remoteWorkspaceFolder: '${remoteWorkspaceFolder}' },
      },
    ]);
    writeTargetBinary(path.join('math', 'add_custom', 'build', 'test_aclnn_add_custom'));

    expect(msdebugConfiguredTargetExists(root, 'remote-debug'))
      .toBe(true);
  });

  it('returns undefined for a remote-debug config with a non-string target (do not block)', () => {
    mkWorkspace([
      {
        name: 'remote-debug',
        target: 42,
        remoteConfig: { remoteWorkspaceFolder: '${remoteWorkspaceFolder}' },
      },
    ]);

    expect(msdebugConfiguredTargetExists(root, 'remote-debug'))
      .toBeUndefined();
  });
});

describe('registerMsdebugTargetAutoAdapt', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'msdebug-adapt-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  function buildBinary(relOpPath: string, binaryName: string): string {
    const buildDir = path.join(root, relOpPath, 'build');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, binaryName), '#!/bin/sh\n', 'utf-8');

    return path.join(root, relOpPath);
  }

  function folder(): { uri: { fsPath: string } } {
    return { uri: { fsPath: root } };
  }

  async function resolveFor(provider: vscode.DebugConfigurationProvider, config?: Record<string, unknown>): Promise<unknown> {
    return provider.resolveDebugConfigurationWithSubstitutedVariables(folder() as unknown as vscode.WorkspaceFolder, config as vscode.DebugConfiguration | undefined);
  }

  it('registers the auto-adapt provider for both msdebug debug types', () => {
    const context = { subscriptions: [] as unknown[] };
    const resolveOperator = jest.fn();

    registerMsdebugTargetAutoAdapt(context as unknown as vscode.ExtensionContext, resolveOperator);

    const mockRegister = vscode.debug.registerDebugConfigurationProvider as jest.Mock;

    expect(mockRegister)
      .toHaveBeenCalledTimes(2);
    expect(mockRegister.mock.calls[0][0])
      .toBe('msdebug-mi');
    expect(mockRegister.mock.calls[1][0])
      .toBe('msdebug-mi-remote');
    expect(mockRegister.mock.calls[0][1])
      .toBe(mockRegister.mock.calls[1][1]);
    expect(context.subscriptions)
      .toHaveLength(2);
  });

  it('leaves the config untouched when there is no workspace folder', async () => {
    const context = { subscriptions: [] as unknown[] };
    const resolveOperator = jest.fn();

    registerMsdebugTargetAutoAdapt(context as unknown as vscode.ExtensionContext, resolveOperator);
    const mockRegister = vscode.debug.registerDebugConfigurationProvider as jest.Mock;
    const registered = mockRegister.mock.calls[0][1] as vscode.DebugConfigurationProvider;
    const config = { name: 'msdebug' };

    await expect(registered.resolveDebugConfigurationWithSubstitutedVariables(undefined, config as vscode.DebugConfiguration))
      .resolves
      .toBe(config);
    expect(resolveOperator).not.toHaveBeenCalled();
  });

  it('leaves a non-msdebug config untouched', async () => {
    const context = { subscriptions: [] as unknown[] };
    const resolveOperator = jest.fn();

    registerMsdebugTargetAutoAdapt(context as unknown as vscode.ExtensionContext, resolveOperator);
    const mockRegister = vscode.debug.registerDebugConfigurationProvider as jest.Mock;
    const registered = mockRegister.mock.calls[0][1] as vscode.DebugConfigurationProvider;
    const config = {
      name: 'other',
      target: '/usr/local/bin/tool',
    };

    await expect(resolveFor(registered, config))
      .resolves
      .toBe(config);
    expect(resolveOperator).not.toHaveBeenCalled();
  });

  it('returns the config untouched when the operator cannot be resolved', async () => {
    const context = { subscriptions: [] as unknown[] };
    const resolveOperator = jest.fn()
      .mockResolvedValue(undefined);

    registerMsdebugTargetAutoAdapt(context as unknown as vscode.ExtensionContext, resolveOperator);
    const mockRegister = vscode.debug.registerDebugConfigurationProvider as jest.Mock;
    const registered = mockRegister.mock.calls[0][1] as vscode.DebugConfigurationProvider;
    const config = {
      name: 'msdebug',
      target: DEFAULT_TARGET,
    };

    await expect(resolveFor(registered, config))
      .resolves
      .toBe(config);
    expect(resolveOperator)
      .toHaveBeenCalledWith(root);
  });

  it('patches the target when the operator is resolved without a target file callback', async () => {
    const opPath = buildBinary(path.join('math', 'add_custom'), 'test_aclnn_add_custom');
    const context = { subscriptions: [] as unknown[] };
    const resolveOperator = jest.fn()
      .mockResolvedValue({
        name: 'add_custom',
        path: opPath,
      });

    registerMsdebugTargetAutoAdapt(context as unknown as vscode.ExtensionContext, resolveOperator);
    const mockRegister = vscode.debug.registerDebugConfigurationProvider as jest.Mock;
    const registered = mockRegister.mock.calls[0][1] as vscode.DebugConfigurationProvider;
    const config = {
      name: 'msdebug',
      type: 'msdebug-mi',
      request: 'launch',
      target: DEFAULT_TARGET,
    };
    const resolved = await registered.resolveDebugConfigurationWithSubstitutedVariables(folder() as unknown as vscode.WorkspaceFolder, config as vscode.DebugConfiguration);

    expect((resolved as { target: string }).target)
      .toBe('${workspaceFolder}/math/add_custom/build/test_aclnn_add_custom');
  });

  it('patches the target from the resolved target file when the callback is provided', async () => {
    const opPath = buildBinary(path.join('math', 'add_custom'), 'test_aclnn_add_custom');
    const targetFile = path.join(opPath, 'build', 'demo_add_custom');

    fs.writeFileSync(targetFile, '#!/bin/sh\n', 'utf-8');
    const context = { subscriptions: [] as unknown[] };
    const resolveOperator = jest.fn()
      .mockResolvedValue({
        name: 'add_custom',
        path: opPath,
      });
    const resolveTargetFile = jest.fn()
      .mockResolvedValue(targetFile);

    registerMsdebugTargetAutoAdapt(
      context as unknown as vscode.ExtensionContext,
      resolveOperator,
      resolveTargetFile,
    );
    const mockRegister = vscode.debug.registerDebugConfigurationProvider as jest.Mock;
    const registered = mockRegister.mock.calls[0][1] as vscode.DebugConfigurationProvider;
    const config = {
      name: 'msdebug',
      type: 'msdebug-mi',
      request: 'launch',
      target: DEFAULT_TARGET,
    };
    const resolved = await registered.resolveDebugConfigurationWithSubstitutedVariables(folder() as unknown as vscode.WorkspaceFolder, config as vscode.DebugConfiguration);

    expect(resolveTargetFile)
      .toHaveBeenCalledWith(root, {
        name: 'add_custom',
        path: opPath,
      });
    expect((resolved as { target: string }).target)
      .toBe('${workspaceFolder}/math/add_custom/build/demo_add_custom');
  });
});
