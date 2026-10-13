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
import { EventEmitter } from 'events';

const mockReaddirSync = jest.fn();
const mockReadFileSync = jest.fn();

jest.mock('fs', () => {
  const realFs = jest.requireActual('fs') as Record<string, unknown>;

  return {
    ...realFs,
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  };
});

const realFs = jest.requireActual('fs') as typeof import('fs');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

import {
  spawn,
  spawnSync,
} from 'child_process';
import {
  buildShHelpSupportsGenop,
  buildShHelpSupportsOption,
  buildShHelpSupportsOptionSync,
  findAncestorGenopCollectionRoot,
  hasAncestorBuildShWithGenop,
  hasAscFiles,
  hasAscFilesRecursive,
  hasPyFilesRecursive,
  hasTritonPythonIndicatorsInRoot,
  helpOutputSupportsGenop,
  helpOutputSupportsOption,
} from '@plugin/domain/plugins/detection-utils';

const BUILD_SH_HELP_TIMEOUT_MS = 5_000;

const tmpRoots: string[] = [];

function delegateFsMocks(): void {
  mockReaddirSync.mockImplementation(((...args: unknown[]) =>
    (realFs.readdirSync as (...a: unknown[])=> unknown)(...args)) as never);
  mockReadFileSync.mockImplementation(((...args: unknown[]) =>
    (realFs.readFileSync as (...a: unknown[])=> unknown)(...args)) as never);
}

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detutils-'));

  tmpRoots.push(dir);

  return dir;
}

beforeEach(() => {
  jest.clearAllMocks();
  delegateFsMocks();
});

afterEach(() => {
  while (tmpRoots.length > 0) {
    const dir = tmpRoots.pop();

    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  }
  jest.useRealTimers();
});

function spawnableChild(): EventEmitter & {
  kill: jest.Mock;
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const child = new EventEmitter() as EventEmitter & {
    kill: jest.Mock;
    stdout: EventEmitter;
    stderr: EventEmitter;
  };

  child.kill = jest.fn();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  return child;
}

describe('helpOutputSupportsOption escaping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats regex special characters in the option as literals', () => {
    expect(helpOutputSupportsOption('  --genop.path <x>', '--genop.path'))
      .toBe(true);
    expect(helpOutputSupportsOption('  --genopXpath <x>', '--genop.path'))
      .toBe(false);
  });

  it('delegates helpOutputSupportsGenop to the shared option check', () => {
    expect(helpOutputSupportsGenop('  --genop <dir>'))
      .toBe(true);
    expect(helpOutputSupportsGenop('  --genopX <dir>'))
      .toBe(false);
  });
});

describe('buildShHelpSupportsOption (async)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false without spawning when build.sh is missing', async () => {
    const root = mkTmp();

    await expect(buildShHelpSupportsOption(root, '--genop'))
      .resolves.toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('times out, kills the child and resolves with the output so far', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    const child = spawnableChild();

    (spawn as jest.Mock).mockReturnValue(child);
    jest.useFakeTimers();
    const promise = buildShHelpSupportsOption(root, '--genop');

    child.stdout.emit('data', Buffer.from('Usage: build.sh --genop'));

    jest.advanceTimersByTime(BUILD_SH_HELP_TIMEOUT_MS + 1);

    await expect(promise).resolves.toBe(true);
    expect(child.kill)
      .toHaveBeenCalled();
  });

  it('resolves through the error event and ignores a later close', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    const child = spawnableChild();

    (spawn as jest.Mock).mockReturnValue(child);
    const promise = buildShHelpSupportsOption(root, '--genop');

    child.stderr.emit('data', Buffer.from('Usage: --genop'));
    child.emit('error', new Error('spawn ENOENT'));
    child.emit('close', 1);

    await expect(promise).resolves.toBe(true);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('caps the accumulated help output at the maximum length', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    const child = spawnableChild();

    (spawn as jest.Mock).mockReturnValue(child);
    const promise = buildShHelpSupportsOption(root, '--genop');

    child.stdout.emit('data', Buffer.alloc(70 * 1024, 'a'));
    // The option arrives after the cap: it must be dropped.
    child.stdout.emit('data', Buffer.from('--genop'));
    child.emit('close', 0);

    await expect(promise).resolves.toBe(false);
  });

  it('resolves false when the help output lacks the option', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    const child = spawnableChild();

    (spawn as jest.Mock).mockReturnValue(child);
    const promise = buildShHelpSupportsOption(root, '--bisheng_flags');

    child.stdout.emit('data', Buffer.from('Usage: build.sh --help'));
    child.emit('close', 1);

    await expect(promise).resolves.toBe(false);
    expect(child.kill).not.toHaveBeenCalled();
  });
});

describe('buildShHelpSupportsGenop wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to the shared async option check for --genop', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    const child = spawnableChild();

    (spawn as jest.Mock).mockReturnValue(child);
    const promise = buildShHelpSupportsGenop(root);

    child.stdout.emit('data', Buffer.from('Usage: build.sh --genop'));
    child.emit('close', 0);

    await expect(promise).resolves.toBe(true);
  });

  it('resolves false when the help output lacks --genop', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    const child = spawnableChild();

    (spawn as jest.Mock).mockReturnValue(child);
    const promise = buildShHelpSupportsGenop(root);

    child.stdout.emit('data', Buffer.from('Usage: build.sh --help'));
    child.emit('close', 0);

    await expect(promise).resolves.toBe(false);
  });
});

describe('buildShHelpSupportsOptionSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false without spawning when build.sh is missing', () => {
    const root = mkTmp();

    expect(buildShHelpSupportsOptionSync(root, '--genop'))
      .toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns false when spawnSync throws', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    (spawnSync as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });

    expect(buildShHelpSupportsOptionSync(root, '--genop'))
      .toBe(false);
  });

  it('concatenates stdout and stderr for the check', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    (spawnSync as jest.Mock).mockReturnValue({
      stdout: 'prefix ',
      stderr: '--genop',
    });

    expect(buildShHelpSupportsOptionSync(root, '--genop'))
      .toBe(true);
  });
});

describe('hasPyFilesRecursive', () => {
  it('returns false for a negative maxDepth', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'main.py'), '');

    expect(hasPyFilesRecursive(root, -1))
      .toBe(false);
  });

  it('finds a python file at the root level', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'main.py'), '');

    expect(hasPyFilesRecursive(root, 1))
      .toBe(true);
  });

  it('finds a python file up to the configured depth', () => {
    const root = mkTmp();

    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'b', 'deep.py'), '');

    expect(hasPyFilesRecursive(root, 2))
      .toBe(true);
    expect(hasPyFilesRecursive(root, 1))
      .toBe(false);
  });

  it('returns false when the directory cannot be read', () => {
    const root = mkTmp();

    mockReaddirSync.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(hasPyFilesRecursive(root, 2))
      .toBe(false);
  });

  it('returns false when only non-python files exist', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'readme.md'), '');

    expect(hasPyFilesRecursive(root, 2))
      .toBe(false);
  });
});

describe('hasTritonPythonIndicatorsInRoot', () => {
  it('detects triton import and usage markers', () => {
    const indicators = [
      'import triton',
      'from triton import language',
      'triton.jit',
      'triton.language',
      'triton.cdiv',
    ];

    for (const indicator of indicators) {
      const root = mkTmp();

      fs.writeFileSync(path.join(root, 'kernel.py'), `import os\n${indicator}\n`);
      expect(hasTritonPythonIndicatorsInRoot(root))
        .toBe(true);
    }
  });

  it('returns false for a triton-free tree', () => {
    const root = mkTmp();

    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'kernel.py'), 'import numpy\n');

    expect(hasTritonPythonIndicatorsInRoot(root))
      .toBe(false);
  });

  it('finds indicators in nested directories up to depth 2', () => {
    const root = mkTmp();

    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'b', 'kernel.py'), 'import triton');

    expect(hasTritonPythonIndicatorsInRoot(root))
      .toBe(true);
  });

  it('does not descend past depth 2', () => {
    const root = mkTmp();

    fs.mkdirSync(path.join(root, 'a', 'b', 'c'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'b', 'c', 'kernel.py'), 'import triton');

    expect(hasTritonPythonIndicatorsInRoot(root))
      .toBe(false);
  });

  it('ignores a directory that cannot be read', () => {
    const root = mkTmp();

    fs.mkdirSync(path.join(root, 'baddir'));
    fs.writeFileSync(path.join(root, 'ok.py'), 'print(1)');
    mockReaddirSync.mockImplementation(((dirPath: unknown, options?: unknown) => {
      if (path.basename(String(dirPath)) === 'baddir') {
        throw new Error('EACCES');
      }

      return (realFs.readdirSync as (...args: unknown[])=> unknown)(dirPath, options);
    }) as never);

    expect(hasTritonPythonIndicatorsInRoot(root))
      .toBe(false);
  });

  it('ignores a python file that cannot be read', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'locked.py'), 'import triton');
    mockReadFileSync.mockImplementation(((filePath: unknown, options?: unknown) => {
      if (path.basename(String(filePath)) === 'locked.py') {
        throw new Error('EACCES');
      }

      return (realFs.readFileSync as (...args: unknown[])=> unknown)(filePath, options);
    }) as never);

    expect(hasTritonPythonIndicatorsInRoot(root))
      .toBe(false);
  });
});

describe('hasAscFiles / hasAscFilesRecursive', () => {
  it('finds an .asc file at the root', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'kernel.asc'), '');

    expect(hasAscFiles(root))
      .toBe(true);
  });

  it('finds an .asc file nested up to depth 2', () => {
    const root = mkTmp();

    fs.mkdirSync(path.join(root, 'src', 'inner'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'inner', 'kernel.asc'), '');

    expect(hasAscFiles(root))
      .toBe(true);
  });

  it('returns false when no .asc files exist', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'kernel.py'), '');

    expect(hasAscFiles(root))
      .toBe(false);
  });

  it('returns false when the directory cannot be read', () => {
    const root = mkTmp();

    mockReaddirSync.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(hasAscFiles(root))
      .toBe(false);
  });

  it('returns false immediately for a non-positive maxDepth', () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'kernel.asc'), '');

    expect(hasAscFilesRecursive(root, 0))
      .toBe(false);
  });

  it('stops recursion at the maxDepth limit', () => {
    const root = mkTmp();

    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'b', 'kernel.asc'), '');

    expect(hasAscFilesRecursive(root, 1))
      .toBe(false);
    expect(hasAscFilesRecursive(root, 3))
      .toBe(true);
  });
});

describe('findAncestorGenopCollectionRoot edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stops walking when the drive root is reached', async () => {
    const driveRoot = path.parse(process.cwd()).root;
    const deep = path.join(driveRoot, 'opd-nonexistent-scan', 'sub');

    await expect(findAncestorGenopCollectionRoot(deep, async () => false))
      .resolves.toBeUndefined();
  });

  it('swallows a failure of the support check', async () => {
    const root = mkTmp();

    fs.writeFileSync(path.join(root, 'build.sh'), 'x');
    fs.mkdirSync(path.join(root, 'add'));
    const sub = path.join(root, 'add');

    await expect(findAncestorGenopCollectionRoot(sub, async () => {
      throw new Error('boom');
    })).resolves.toBeUndefined();
  });

  it('checks at most three ancestors', async () => {
    const root = mkTmp();
    const sub = path.join(root, 'a', 'b', 'c');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(root, 'build.sh'), 'x');
    fs.writeFileSync(path.join(root, 'a', 'build.sh'), 'x');
    fs.writeFileSync(path.join(root, 'a', 'b', 'build.sh'), 'x');
    const visits: string[] = [];

    await expect(findAncestorGenopCollectionRoot(sub, async (dirPath: string) => {
      visits.push(dirPath);

      return false;
    })).resolves.toBeUndefined();
    expect(visits)
      .toEqual([
        path.join(root, 'a', 'b'),
        path.join(root, 'a'),
        root,
      ]);
  });

  it('returns the nearest ancestor whose build.sh supports genop', async () => {
    const root = mkTmp();
    const sub = path.join(root, 'a', 'b');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(root, 'build.sh'), 'x');
    fs.writeFileSync(path.join(root, 'a', 'build.sh'), 'x');
    const checkCalls: string[] = [];

    await expect(findAncestorGenopCollectionRoot(sub, async (dirPath: string) => {
      checkCalls.push(dirPath);

      return dirPath === root;
    })).resolves.toBe(root);
    expect(checkCalls)
      .toEqual([
        path.join(root, 'a'),
        root,
      ]);
  });
});

describe('hasAncestorBuildShWithGenop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is true when an ancestor build.sh advertises --genop', async () => {
    const root = mkTmp();
    const sub = path.join(root, 'a', 'b');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n');
    const child = spawnableChild();

    (spawn as jest.Mock).mockReturnValue(child);
    const promise = hasAncestorBuildShWithGenop(sub);

    child.stdout.emit('data', Buffer.from('Usage: build.sh --genop'));
    child.emit('close', 0);

    await expect(promise).resolves.toBe(true);
  });

  it('is false when the checker rejects every ancestor', async () => {
    const root = mkTmp();
    const sub = path.join(root, 'a', 'b');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(root, 'build.sh'), 'x');

    await expect(hasAncestorBuildShWithGenop(sub, async () => false))
      .resolves.toBe(false);
  });
});
