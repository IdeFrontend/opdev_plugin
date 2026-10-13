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
import type * as vscode from 'vscode';

import type { CommandExecutor } from '@plugin/class/command-options';
import { isStTestCancelledError } from '@plugin/domain/services/st-test-errors';
import {
  getTtkInstallerService,
  OPS_TEST_KIT_REVISION,
  TtkInstallerService,
} from '@plugin/service/ttk-installer.service';
import { appendLog } from '@plugin/helpers/output-channel';

type FakeCommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  output: string;
  interruptedByUserStop: boolean;
  timedOut: boolean;
};

type InstallerTestOverrides = {
  createLockToken?: ()=> string;
  createId?: ()=> string;
  now?: ()=> number;
  sleep?: (milliseconds: number)=> Promise<void>;
};

function commandResult(
  stdout: string = '',
  code: number | null = 0,
  stderr: string = '',
): FakeCommandResult {
  return {
    code,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
    interruptedByUserStop: false,
    timedOut: false,
  };
}

function writeValidCacheMarker(cache: {
  marker: string;
}): void {
  fs.writeFileSync(cache.marker, `${JSON.stringify({
    schemaVersion: 1,
    revision: OPS_TEST_KIT_REVISION,
    pythonMajorMinor: '3.11',
  })}\n`);
}

function seedValidCache(cache: {
  root: string;
  source: string;
  dependencies: string;
  marker: string;
}): void {
  fs.mkdirSync(path.join(cache.source, '.git'), { recursive: true });
  fs.mkdirSync(cache.dependencies, { recursive: true });
  fs.writeFileSync(path.join(cache.source, 'requirements.txt'), 'pytest\n');
  writeValidCacheMarker(cache);
}

describe('TtkInstallerService python resolution and probes (extra)', () => {
  let storageRoot: string;
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-ttk-extra-'));
    context = { globalStorageUri: { fsPath: storageRoot } } as vscode.ExtensionContext;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(storageRoot, {
      recursive: true,
      force: true,
    });
  });

  function createService(
    execute: jest.Mock,
    overrides: InstallerTestOverrides = {},
  ): TtkInstallerService {
    return new TtkInstallerService(context, {
      resolveInterpreter: () => '/usr/bin/python3',
      getExecutor: () => ({ execute } as unknown as CommandExecutor),
      createId: () => 'stage',
      ...overrides,
    });
  }

  it('rejects an unavailable Python interpreter', async () => {
    const execute = jest.fn(async () => commandResult('', 7, 'python3: not found'));

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('Python interpreter is unavailable: /usr/bin/python3');
  });

  it('rejects a Python version probe without the version sentinel', async () => {
    const execute = jest.fn(async () => commandResult('CANN banner\nEnvironment activated\n'));

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('Cannot determine Python version: /usr/bin/python3');
  });

  it('rejects a Python older than 3.8', async () => {
    const execute = jest.fn(async () => commandResult('__MSTT_PYTHON_VERSION__=3.7.2\n'));

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('TTK requires Python 3.8 or newer; found 3.7.2');
  });

  it('propagates cancellation raised during the TTK probe', async () => {
    let cancelled = false;
    let calls = 0;
    const execute = jest.fn(async (command: string) => {
      calls += 1;

      if (calls >= 2) {
        cancelled = true;
      }

      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      return commandResult('TTK v1.2.3\n');
    });

    try {
      await createService(execute)
        .ensureAvailable({ isCancellationRequested: () => cancelled });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }
  });

  it('propagates cancellation raised during the system root probe', async () => {
    let cancelled = false;
    let calls = 0;
    const execute = jest.fn(async (command: string) => {
      calls += 1;

      if (calls >= 3) {
        cancelled = true;
      }

      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });

    try {
      await createService(execute)
        .ensureAvailable({ isCancellationRequested: () => cancelled });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }
  });

  it('falls back to the managed cache when the TTK probe crashes', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes("'-m' 'ttk' '-v'") && !command.includes('PYTHONPATH=')) {
        throw new Error('probe process crashed');
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v3.0.0\n');
      }

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    seedValidCache(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(appendLog)
      .toHaveBeenCalledWith('op-devtools/st-test/ttk', 'TTK probe failed', expect.objectContaining({ error: 'probe process crashed' }));
  });

  it('falls back to the managed cache when the system root probe fails', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('', 7, 'import error');
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v3.0.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    seedValidCache(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
  });

  it('falls back to the managed cache when the system root sentinel is ambiguous', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=/opt/a\n__MSTT_TTK_ROOT__=/opt/b\n');
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v3.0.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    seedValidCache(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
  });

  it('falls back to the managed cache when the system root probe crashes', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        throw new Error('root probe crashed');
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v3.0.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    seedValidCache(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(appendLog)
      .toHaveBeenCalledWith('op-devtools/st-test/ttk', 'Could not resolve a writable system TTK root', expect.objectContaining({ error: 'root probe crashed' }));
  });

  it('falls back to the managed cache when the system TTK root is a regular file', async () => {
    const filePath = path.join(storageRoot, 'not-a-directory');

    fs.writeFileSync(filePath, 'oops');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult(`__MSTT_TTK_ROOT__=${filePath}\n`);
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v3.0.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    seedValidCache(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
  });

  it('falls back to the managed cache when kernel_meta cannot be inspected', async () => {
    const systemTtkRoot = path.join(storageRoot, 'system-ttk');
    const kernelMetaPath = path.join(systemTtkRoot, 'kernel_meta');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult(`__MSTT_TTK_ROOT__=${systemTtkRoot}\n`);
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v3.0.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    const originalLstat = fs.promises.lstat;

    fs.mkdirSync(systemTtkRoot);
    seedValidCache(cache);
    jest.spyOn(fs.promises, 'lstat')
      .mockImplementation(async (target, options) => {
        if (String(target) === kernelMetaPath) {
          throw Object.assign(new Error('cannot inspect kernel_meta'), { code: 'EACCES' });
        }

        return originalLstat(target, options);
      });

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
  });

  it('falls back to the managed cache when a warmup artifact is not a regular file', async () => {
    const systemTtkRoot = path.join(storageRoot, 'system-ttk');
    const kernelMetaPath = path.join(systemTtkRoot, 'kernel_meta');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult(`__MSTT_TTK_ROOT__=${systemTtkRoot}\n`);
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v3.0.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    fs.mkdirSync(kernelMetaPath, { recursive: true });
    fs.mkdirSync(path.join(kernelMetaPath, 'warmup.o'));
    seedValidCache(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
  });
});

describe('TtkInstallerService managed cache provisioning (extra)', () => {
  let storageRoot: string;
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-ttk-provision-'));
    context = { globalStorageUri: { fsPath: storageRoot } } as vscode.ExtensionContext;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(storageRoot, {
      recursive: true,
      force: true,
    });
  });

  function createService(
    execute: jest.Mock,
    overrides: InstallerTestOverrides = {},
  ): TtkInstallerService {
    return new TtkInstallerService(context, {
      resolveInterpreter: () => '/usr/bin/python3',
      getExecutor: () => ({ execute } as unknown as CommandExecutor),
      createId: () => 'stage',
      ...overrides,
    });
  }

  it('propagates cancellation raised while verifying the cached checkout', async () => {
    let cancelled = false;
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('rev-parse HEAD')) {
        cancelled = true;

        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    seedValidCache(cache);

    try {
      await service.ensureAvailable({ isCancellationRequested: () => cancelled });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }
  });

  it('provisions when a cached TTK fails its managed probe', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    let pythonPathProbes = 0;
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        // The cached copy is probed twice (before and after acquiring the
        // lock); both probes fail so the provisioning runs. The staging and
        // activated probes must then succeed.
        pythonPathProbes += 1;

        return pythonPathProbes <= 2
          ? commandResult('', 1, 'cached ttk import failed')
          : commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    seedValidCache(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes('git init -q')))
      .toBe(true);
  });

  it('provisions when the cache checkout has no .git directory', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    // The marker looks valid but the checkout has no .git directory.
    fs.mkdirSync(path.join(cache.root, 'ops-test-kit'), { recursive: true });
    fs.writeFileSync(path.join(cache.root, 'ops-test-kit', 'requirements.txt'), 'pytest\n');
    fs.mkdirSync(cache.dependencies, { recursive: true });
    writeValidCacheMarker(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes('git init -q')))
      .toBe(true);
  });

  it('falls back to provisioning when the cache checkout probe crashes', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('rev-parse HEAD') && !command.includes('.staging-')) {
        throw new Error('git crashed');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    seedValidCache(cache);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes('git init -q')))
      .toBe(true);
  });

  it('rejects a downloaded checkout that does not match the pinned revision', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow(`Downloaded ops-test-kit did not match pinned revision ${OPS_TEST_KIT_REVISION}`);
  });

  it('rejects a downloaded checkout without requirements.txt', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      return commandResult('TTK v1.2.3\n');
    });

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('Pinned ops-test-kit has no requirements.txt');
  });

  it('rejects a staged TTK whose isolated probe fails', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('', 1, 'isolated ttk import failed');
      }

      return commandResult('TTK v1.2.3\n');
    });

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('Managed TTK probe failed after isolated installation');
  });

  it('rejects a timed-out provisioning stage', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        return {
          ...commandResult('', null, ''),
          timedOut: true,
        };
      }

      return commandResult('TTK v1.2.3\n');
    });

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('download pinned ops-test-kit timed out after 300000ms and was terminated');
  });

  it('restores the previous cache when the activated working directory is unusable', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const finalRoot = path.join(storageRoot, 'ttk', OPS_TEST_KIT_REVISION, 'python-3.11');
    const sentinel = path.join(finalRoot, 'previous-cache.txt');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const originalAccess = fs.promises.access;

    fs.mkdirSync(finalRoot, { recursive: true });
    fs.writeFileSync(sentinel, 'keep me');

    jest.spyOn(fs.promises, 'access')
      .mockImplementation(async (target, mode) => {
        if (String(target) === path.join(finalRoot, 'ops-test-kit')) {
          throw Object.assign(new Error('activated checkout is not usable'), { code: 'EACCES' });
        }

        await originalAccess(target, mode);
      });

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('Managed TTK working directory is unusable after cache activation');
    // The previous cache was put back in place by the restore.
    expect(fs.readFileSync(sentinel, 'utf8'))
      .toBe('keep me');
  });

  it('swallows secondary restore failures while unwinding a failed activation', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const finalRoot = path.join(storageRoot, 'ttk', OPS_TEST_KIT_REVISION, 'python-3.11');
    const backupRoot = `${finalRoot}.previous-stage`;
    let pythonPathProbes = 0;
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        // The staging probe succeeds; the activated probe after the promotion
        // fails, which triggers the restore.
        pythonPathProbes += 1;

        return pythonPathProbes === 1
          ? commandResult('TTK v2.1.0\n')
          : commandResult('', 1, 'activated ttk import failed');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const originalRename = fs.promises.rename;

    fs.mkdirSync(finalRoot, { recursive: true });
    fs.writeFileSync(path.join(finalRoot, 'previous-cache.txt'), 'keep me');

    jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(source)
          .includes('.previous-')) {
          throw Object.assign(new Error('cannot restore previous cache'), { code: 'EACCES' });
        }

        return originalRename(source, target);
      });

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('Stage: cannot restore previous cache');
    expect(fs.existsSync(backupRoot))
      .toBe(true);
  });

  it('restores the previous cache when promoting the staging root fails', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const finalRoot = path.join(storageRoot, 'ttk', OPS_TEST_KIT_REVISION, 'python-3.11');
    const sentinel = path.join(finalRoot, 'previous-cache.txt');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const originalRename = fs.promises.rename;

    fs.mkdirSync(finalRoot, { recursive: true });
    fs.writeFileSync(sentinel, 'keep me');

    jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(source)
          .includes('.staging-')
          && String(target) === finalRoot) {
          throw Object.assign(new Error('promote refused'), { code: 'EACCES' });
        }

        if (String(source)
          .includes('.previous-')
          && String(target) === finalRoot) {
          throw Object.assign(new Error('restore refused'), { code: 'EACCES' });
        }

        return originalRename(source, target);
      });

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('Unable to provision pinned TTK');
    // The previous cache survives only in the backup location because the
    // in-place restore attempt failed as well.
    expect(fs.readFileSync(path.join(`${finalRoot}.previous-stage`, 'previous-cache.txt'), 'utf8'))
      .toBe('keep me');
    expect(fs.existsSync(finalRoot))
      .toBe(false);
  });

  it('keeps the previous cache when removing it after a successful activation fails', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const finalRoot = path.join(storageRoot, 'ttk', OPS_TEST_KIT_REVISION, 'python-3.11');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const originalRm = fs.promises.rm;

    fs.mkdirSync(finalRoot, { recursive: true });

    jest.spyOn(fs.promises, 'rm')
      .mockImplementation(async (target, options) => {
        if (String(target)
          .includes('.previous-')) {
          throw Object.assign(new Error('backup removal refused'), { code: 'EACCES' });
        }

        return originalRm(target, options);
      });

    const runtime = await createService(execute)
      .ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(appendLog)
      .toHaveBeenCalledWith('op-devtools/st-test/ttk', 'Could not remove previous managed TTK cache', expect.objectContaining({ error: 'backup removal refused' }));
    expect(fs.existsSync(path.join(storageRoot, 'ttk', OPS_TEST_KIT_REVISION, 'python-3.11.previous-stage')))
      .toBe(true);
  });

  it('propagates cancellation from a mid-provision stage and swallows staging cleanup failures', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    let cancelled = false;
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        // Cancellation lands while the clone stage is executing, after the
        // managed cache lock has already been acquired.
        cancelled = true;
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      return commandResult('TTK v1.2.3\n');
    });
    const originalRm = fs.promises.rm;

    jest.spyOn(fs.promises, 'rm')
      .mockImplementation(async (target, options) => {
        if (String(target) === stagingRoot) {
          throw Object.assign(new Error('staging cleanup refused'), { code: 'EACCES' });
        }

        return originalRm(target, options);
      });

    try {
      await createService(execute)
        .ensureAvailable({ isCancellationRequested: () => cancelled });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }
  });
});

describe('TtkInstallerService managed cache lock (extra)', () => {
  let storageRoot: string;
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-ttk-lock-'));
    context = { globalStorageUri: { fsPath: storageRoot } } as vscode.ExtensionContext;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(storageRoot, {
      recursive: true,
      force: true,
    });
  });

  function createService(
    execute: jest.Mock,
    overrides: InstallerTestOverrides = {},
  ): TtkInstallerService {
    return new TtkInstallerService(context, {
      resolveInterpreter: () => '/usr/bin/python3',
      getExecutor: () => ({ execute } as unknown as CommandExecutor),
      createId: () => 'stage',
      ...overrides,
    });
  }

  function writeLockOwner(lockPath: string, owner: {
    token: string;
    host: string;
    pid: number;
    createdAt: number;
  }): void {
    fs.mkdirSync(lockPath, { recursive: true });
    fs.writeFileSync(path.join(lockPath, 'owner.json'), `${JSON.stringify(owner)}\n`, 'utf8');
  }

  it('honors cancellation while waiting for the managed cache lock', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    let cancelled = false;
    const originalMkdir = fs.promises.mkdir;

    writeLockOwner(cache.lock, {
      token: 'held-here',
      host: os.hostname(),
      pid: process.pid,
      createdAt: Date.now(),
    });
    // Cancellation lands while the acquire loop is polling: the failed lock
    // mkdir flips the flag, and the very next poll check throws.
    jest.spyOn(fs.promises, 'mkdir')
      .mockImplementation(async (target, options) => {
        if (String(target) === cache.lock) {
          cancelled = true;
          throw Object.assign(new Error('lock exists'), { code: 'EEXIST' });
        }

        return originalMkdir(target, options);
      });

    try {
      await service.ensureAvailable({ isCancellationRequested: () => cancelled });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }
  });

  it('cleans up the lock directory when writing its owner marker fails', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    const originalWriteFile = fs.promises.writeFile;
    const originalRm = fs.promises.rm;

    jest.spyOn(fs.promises, 'writeFile')
      .mockImplementation(async (target, data, options) => {
        if (String(target)
          .includes('owner.json')) {
          throw Object.assign(new Error('owner write refused'), { code: 'EACCES' });
        }

        return originalWriteFile(target, data, options);
      });
    jest.spyOn(fs.promises, 'rm')
      .mockImplementation(async (target, options) => {
        if (String(target) === cache.lock) {
          throw Object.assign(new Error('owner lock removal refused'), { code: 'EACCES' });
        }

        return originalRm(target, options);
      });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow('owner write refused');
    // The lock directory survives because the cleanup removal also failed.
    expect(fs.existsSync(cache.lock))
      .toBe(true);
  });

  it('times out while waiting for a lock held by a live process on this host', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute, {
      now: jest.fn()
        .mockReturnValueOnce(0)
        .mockReturnValue(40 * 60_000),
    });
    const cache = service.getManagedCachePaths('3.11');

    writeLockOwner(cache.lock, {
      token: 'held-here',
      host: os.hostname(),
      pid: process.pid,
      createdAt: Date.now(),
    });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow(`Timed out waiting for managed TTK cache lock: ${cache.lock}`);
  });

  it('waits when the lock owner cannot be proved dead (EPERM liveness probe)', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute, {
      now: jest.fn()
        .mockReturnValueOnce(0)
        .mockReturnValue(40 * 60_000),
    });
    const cache = service.getManagedCachePaths('3.11');

    writeLockOwner(cache.lock, {
      token: 'held-here',
      host: os.hostname(),
      pid: process.pid,
      createdAt: Date.now(),
    });
    jest.spyOn(process, 'kill')
      .mockImplementation(() => {
        throw Object.assign(new Error('cannot inspect pid'), { code: 'EPERM' });
      });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow(`Timed out waiting for managed TTK cache lock: ${cache.lock}`);
  });

  it('recovers a lock whose owner died on this host and provisions', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute, { createLockToken: () => 'dead-owner-token' });
    const cache = service.getManagedCachePaths('3.11');

    writeLockOwner(cache.lock, {
      token: 'dead-owner',
      host: os.hostname(),
      pid: 9999999,
      createdAt: Date.now() - 100_000,
    });

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(appendLog)
      .toHaveBeenCalledWith('op-devtools/st-test/ttk', 'Recovered stale managed TTK cache lock', expect.objectContaining({ cacheLock: cache.lock }));
    expect(fs.existsSync(cache.lock))
      .toBe(false);
  });

  it('polls when the lock is held by a young foreign host', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute, {
      now: jest.fn()
        .mockReturnValueOnce(0)
        .mockReturnValue(25 * 60_000),
    });
    const cache = service.getManagedCachePaths('3.11');

    writeLockOwner(cache.lock, {
      token: 'foreign-owner',
      host: 'other-host',
      pid: 424242,
      createdAt: 0,
    });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow(`Timed out waiting for managed TTK cache lock: ${cache.lock}`);
  });

  it('recovers an ownerless lock whose owner marker is malformed', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    writeLockOwner(cache.lock, {
      token: 'invalid-token',
      host: os.hostname(),
      pid: 424242,
      createdAt: Date.now(),
    });
    fs.writeFileSync(path.join(cache.lock, 'owner.json'), '{"token": 42}\n', 'utf8');
    const backdated = new Date(Date.now() - 10_000);

    fs.utimesSync(cache.lock, backdated, backdated);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(appendLog)
      .toHaveBeenCalledWith('op-devtools/st-test/ttk', 'Recovered ownerless managed TTK cache lock', expect.objectContaining({ cacheLock: cache.lock }));
  });

  it('polls an ownerless lock directory within the acquire grace window', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute, {
      now: jest.fn()
        .mockReturnValueOnce(0)
        .mockReturnValue(40 * 60_000),
    });
    const cache = service.getManagedCachePaths('3.11');

    // An ownerless lock directory with a recent mtime is still inside the
    // mkdir -> owner.json write window, so it is left alone.
    fs.mkdirSync(cache.lock, { recursive: true });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow(`Timed out waiting for managed TTK cache lock: ${cache.lock}`);
  });

  it('recovers when the lock directory vanishes during inspection', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    const originalStat = fs.promises.stat;

    writeLockOwner(cache.lock, {
      token: 'vanished-owner',
      host: os.hostname(),
      pid: 9999999,
      createdAt: 0,
    });
    jest.spyOn(fs.promises, 'stat')
      .mockImplementationOnce(async (target) => {
        if (String(target) === cache.lock) {
          throw Object.assign(new Error('lock dir vanished'), { code: 'ENOENT' });
        }

        return originalStat(target);
      });

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
  });

  it('propagates inspection errors while recovering the managed cache lock', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    const originalStat = fs.promises.stat;

    writeLockOwner(cache.lock, {
      token: 'inspectable',
      host: os.hostname(),
      pid: 9999999,
      createdAt: 0,
    });
    jest.spyOn(fs.promises, 'stat')
      .mockImplementationOnce(async (target) => {
        if (String(target) === cache.lock) {
          throw Object.assign(new Error('stat refused'), { code: 'EACCES' });
        }

        return originalStat(target);
      });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow('stat refused');
  });

  it('recovers a lock whose stale rename hit a vanished directory', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    const originalRename = fs.promises.rename;

    writeLockOwner(cache.lock, {
      token: 'dead-again',
      host: os.hostname(),
      pid: 9999999,
      createdAt: 0,
    });
    jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(target)
          .includes('.stale-')) {
          // The other instance removed the lock directory right before the
          // stale rename landed.
          fs.rmSync(String(source), {
            recursive: true,
            force: true,
          });
          throw Object.assign(new Error('already gone'), { code: 'ENOENT' });
        }

        return originalRename(source, target);
      });

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
  });

  it('keeps polling when the stale rename is refused', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute, {
      now: jest.fn()
        .mockReturnValueOnce(0)
        .mockReturnValue(40 * 60_000),
    });
    const cache = service.getManagedCachePaths('3.11');
    const originalRename = fs.promises.rename;

    writeLockOwner(cache.lock, {
      token: 'refused-owner',
      host: os.hostname(),
      pid: 9999999,
      createdAt: 0,
    });
    jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(target)
          .includes('.stale-')) {
          throw Object.assign(new Error('rename refused'), { code: 'EACCES' });
        }

        return originalRename(source, target);
      });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow(`Timed out waiting for managed TTK cache lock: ${cache.lock}`);
  });

  it('releases the lock when the release rename reports a vanished directory', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    const originalRename = fs.promises.rename;

    jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(target)
          .includes('.released-')) {
          throw Object.assign(new Error('already released'), { code: 'ENOENT' });
        }

        return originalRename(source, target);
      });

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    // The release bailed out at the vanished rename target, leaving the lock
    // directory behind for the next waiter to recover.
    expect(fs.existsSync(cache.lock))
      .toBe(true);
  });

  it('removes the newly activated cache when restoring without a previous backup', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const finalRoot = path.join(storageRoot, 'ttk', OPS_TEST_KIT_REVISION, 'python-3.11');
    let pythonPathProbes = 0;
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        // The staging probe succeeds; the activated probe after the promotion
        // fails, which triggers the restore with no backup to fall back on.
        pythonPathProbes += 1;

        return pythonPathProbes === 1
          ? commandResult('TTK v2.1.0\n')
          : commandResult('', 1, 'activated ttk import failed');
      }

      return commandResult('TTK v1.2.3\n');
    });

    await expect(createService(execute)
      .ensureAvailable())
      .rejects
      .toThrow('Managed TTK probe failed after cache activation');
    expect(fs.existsSync(finalRoot))
      .toBe(false);
  });

  it('does not release a lock whose owner token differs', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    let releaseClone!: ()=> void;
    const cloneBarrier = new Promise<void>((resolve) => {
      releaseClone = resolve;
    });
    let reportCloneStarted!: ()=> void;
    const cloneStarted = new Promise<void>((resolve) => {
      reportCloneStarted = resolve;
    });
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');
        reportCloneStarted();
        await cloneBarrier;

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute, { createLockToken: () => 'intruder-victim' });
    const cache = service.getManagedCachePaths('3.11');
    const run = service.ensureAvailable();

    await cloneStarted;
    // Another instance replaces the owner marker while the run is in progress.
    writeLockOwner(cache.lock, {
      token: 'intruder',
      host: os.hostname(),
      pid: process.pid,
      createdAt: Date.now(),
    });
    releaseClone();

    await run;

    // The release refuses to remove a lock it does not own anymore.
    expect(fs.existsSync(cache.lock))
      .toBe(true);
  });

  it('rethrows unexpected release errors and keeps the lock directory', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const originalRename = fs.promises.rename;

    jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(target)
          .includes('.released-')) {
          throw Object.assign(new Error('rename race'), { code: 'EEXIST' });
        }

        return originalRename(source, target);
      });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow('rename race');
  });

  it('removes the lock in place when the removal retry budget is exhausted', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute, {
      createLockToken: () => 'exhausted-lock',
      sleep: async () => undefined,
    });
    const originalRename = fs.promises.rename;
    const originalRm = fs.promises.rm;

    jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(target)
          .includes('.released-')) {
          throw Object.assign(new Error('rename refused'), { code: 'EPERM' });
        }

        return originalRename(source, target);
      });
    jest.spyOn(fs.promises, 'rm')
      .mockImplementation(async (target, options) => {
        if (String(target)
          .includes('.lock')) {
          throw Object.assign(new Error('remove refused'), { code: 'EPERM' });
        }

        return originalRm(target, options);
      });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow('remove refused');
  });

  it('rethrows non-retryable removal errors during in-place lock release', async () => {
    const stagingSource = path.join(storageRoot, 'ttk', '.staging-stage', 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('__MSTT_TTK_ROOT__=relative/system-ttk\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const originalRename = fs.promises.rename;
    const originalRm = fs.promises.rm;

    jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(target)
          .includes('.released-')) {
          throw Object.assign(new Error('rename refused'), { code: 'EPERM' });
        }

        return originalRename(source, target);
      });
    jest.spyOn(fs.promises, 'rm')
      .mockImplementation(async (target, options) => {
        if (String(target)
          .includes('.lock')) {
          throw Object.assign(new Error('remove race'), { code: 'EEXIST' });
        }

        return originalRm(target, options);
      });

    await expect(service.ensureAvailable())
      .rejects
      .toThrow('remove race');
  });
});

describe('getTtkInstallerService factory', () => {
  let storageRoot: string;
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-ttk-factory-'));
    context = { globalStorageUri: { fsPath: storageRoot } } as vscode.ExtensionContext;
  });

  afterEach(() => {
    fs.rmSync(storageRoot, {
      recursive: true,
      force: true,
    });
  });

  it('caches one service instance per storage root', () => {
    const first = getTtkInstallerService(context);
    const again = getTtkInstallerService(context);
    const otherRoot = path.join(storageRoot, 'other');
    const other = getTtkInstallerService({ globalStorageUri: { fsPath: otherRoot } } as vscode.ExtensionContext);

    expect(again)
      .toBe(first);
    expect(other)
      .not
      .toBe(first);
  });
});
