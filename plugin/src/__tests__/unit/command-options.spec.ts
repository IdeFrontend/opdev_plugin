/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { EventEmitter } from 'events';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  // Both the plain `exec(cmd, cb)` kill and the bounded `exec(cmd, opts, cb)`
  // escalation go through this mock.
  exec: jest.fn((_command: string, optionsOrCallback?: unknown, maybeCallback?: unknown) => {
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
      ((error: Error | null)=> void) | undefined;

    callback?.(null);

    return {};
  }),
}));

import {
  exec,
  spawn,
} from 'child_process';

import { CommandExecutor } from '@plugin/class/command-options';

class FakeStream extends EventEmitter {
  destroy = jest.fn();
}

class FakeChildProcess extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  pid = 1234;
  kill = jest.fn();
  unref = jest.fn();
}

describe('CommandExecutor', () => {
  const spawnMock = spawn as unknown as jest.Mock;
  const execMock = exec as unknown as jest.Mock;
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  let processKillSpy: jest.SpyInstance;

  /** Windows behaviour has to be exercised from the Linux CI box too. */
  const pretendPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
      configurable: true,
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    processKillSpy = jest.spyOn(process, 'kill')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    if (realPlatform) {
      Object.defineProperty(process, 'platform', realPlatform);
    }

    processKillSpy.mockRestore();
    jest.useRealTimers();
  });

  it('spawns without a stdin pipe so a command reading stdin cannot block forever', () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    void new CommandExecutor()
      .execute('read-stdin');

    expect(spawnMock.mock.calls[0][2])
      .toEqual(expect.objectContaining({
        stdio: [
          'ignore',
          'pipe',
          'pipe',
        ],
      }));
  });

  it('resolves on close without waiting for the drain grace period', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('fast-command');

    child.emit('exit', 0, null);
    child.emit('close', 0);

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({
        code: 0,
        timedOut: false,
      }));
    expect(child.stdout.destroy).not.toHaveBeenCalled();
  });

  it('survives a stdout/stderr stream error instead of throwing it at the extension host', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('broken-pipe');

    // An EventEmitter with no 'error' listener rethrows, which would take the host down.
    expect(() => child.stdout.emit('error', new Error('EPIPE')))
      .not
      .toThrow();
    expect(() => child.stderr.emit('error', new Error('EPIPE')))
      .not
      .toThrow();

    child.emit('exit', 0, null);
    child.emit('close', 0);

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({ code: 0 }));
  });

  it('resolves after the drain grace period when a lingering grandchild holds the pipes open', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('spawns-a-daemon');

    // The command itself exits, but `close` never arrives because a descendant
    // still owns the inherited stdout/stderr write ends.
    child.emit('exit', 0, null);
    child.stdout.emit('data', Buffer.from('done\n'));

    jest.advanceTimersByTime(2000);

    const result = await resultPromise;

    expect(result.code)
      .toBe(0);
    expect(result.stdout)
      .toContain('done');
    expect(child.stdout.destroy)
      .toHaveBeenCalled();
    expect(child.stderr.destroy)
      .toHaveBeenCalled();
  });

  it('keeps the drained run and the next one apart when they overlap on the shared executor', async () => {
    // ProjectManager.getExecutor() hands out one instance, so a run started while an earlier
    // one is still waiting out its drain grace period shares stdout/stderr and this.process.
    const executor = new CommandExecutor();
    const first = new FakeChildProcess();
    const second = new FakeChildProcess();

    spawnMock.mockReturnValueOnce(first);

    const firstPromise = executor.execute('spawns-a-daemon');

    first.stdout.emit('data', Buffer.from('first-run\n'));
    first.emit('exit', 0, null);

    second.pid = 4321;
    spawnMock.mockReturnValueOnce(second);

    const secondPromise = executor.execute('next-run');

    second.stdout.emit('data', Buffer.from('second-run\n'));
    jest.advanceTimersByTime(2000);

    const firstResult = await firstPromise;

    expect(firstResult.stdout)
      .toContain('first-run');
    expect(firstResult.stdout)
      .not
      .toContain('second-run');

    // The drained run must not have taken the handle kill() needs for the live one.
    const killPromise = executor.kill();

    if (process.platform === 'win32') {
      expect(execMock)
        .toHaveBeenCalledWith(expect.stringContaining('taskkill /pid 4321'), expect.any(Function));
    }
    else {
      expect(processKillSpy)
        .toHaveBeenCalledWith(-4321, 'SIGTERM');
    }

    second.emit('close', 0);
    await killPromise;
    await secondPromise;
  });

  it('reports a non-zero exit code when only exit arrives', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('failing-command');

    child.emit('exit', null, 'SIGSEGV');
    jest.advanceTimersByTime(2000);

    const result = await resultPromise;

    expect(result.code)
      .toBe(-1);
    expect(result.stderr)
      .toContain('Command failed with code -1');
  });

  it('does not report a detached run as timed out because an earlier run on the same executor was', async () => {
    const executor = new CommandExecutor();
    const timedOutChild = new FakeChildProcess();

    spawnMock.mockReturnValue(timedOutChild);

    const timedOutRun = executor.execute(
      'slow-command',
      [],
      [],
      { timeout: 10 },
    );

    jest.advanceTimersByTime(10);
    timedOutChild.emit('close', 0);

    expect((await timedOutRun).timedOut)
      .toBe(true);

    const detachedChild = new FakeChildProcess();

    spawnMock.mockReturnValue(detachedChild);

    const detachedRun = executor.executeDetached('daemon', 'ready');

    detachedChild.stdout.emit('data', Buffer.from('ready\n'));

    expect((await detachedRun).timedOut)
      .toBe(false);
  });

  it('kills the process group and returns a timeout result instead of rejecting', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'slow-command',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);
    child.emit('close', 0);

    const result = await resultPromise;

    expect(result)
      .toEqual(expect.objectContaining({
        code: null,
        timedOut: true,
      }));
    expect(result.output)
      .toContain('Command timed out after 10ms');

    if (process.platform === 'win32') {
      expect(execMock)
        .toHaveBeenCalledWith(expect.stringContaining('taskkill /pid 1234'), expect.any(Function));
    }
    else {
      expect(processKillSpy)
        .toHaveBeenCalledWith(-1234, 'SIGTERM');
    }
  });

  it('escalates to SIGKILL when the process group ignores SIGTERM', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'unkillable-command',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);
    // Nothing exits: the cleanup watchdog has to escalate.
    jest.advanceTimersByTime(5000);

    const result = await resultPromise;

    expect(result.timedOut)
      .toBe(true);
    expect(processKillSpy)
      .toHaveBeenCalledWith(-1234, 'SIGKILL');
  });

  it('retries taskkill on Windows when the first one leaves the child running', async () => {
    pretendPlatform('win32');

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'unkillable-command',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);

    expect(execMock)
      .toHaveBeenCalledTimes(1);

    // Nothing exits: the cleanup watchdog has to escalate on Windows too.
    jest.advanceTimersByTime(5000);

    const result = await resultPromise;

    expect(result.timedOut)
      .toBe(true);
    expect(execMock)
      .toHaveBeenCalledTimes(2);
    expect(execMock.mock.calls[1][0])
      .toContain('taskkill /pid 1234 /T /F');
    // Bounded, so a taskkill that hangs cannot swallow the escalation.
    expect(execMock.mock.calls[1][1])
      .toEqual(expect.objectContaining({ timeout: expect.any(Number) }));
  });

  it('kills the child directly when the Windows escalation taskkill fails', async () => {
    pretendPlatform('win32');
    execMock
      .mockImplementationOnce((_command: string, callback?: (error: Error | null)=> void) => {
        callback?.(null);

        return {};
      })
      .mockImplementationOnce((
        _command: string,
        _options: unknown,
        callback?: (error: Error | null)=> void,
      ) => {
        callback?.(new Error('taskkill hung'));

        return {};
      });

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'unkillable-command',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);
    jest.advanceTimersByTime(5000);

    const result = await resultPromise;

    expect(result.timedOut)
      .toBe(true);
    expect(child.kill)
      .toHaveBeenCalledWith('SIGKILL');
  });

  it('does not time out a slow run that finishes before the deadline', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'slow-but-successful',
        [],
        [],
        { timeout: 1000 },
      );

    jest.advanceTimersByTime(900);
    child.emit('exit', 0, null);
    child.emit('close', 0);

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({
        code: 0,
        timedOut: false,
      }));

    jest.advanceTimersByTime(5000);
    expect(processKillSpy).not.toHaveBeenCalled();
  });

  // Callers share one executor (ProjectManager.getExecutor()), and cleanup takes up
  // to 5s. Anything that reads the instance fields after that await hands the caller
  // whatever the run started in the meantime wrote.
  describe('concurrent run started while the settling run is cleaning up', () => {
    it('still reports the timeout instead of the newer run result', async () => {
      const timedOutChild = new FakeChildProcess();
      const nextChild = new FakeChildProcess();
      const executor = new CommandExecutor();

      spawnMock.mockReturnValueOnce(timedOutChild)
        .mockReturnValueOnce(nextChild);

      const timedOutRun = executor.execute(
        'slow-command',
        [],
        [],
        { timeout: 10 },
      );

      // Deadline hits; the child never exits, so cleanup is still pending here.
      jest.advanceTimersByTime(10);

      const nextRun = executor.execute('fast-command');

      nextChild.stdout.emit('data', Buffer.from('next run output\n'));
      nextChild.emit('close', 0);

      await expect(nextRun)
        .resolves
        .toEqual(expect.objectContaining({ code: 0 }));

      // Only now does the timed-out run finish killing its process group.
      timedOutChild.emit('close', 0);

      const result = await timedOutRun;

      expect(result.timedOut)
        .toBe(true);
      expect(result.output)
        .toContain('Command timed out after 10ms');
      expect(result.output)
        .not
        .toContain('next run output');
    });

    it('still reports the stop-keyword run output instead of the newer run output', async () => {
      const watchedChild = new FakeChildProcess();
      const nextChild = new FakeChildProcess();
      const executor = new CommandExecutor();

      spawnMock.mockReturnValueOnce(watchedChild)
        .mockReturnValueOnce(nextChild);

      const watchedRun = executor.execute('watch-command', ['server ready']);

      // Stop keyword settles the run through the same cleanup-then-resolve path.
      watchedChild.stdout.emit('data', Buffer.from('server ready\n'));

      const nextRun = executor.execute('fast-command');

      nextChild.stdout.emit('data', Buffer.from('next run output\n'));
      nextChild.emit('close', 0);
      await nextRun;

      watchedChild.emit('close', 0);

      const result = await watchedRun;

      expect(result.stdout)
        .toContain('server ready');
      expect(result.stdout)
        .not
        .toContain('next run output');
    });
  });
});
