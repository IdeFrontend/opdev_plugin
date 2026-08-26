jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({ get: () => undefined }),
  },
  env: { uriScheme: 'vscode' },
}), { virtual: true });

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({ getEnvironmentScriptPathFromWorkspace: jest.fn(() => '/etc/profile') }));

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

import {
  buildTritonProbeSpawnSpec,
  probeTritonPythonDependencies,
} from '@plugin/domain/services/command-strategy/triton-strategy';
import { getEnvironmentScriptPathFromWorkspace } from '@plugin/helpers/operator-project-workspace-config';

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
};

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();

  return child;
}

describe('buildTritonProbeSpawnSpec', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('sources the workspace env script before importing on Unix', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/etc/profile');

    const spec = buildTritonProbeSpawnSpec();

    expect(spec.file)
      .toBe('bash');
    expect(spec.args)
      .toEqual([
        '-lc',
        ". /etc/profile && python3 -c 'import torch; import triton'",
      ]);
    expect(spec.interpreter)
      .toBe('python3');
  });

  it('spawns the interpreter directly on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const spec = buildTritonProbeSpawnSpec();

    expect(spec.file)
      .toBe('python3');
    expect(spec.args)
      .toEqual([
        '-c',
        'import torch; import triton',
      ]);
  });

  it('omits env-script sourcing when the workspace has no env script', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('');

    const spec = buildTritonProbeSpawnSpec();

    expect(spec.file)
      .toBe('bash');
    expect(spec.args)
      .toEqual([
        '-lc',
        "python3 -c 'import torch; import triton'",
      ]);
  });
});

describe('probeTritonPythonDependencies', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'linux' });
    (getEnvironmentScriptPathFromWorkspace as jest.Mock).mockReturnValue('/etc/profile');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('runs the probe asynchronously via spawn (not spawnSync) so it does not block', () => {
    const child = makeFakeChild();

    (spawn as jest.Mock).mockReturnValue(child);

    const pending = probeTritonPythonDependencies();

    expect(typeof (pending as Promise<unknown>).then)
      .toBe('function');
    expect(spawn)
      .toHaveBeenCalledWith(
        'bash',
        [
          '-lc',
          ". /etc/profile && python3 -c 'import torch; import triton'",
        ],
        expect.any(Object),
      );

    child.emit('close', 0);

    return pending;
  });

  it('resolves ok when the import probe exits 0', async () => {
    const child = makeFakeChild();

    (spawn as jest.Mock).mockReturnValue(child);

    const pending = probeTritonPythonDependencies();

    child.emit('close', 0);
    const result = await pending;

    expect(result.ok)
      .toBe(true);
    expect(result.interpreter)
      .toBe('python3');
    expect(result.stderr)
      .toBe('');
  });

  it('resolves not-ok with captured stderr on non-zero exit', async () => {
    const child = makeFakeChild();

    (spawn as jest.Mock).mockReturnValue(child);

    const pending = probeTritonPythonDependencies();

    child.stderr.emit('data', "ModuleNotFoundError: No module named 'triton'");
    child.emit('close', 1);
    const result = await pending;

    expect(result.ok)
      .toBe(false);
    expect(result.stderr)
      .toContain('triton');
  });

  it('resolves not-ok when the interpreter cannot be spawned', async () => {
    const child = makeFakeChild();

    (spawn as jest.Mock).mockReturnValue(child);

    const pending = probeTritonPythonDependencies();

    child.emit('error', new Error('spawn bash ENOENT'));
    const result = await pending;

    expect(result.ok)
      .toBe(false);
    expect(result.stderr)
      .toContain('ENOENT');
  });

  it('kills the child and reports a timeout after 25s, ignoring later close events', async () => {
    jest.useFakeTimers();

    try {
      const child = makeFakeChild();

      (spawn as jest.Mock).mockReturnValue(child);

      const pending = probeTritonPythonDependencies();

      jest.advanceTimersByTime(25_000);

      expect(child.kill)
        .toHaveBeenCalled();

      const result = await pending;

      expect(result.ok)
        .toBe(false);
      expect(result.stderr)
        .toContain('Timed out after 25s');

      // A late close event after settle must not overwrite the timeout result.
      child.emit('close', 0);

      expect(result.ok)
        .toBe(false);
    }
    finally {
      jest.useRealTimers();
    }
  });
});
