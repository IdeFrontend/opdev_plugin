import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';

import type { CommandExecutor } from '@plugin/class/command-options';
import { isStTestCancelledError } from '@plugin/domain/services/st-test-errors';
import {
  OPS_TEST_KIT_REPOSITORY,
  OPS_TEST_KIT_REVISION,
  TtkInstallerService,
} from '@plugin/service/ttk-installer.service';

type FakeCommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  output: string;
  interruptedByUserStop: boolean;
};

type InstallerTestOverrides = {
  createLockToken?: ()=> string;
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
  };
}

describe('TtkInstallerService', () => {
  let storageRoot: string;
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-ttk-installer-'));
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
    createId: ()=> string = () => 'stage',
    overrides: InstallerTestOverrides = {},
  ): TtkInstallerService {
    return new TtkInstallerService(context, {
      resolveInterpreter: () => '/usr/bin/python3',
      getExecutor: () => ({ execute } as unknown as CommandExecutor),
      createId,
      ...overrides,
    });
  }

  it('resolves a writable system TTK root with existing warmup artifacts', async () => {
    const systemTtkRoot = path.join(storageRoot, 'system ttk');
    const kernelMetaPath = path.join(systemTtkRoot, 'kernel_meta');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('Python 2.7.18 from sourced environment\nCANN ready\n__MSTT_PYTHON_VERSION__=3.11.8\nEnvironment activated\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult(`CANN banner\n__MSTT_TTK_ROOT__=${systemTtkRoot}\nEnvironment activated\n`);
      }

      return commandResult('TTK v1.2.3\n');
    });
    const service = createService(execute);
    const accessSpy = jest.spyOn(fs.promises, 'access');

    fs.mkdirSync(kernelMetaPath, { recursive: true });
    fs.writeFileSync(path.join(kernelMetaPath, 'warmup.o'), 'object');
    fs.writeFileSync(path.join(kernelMetaPath, 'warmup.json'), '{}');

    const runtime = await service.ensureAvailable({ environmentScriptPath: '/cann/set env.sh' });

    expect(runtime)
      .toEqual({
        source: 'system',
        interpreter: '/usr/bin/python3',
        versionOutput: 'TTK v1.2.3',
        pythonPathEntries: [],
        workingDirectory: systemTtkRoot,
      });
    expect(execute)
      .toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[0][0])
      .toContain(". '/cann/set env.sh'");
    expect(execute.mock.calls[2][0])
      .toContain(". '/cann/set env.sh'");
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes('git init')))
      .toBe(false);
    expect(accessSpy)
      .toHaveBeenCalledWith(systemTtkRoot, fs.constants.X_OK);
    expect(accessSpy)
      .toHaveBeenCalledWith(
        kernelMetaPath,
        fs.constants.W_OK | fs.constants.X_OK,
      );
    expect(accessSpy)
      .toHaveBeenCalledWith(path.join(kernelMetaPath, 'warmup.o'), fs.constants.W_OK);
    expect(accessSpy)
      .toHaveBeenCalledWith(path.join(kernelMetaPath, 'warmup.json'), fs.constants.W_OK);
  });

  it('falls through to a valid managed cache when the system root sentinel is malformed', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('__MSTT_TTK_ROOT__=')) {
        return commandResult('CANN banner\n__MSTT_TTK_ROOT__=relative/system-ttk\n');
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

    fs.mkdirSync(path.join(cache.source, '.git'), { recursive: true });
    fs.mkdirSync(cache.dependencies, { recursive: true });
    fs.writeFileSync(path.join(cache.source, 'requirements.txt'), 'pytest\n');
    fs.writeFileSync(cache.marker, `${JSON.stringify({
      schemaVersion: 1,
      revision: OPS_TEST_KIT_REVISION,
      pythonMajorMinor: '3.11',
    })}\n`);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(runtime.workingDirectory)
      .toBe(cache.source);
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes('git init')))
      .toBe(false);
  });

  it.each([
    'kernel_meta',
    'kernel_meta/warmup.json',
  ])('falls through to managed when system %s is not writable', async (blockedRelativePath) => {
    const systemTtkRoot = path.join(storageRoot, 'read-only-system-ttk');
    const kernelMetaPath = path.join(systemTtkRoot, 'kernel_meta');
    const blockedPath = path.join(systemTtkRoot, blockedRelativePath);
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
    const originalAccess = fs.promises.access;

    jest.spyOn(fs.promises, 'access')
      .mockImplementation(async (target, mode) => {
        if (String(target) === blockedPath) {
          throw Object.assign(new Error('read-only system TTK'), { code: 'EACCES' });
        }

        await originalAccess(target, mode);
      });

    fs.mkdirSync(kernelMetaPath, { recursive: true });
    fs.writeFileSync(path.join(kernelMetaPath, 'warmup.json'), '{}');
    fs.mkdirSync(path.join(cache.source, '.git'), { recursive: true });
    fs.mkdirSync(cache.dependencies, { recursive: true });
    fs.writeFileSync(path.join(cache.source, 'requirements.txt'), 'pytest\n');
    fs.writeFileSync(cache.marker, `${JSON.stringify({
      schemaVersion: 1,
      revision: OPS_TEST_KIT_REVISION,
      pythonMajorMinor: '3.11',
    })}\n`);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(runtime.workingDirectory)
      .toBe(cache.source);
  });

  it('falls through to managed when system kernel_meta is a dangling symlink', async () => {
    const systemTtkRoot = path.join(storageRoot, 'dangling-system-ttk');
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

    jest.spyOn(fs.promises, 'lstat')
      .mockImplementation(async (target, options) => {
        if (String(target) === kernelMetaPath) {
          return {
            isDirectory: () => false,
            isSymbolicLink: () => true,
          } as fs.Stats;
        }

        return originalLstat(target, options);
      });

    fs.mkdirSync(systemTtkRoot);
    fs.mkdirSync(path.join(cache.source, '.git'), { recursive: true });
    fs.mkdirSync(cache.dependencies, { recursive: true });
    fs.writeFileSync(path.join(cache.source, 'requirements.txt'), 'pytest\n');
    fs.writeFileSync(cache.marker, `${JSON.stringify({
      schemaVersion: 1,
      revision: OPS_TEST_KIT_REVISION,
      pythonMajorMinor: '3.11',
    })}\n`);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(runtime.workingDirectory)
      .toBe(cache.source);
  });

  it('reuses a valid pinned cache without network access', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.0.0\n');
      }

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');

    fs.mkdirSync(path.join(cache.source, '.git'), { recursive: true });
    fs.mkdirSync(cache.dependencies, { recursive: true });
    fs.writeFileSync(path.join(cache.source, 'requirements.txt'), 'pytest\n');
    fs.writeFileSync(cache.marker, `${JSON.stringify({
      schemaVersion: 1,
      revision: OPS_TEST_KIT_REVISION,
      pythonMajorMinor: '3.11',
    })}\n`);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(runtime.pythonPathEntries)
      .toEqual([
        cache.source,
        cache.dependencies,
      ]);
    expect(runtime.workingDirectory)
      .toBe(cache.source);
    expect(execute.mock.calls.some(([command]) => /\b(fetch|remote add)\b/.test(String(command))))
      .toBe(false);
    const managedProbeCommands = execute.mock.calls
      .map(([command]) => String(command))
      .filter((command) => command.includes('PYTHONPATH='));

    expect(managedProbeCommands.length)
      .toBeGreaterThan(0);
    expect(managedProbeCommands.every((command) => command
      .includes('export PYTHONDONTWRITEBYTECODE=1 && export PYTHONPATH=')))
      .toBe(true);
  });

  it('does not reuse a managed cache with an unusable working directory', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('git init')) {
        return commandResult('', 1, 'offline');
      }

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    const originalAccess = fs.promises.access;

    jest.spyOn(fs.promises, 'access')
      .mockImplementation(async (target, mode) => {
        if (String(target) === cache.source) {
          throw Object.assign(new Error('unusable managed TTK'), { code: 'EACCES' });
        }

        await originalAccess(target, mode);
      });

    fs.mkdirSync(path.join(cache.source, '.git'), { recursive: true });
    fs.mkdirSync(cache.dependencies, { recursive: true });
    fs.writeFileSync(path.join(cache.source, 'requirements.txt'), 'pytest\n');
    fs.writeFileSync(cache.marker, `${JSON.stringify({
      schemaVersion: 1,
      revision: OPS_TEST_KIT_REVISION,
      pythonMajorMinor: '3.11',
    })}\n`);

    await expect(service.ensureAvailable())
      .rejects
      .toThrow('Unable to provision pinned TTK');
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes('git init')))
      .toBe(true);
  });

  it('keeps a valid pinned cache when the checkout has an untracked runtime file', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(`${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.0.0\n');
      }

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute);
    const cache = service.getManagedCachePaths('3.11');
    const runtimeFile = path.join(
      cache.source,
      'ttk',
      '__pycache__',
      '__init__.cpython-311.pyc',
    );

    fs.mkdirSync(path.join(cache.source, '.git'), { recursive: true });
    fs.mkdirSync(cache.dependencies, { recursive: true });
    fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
    fs.writeFileSync(path.join(cache.source, 'requirements.txt'), 'pytest\n');
    fs.writeFileSync(runtimeFile, 'untracked runtime data');
    fs.writeFileSync(cache.marker, `${JSON.stringify({
      schemaVersion: 1,
      revision: OPS_TEST_KIT_REVISION,
      pythonMajorMinor: '3.11',
    })}\n`);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(fs.readFileSync(runtimeFile, 'utf8'))
      .toBe('untracked runtime data');
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes('git init -q')))
      .toBe(false);
  });

  it('replaces a pinned cache when tracked checkout content is dirty', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('git init -q')) {
        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        return commandResult();
      }

      if (command.includes('rev-parse HEAD')) {
        return command.includes(stagingSource)
          ? commandResult(`${OPS_TEST_KIT_REVISION}\n`)
          : commandResult(`${OPS_TEST_KIT_REVISION}\n`, 1, 'tracked content differs');
      }

      if (command.includes("'-m' 'pip'")) {
        return commandResult();
      }

      if (command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.0.0\n');
      }

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute, () => 'stage');
    const cache = service.getManagedCachePaths('3.11');
    const trackedFile = path.join(cache.source, 'tracked.py');

    fs.mkdirSync(path.join(cache.source, '.git'), { recursive: true });
    fs.mkdirSync(cache.dependencies, { recursive: true });
    fs.writeFileSync(path.join(cache.source, 'requirements.txt'), 'pytest\n');
    fs.writeFileSync(trackedFile, 'dirty tracked content');
    fs.writeFileSync(cache.marker, `${JSON.stringify({
      schemaVersion: 1,
      revision: OPS_TEST_KIT_REVISION,
      pythonMajorMinor: '3.11',
    })}\n`);

    const runtime = await service.ensureAvailable();

    expect(runtime.source)
      .toBe('managed');
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes('git init -q')))
      .toBe(true);
    expect(fs.existsSync(trackedFile))
      .toBe(false);
  });

  it('single-flights a bounded pinned install and re-probes the activated cache', async () => {
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
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

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute);

    const [
      first,
      second,
    ] = await Promise.all([
      service.ensureAvailable({ environmentScriptPath: '/cann/set_env.sh' }),
      service.ensureAvailable({ environmentScriptPath: '/cann/set_env.sh' }),
    ]);
    const cache = service.getManagedCachePaths('3.11');
    const cloneCalls = execute.mock.calls.filter(([command]) => String(command)
      .includes('git init -q'));
    const pipCalls = execute.mock.calls.filter(([command]) => String(command)
      .includes("'-m' 'pip'"));

    expect(first)
      .toEqual(second);
    expect(first.source)
      .toBe('managed');
    expect(first.workingDirectory)
      .toBe(cache.source);
    expect(first.workingDirectory)
      .not.toBe(stagingSource);
    expect(cloneCalls)
      .toHaveLength(1);
    expect(pipCalls)
      .toHaveLength(1);
    expect(cloneCalls[0][0])
      .toContain(`remote add origin '${OPS_TEST_KIT_REPOSITORY}'`);
    expect(cloneCalls[0][0])
      .toContain(`fetch --depth=1 origin '${OPS_TEST_KIT_REVISION}'`);
    expect(cloneCalls[0][0])
      .toContain('checkout --detach -q FETCH_HEAD');
    expect(cloneCalls[0][3])
      .toEqual({ timeout: 300_000 });
    expect(pipCalls[0][0])
      .toContain(`'--target' '${path.join(stagingRoot, 'dependencies')}'`);
    expect(pipCalls[0][3])
      .toEqual({ timeout: 600_000 });
    expect(fs.existsSync(cache.marker))
      .toBe(true);
    expect(JSON.parse(fs.readFileSync(cache.marker, 'utf8')))
      .toEqual({
        schemaVersion: 1,
        revision: OPS_TEST_KIT_REVISION,
        pythonMajorMinor: '3.11',
      });
  });

  it('isolates caller cancellation while one shared provisioning operation completes', async () => {
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

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute);
    const activeWaiter = service.ensureAvailable();

    await cloneStarted;

    let cancelled = false;
    const cancelledWaiter = service.ensureAvailable({ isCancellationRequested: () => cancelled });

    cancelled = true;

    const cancellationError = await cancelledWaiter.then(
      () => undefined,
      (error: unknown) => error,
    );

    releaseClone();

    const runtime = await activeWaiter;
    const cloneCalls = execute.mock.calls.filter(([command]) => String(command)
      .includes('git init -q'));
    const pipCalls = execute.mock.calls.filter(([command]) => String(command)
      .includes("'-m' 'pip'"));

    expect(isStTestCancelledError(cancellationError))
      .toBe(true);
    expect(runtime.source)
      .toBe('managed');
    expect(cloneCalls)
      .toHaveLength(1);
    expect(pipCalls)
      .toHaveLength(1);
  });

  it('coordinates separate service instances through the managed cache filesystem lock', async () => {
    const firstStagingRoot = path.join(storageRoot, 'ttk', '.staging-service-one');
    const secondStagingRoot = path.join(storageRoot, 'ttk', '.staging-service-two');
    const firstStagingSource = path.join(firstStagingRoot, 'ops-test-kit');
    const secondStagingSource = path.join(secondStagingRoot, 'ops-test-kit');
    let releaseFirstClone!: ()=> void;
    const firstCloneBarrier = new Promise<void>((resolve) => {
      releaseFirstClone = resolve;
    });
    let reportFirstCloneStarted!: ()=> void;
    const firstCloneStarted = new Promise<void>((resolve) => {
      reportFirstCloneStarted = resolve;
    });
    let reportSecondLockWait!: ()=> void;
    const secondLockWait = new Promise<void>((resolve) => {
      reportSecondLockWait = resolve;
    });
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('git init -q')) {
        const stagingSource = command.includes(firstStagingSource)
          ? firstStagingSource
          : secondStagingSource;

        fs.mkdirSync(path.join(stagingSource, '.git'), { recursive: true });
        fs.writeFileSync(path.join(stagingSource, 'requirements.txt'), 'pytest\n');

        if (stagingSource === firstStagingSource) {
          reportFirstCloneStarted();
          await firstCloneBarrier;
        }

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

      return commandResult('', 1, 'No module named ttk');
    });
    const firstService = createService(execute, () => 'service-one', { createLockToken: () => 'service-one-lock' });
    const secondService = createService(execute, () => 'service-two', {
      createLockToken: () => 'service-two-lock',
      sleep: async () => {
        reportSecondLockWait();
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      },
    });
    const cache = firstService.getManagedCachePaths('3.11');
    const first = firstService.ensureAvailable();

    await firstCloneStarted;
    expect(fs.statSync(cache.lock)
      .isDirectory())
      .toBe(true);
    expect(fs.statSync(path.join(cache.lock, 'owner.json'))
      .isFile())
      .toBe(true);

    const second = secondService.ensureAvailable();

    await secondLockWait;
    releaseFirstClone();

    const [
      firstRuntime,
      secondRuntime,
    ] = await Promise.all([
      first,
      second,
    ]);
    const cloneCalls = execute.mock.calls.filter(([command]) => String(command)
      .includes('git init -q'));
    const pipCalls = execute.mock.calls.filter(([command]) => String(command)
      .includes("'-m' 'pip'"));
    const finalCacheChecks = execute.mock.calls.filter(([command]) => {
      const value = String(command);

      return value.includes(cache.source) && value.includes('rev-parse HEAD');
    });

    expect(firstRuntime)
      .toEqual(secondRuntime);
    expect(firstRuntime.source)
      .toBe('managed');
    expect(cloneCalls)
      .toHaveLength(1);
    expect(pipCalls)
      .toHaveLength(1);
    expect(finalCacheChecks)
      .toHaveLength(1);
    expect(fs.existsSync(cache.lock))
      .toBe(false);
  });

  it('recovers an ownerless lock directory once it outlives the acquire grace window', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('git init -q')) {
        const stagingSource = /git init -q '([^']+)'/.exec(command)![1];

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

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute, () => 'stage', { createLockToken: () => 'ownerless-lock' });
    const cache = service.getManagedCachePaths('3.11');

    // A crashed release fallback leaves the lock directory without its owner
    // marker; the next waiter must recover it after the grace window.
    fs.mkdirSync(cache.lock, { recursive: true });
    const backdated = new Date(Date.now() - 10_000);

    fs.utimesSync(cache.lock, backdated, backdated);

    await expect(service.ensureAvailable())
      .resolves
      .toMatchObject({ source: 'managed' });
    expect(fs.existsSync(cache.lock))
      .toBe(false);
  });

  it('removes the lock in place when the rename is persistently refused (Windows EPERM)', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
      }

      if (command.includes('git init -q')) {
        const stagingSource = /git init -q '([^']+)'/.exec(command)![1];

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

      return commandResult('', 1, 'No module named ttk');
    });
    const service = createService(execute, () => 'stage', { createLockToken: () => 'fallback-lock' });
    const cache = service.getManagedCachePaths('3.11');
    const realRename = fs.promises.rename.bind(fs.promises);
    const renameSpy = jest.spyOn(fs.promises, 'rename')
      .mockImplementation(async (source, target) => {
        if (String(target)
          .includes('.released-')) {
          throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
        }

        return realRename(source, target);
      });

    try {
      await expect(service.ensureAvailable())
        .resolves
        .toMatchObject({ source: 'managed' });
      expect(renameSpy)
        .toHaveBeenCalled();
      expect(fs.existsSync(cache.lock))
        .toBe(false);
    }
    finally {
      renameSpy.mockRestore();
    }
  });

  it('reports restricted-network guidance and removes incomplete staging', async () => {
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.10.14\n');
      }

      if (command.includes('git init -q')) {
        return commandResult('', 128, 'network unavailable');
      }

      return commandResult('not a TTK signature\n');
    });
    const service = createService(execute, () => 'failed-stage');
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-failed-stage');

    let caught: unknown;

    try {
      await service.ensureAvailable();
    }
    catch (error) {
      caught = error;
    }

    expect(caught)
      .toBeInstanceOf(Error);
    expect((caught as Error).message)
      .toContain('restricted-network cache');
    expect((caught as Error).message)
      .toContain(OPS_TEST_KIT_REVISION);
    expect(execute.mock.calls.some(([command]) => String(command)
      .includes(OPS_TEST_KIT_REPOSITORY)))
      .toBe(true);
    expect(fs.existsSync(stagingRoot))
      .toBe(false);
  });

  it('restores the previous cache when the activated managed probe fails', async () => {
    const ids = [
      'stage',
      'backup',
    ];
    const serviceId = jest.fn(() => ids.shift() ?? 'extra');
    const finalRoot = path.join(storageRoot, 'ttk', OPS_TEST_KIT_REVISION, 'python-3.11');
    const sentinel = path.join(finalRoot, 'previous-cache.txt');
    const stagingRoot = path.join(storageRoot, 'ttk', '.staging-stage');
    const stagingSource = path.join(stagingRoot, 'ops-test-kit');
    const execute = jest.fn(async (command: string) => {
      if (command.includes('import sys')) {
        return commandResult('__MSTT_PYTHON_VERSION__=3.11.9\n');
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

      if (command.includes(stagingRoot) && command.includes('PYTHONPATH=')) {
        return commandResult('TTK v2.1.0\n');
      }

      return commandResult('invalid signature\n');
    });

    fs.mkdirSync(finalRoot, { recursive: true });
    fs.writeFileSync(sentinel, 'keep me');

    await expect(createService(execute, serviceId)
      .ensureAvailable())
      .rejects.toThrow(/cache activation/);
    expect(fs.readFileSync(sentinel, 'utf8'))
      .toBe('keep me');
  });

  it('honors cancellation before starting another provisioning stage', async () => {
    let cancelled = false;
    const execute = jest.fn(async () => {
      cancelled = true;

      return commandResult('__MSTT_PYTHON_VERSION__=3.11.8\n');
    });
    const service = createService(execute);

    try {
      await service.ensureAvailable({ isCancellationRequested: () => cancelled });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }

    expect(execute)
      .toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(storageRoot, 'ttk')))
      .toBe(false);
  });
});
