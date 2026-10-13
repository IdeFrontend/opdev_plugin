/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { EventEmitter } from 'events';

let mockOutputChannel: {
  show: jest.Mock;
  appendLine: jest.Mock;
};

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn((_command: string, optionsOrCallback?: unknown, maybeCallback?: unknown) => {
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
      ((error: Error | null)=> void) | undefined;

    callback?.(null);

    return {};
  }),
}));

jest.mock('@plugin/helpers/output-channel', () => ({
  appendLog: jest.fn(),
  getOperatorToolOutputChannel: jest.fn(() => mockOutputChannel),
}));

import {
  exec,
  spawn,
} from 'child_process';

import { CommandExecutor } from '@plugin/class/command-options';
import {
  appendLog,
  getOperatorToolOutputChannel,
} from '@plugin/helpers/output-channel';

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

describe('CommandExecutor.execute (extra)', () => {
  const spawnMock = spawn as unknown as jest.Mock;
  const execMock = exec as unknown as jest.Mock;
  const appendLogMock = appendLog as unknown as jest.Mock;
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  let processKillSpy: jest.SpyInstance;
  let stdoutWriteSpy: jest.SpyInstance;
  let stderrWriteSpy: jest.SpyInstance;

  const pretendPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
      configurable: true,
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockOutputChannel = {
      show: jest.fn(),
      appendLine: jest.fn(),
    };
    processKillSpy = jest.spyOn(process, 'kill')
      .mockImplementation(() => true);
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrWriteSpy = jest.spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    if (realPlatform) {
      Object.defineProperty(process, 'platform', realPlatform);
    }

    processKillSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    jest.useRealTimers();
  });

  it('picks only the non-empty ascend spawn env keys into the log entry', () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    void new CommandExecutor()
      .execute('build', [], [], {
        env: {
          SOC_VERSION: 'Ascend910B',
          NPU_ARCH: '',
          OTHER_VAR: 'junk',
        },
      });

    expect(appendLogMock)
      .toHaveBeenCalledWith('op-devtools/command', 'Executing', expect.objectContaining({
        command: 'build',
        env: { SOC_VERSION: 'Ascend910B' },
      }));
  });

  it('omits the env field from the log when nothing can be picked', () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    void new CommandExecutor()
      .execute('build', [], [], {
        env: {
          SOC_VERSION: '',
          NPU_ARCH: '',
        },
      });

    const logEntry = appendLogMock.mock.calls[0][2] as Record<string, unknown>;

    expect(logEntry.env)
      .toBeUndefined();
    expect(logEntry.args)
      .toBeUndefined();
  });

  it('streams cleaned stdout and stderr when streaming is enabled', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('streamy', [], [], { streaming: true });

    child.stdout.emit('data', Buffer.from('\x1b[31mhello\x1b[0m\n'));
    child.stderr.emit('data', Buffer.from('oops\x08!\n'));
    child.emit('close', 0);

    const result = await resultPromise;

    expect(stdoutWriteSpy)
      .toHaveBeenCalledWith('hello\n');
    expect(stderrWriteSpy)
      .toHaveBeenCalledWith('oops!\n');
    expect(result.stdout)
      .toBe('hello\n');
    expect(result.stderr)
      .toBe('oops!\n');
  });

  it('appends the command and its output to the tool output channel when opened', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'echo hi',
        [],
        [],
        { timeout: 10 },
        true,
      );

    expect(getOperatorToolOutputChannel)
      .toHaveBeenCalledWith('tool');
    expect(mockOutputChannel.show)
      .toHaveBeenCalled();
    expect(mockOutputChannel.appendLine)
      .toHaveBeenCalledWith('echo hi');

    child.stdout.emit('data', Buffer.from('hi\n'));
    jest.advanceTimersByTime(10);
    child.emit('close', 0);

    const result = await resultPromise;

    expect(mockOutputChannel.appendLine)
      .toHaveBeenCalledWith('hi\n');
    expect(mockOutputChannel.appendLine)
      .toHaveBeenCalledWith('Command timed out after 10ms: echo hi');
    expect(result.timedOut)
      .toBe(true);
  });

  it('stops the run when a stop keyword arrives on stderr', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('watch', ['oops']);

    child.stderr.emit('data', Buffer.from('OOPs happened\n'));

    // The stop keyword settles through the same cleanup-then-resolve path.
    child.emit('close', 0);

    const result = await resultPromise;

    expect(result.code)
      .toBe(0);
    expect(result.stderr)
      .toBe('OOPs happened\n');

    if (process.platform === 'win32') {
      expect(execMock)
        .toHaveBeenCalledWith(expect.stringContaining('taskkill /pid 1234'), expect.any(Function));
    }
    else {
      expect(processKillSpy)
        .toHaveBeenCalledWith(-1234, 'SIGTERM');
    }
  });

  it('resolves with the close code when close arrives before exit', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('fast-command');

    child.emit('close', 0);
    child.emit('exit', 0, null);

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({ code: 0 }));
    expect(child.stdout.destroy)
      .not
      .toHaveBeenCalled();
  });

  it('resolves with -1 when the child emits a spawn error', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('missing-binary');

    child.emit('error');

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({ code: -1 }));
  });

  it('appends stderr output to the tool output channel when opened', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'watch',
        [],
        [],
        { toolOutputLabel: 'tool' },
        true,
      );

    expect(getOperatorToolOutputChannel)
      .toHaveBeenCalledWith('tool');
    expect(mockOutputChannel.show)
      .toHaveBeenCalled();
    expect(mockOutputChannel.appendLine)
      .toHaveBeenCalledWith('watch');

    child.stderr.emit('data', Buffer.from('warning\n'));
    child.emit('close', 0);

    const result = await resultPromise;

    expect(result.stderr)
      .toBe('warning\n');
    expect(mockOutputChannel.appendLine)
      .toHaveBeenCalledWith('warning\n');
  });

  it('ignores further stop keywords once the run is already settling', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute('watch', ['stop']);

    child.stdout.emit('data', Buffer.from('stop\n'));
    child.stdout.emit('data', Buffer.from('stop again\n'));
    child.emit('close', 0);

    const result = await resultPromise;

    expect(result.code)
      .toBe(0);
    // The result snapshots the buffers when the first stop keyword settles the
    // run; the second keyword only hits the already-settling guard.
    expect(result.stdout)
      .toBe('stop\n');
  });
});

describe('CommandExecutor.executeDetached (extra)', () => {
  const spawnMock = spawn as unknown as jest.Mock;
  const execMock = exec as unknown as jest.Mock;
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  let processKillSpy: jest.SpyInstance;
  let stdoutWriteSpy: jest.SpyInstance;
  let stderrWriteSpy: jest.SpyInstance;

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
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrWriteSpy = jest.spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    if (realPlatform) {
      Object.defineProperty(process, 'platform', realPlatform);
    }

    processKillSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    jest.useRealTimers();
  });

  it('rejects with the timeout error and kills the process group', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .executeDetached('daemon', 'ready', [], { timeout: 10 });

    // The child never emits close (the kill failed to reach it), so the cleanup
    // watchdog has to settle the run instead.
    jest.advanceTimersByTime(10);
    jest.advanceTimersByTime(5000);

    await expect(resultPromise)
      .rejects
      .toThrow('Command execution timeout after 10ms');

    if (process.platform === 'win32') {
      expect(execMock)
        .toHaveBeenCalledWith(expect.stringContaining('taskkill /pid 1234'), expect.any(Function));
    }
    else {
      expect(processKillSpy)
        .toHaveBeenCalledWith(-1234, 'SIGTERM');
    }
  });

  it('resolves once the ready keyword arrives on stderr', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .executeDetached('daemon', 'READY');

    child.stderr.emit('data', Buffer.from('READY\n'));

    const result = await resultPromise;

    expect(result.code)
      .toBe(0);
    expect(result.stderr)
      .toBe('READY\n');
  });

  it('resolves with the code of the eventual close', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .executeDetached('daemon', 'ready');

    child.emit('close', 7);

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({ code: 7 }));
  });

  it('resolves with -1 when the child emits a spawn error', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .executeDetached('daemon', 'ready');

    child.emit('error');

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({ code: -1 }));
  });

  it('appends detached stdout and stderr to the channel and streams them when opened', async () => {
    mockOutputChannel = {
      show: jest.fn(),
      appendLine: jest.fn(),
    };

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .executeDetached(
        'daemon',
        'ready',
        [],
        {
          toolOutputLabel: 'daemon',
          streaming: true,
        },
        true,
      );

    expect(getOperatorToolOutputChannel)
      .toHaveBeenCalledWith('daemon');
    expect(mockOutputChannel.show)
      .toHaveBeenCalled();
    expect(mockOutputChannel.appendLine)
      .toHaveBeenCalledWith('daemon');

    child.stdout.emit('data', Buffer.from('progress\n'));
    child.stderr.emit('data', Buffer.from('note\n'));
    child.emit('close', 0);

    const result = await resultPromise;

    expect(result.stdout)
      .toBe('progress\n');
    expect(result.stderr)
      .toBe('note\n');
    expect(mockOutputChannel.appendLine)
      .toHaveBeenCalledWith('progress\n');
    expect(mockOutputChannel.appendLine)
      .toHaveBeenCalledWith('note\n');
    expect(stdoutWriteSpy)
      .toHaveBeenCalledWith('progress\n');
    expect(stderrWriteSpy)
      .toHaveBeenCalledWith('note\n');
  });

  it('unrefs the child on non-Windows platforms', async () => {
    pretendPlatform('linux');

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .executeDetached('daemon', 'ready');

    child.emit('close', 0);

    await resultPromise;

    expect(child.unref)
      .toHaveBeenCalled();
  });

  it('keeps the first settlement when the ready keyword and the close race', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .executeDetached('daemon', 'ready');

    child.stdout.emit('data', Buffer.from('ready\n'));
    child.emit('close', 7);

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({ code: 0 }));
  });

  it('resolves through the close once the timeout already settled the run', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .executeDetached('daemon', 'ready', [], { timeout: 10 });

    // The deadline hits; cleanup is pending, so the timeout has not settled yet.
    jest.advanceTimersByTime(10);
    child.emit('close', 0);

    await expect(resultPromise)
      .resolves
      .toEqual(expect.objectContaining({ code: 0 }));
    // The close settlement won the race, so the run is not reported as timed out.
    expect((await resultPromise).timedOut)
      .toBe(false);
  });
});

describe('CommandExecutor.kill / cleanup (extra)', () => {
  const spawnMock = spawn as unknown as jest.Mock;
  const execMock = exec as unknown as jest.Mock;
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  let processKillSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

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
    consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (realPlatform) {
      Object.defineProperty(process, 'platform', realPlatform);
    }

    processKillSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('kill resolves immediately when no process is running', async () => {
    await expect(new CommandExecutor()
      .kill())
      .resolves
      .toBeUndefined();
  });

  it('cleanup finishes immediately when the child has no pid', async () => {
    const child = new FakeChildProcess();

    child.pid = undefined;
    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'pidless',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);

    const result = await resultPromise;

    expect(result.timedOut)
      .toBe(true);
    expect(processKillSpy)
      .not
      .toHaveBeenCalled();
  });

  it('cleanup finishes immediately for a pid-less child on Windows', async () => {
    pretendPlatform('win32');

    const child = new FakeChildProcess();

    child.pid = undefined;
    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'pidless',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);

    const result = await resultPromise;

    expect(result.timedOut)
      .toBe(true);
    expect(execMock)
      .not
      .toHaveBeenCalled();
  });

  it('falls back to killing the child when process group kills throw', async () => {
    if (process.platform === 'win32') {
      return;
    }

    processKillSpy.mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'unkillable',
        [],
        [],
        { timeout: 10 },
      );

    // SIGTERM on the process group throws; the watchdog SIGKILL throws too.
    jest.advanceTimersByTime(10);
    jest.advanceTimersByTime(5000);

    const result = await resultPromise;

    expect(result.timedOut)
      .toBe(true);
    expect(child.kill)
      .toHaveBeenCalledWith('SIGTERM');
    expect(child.kill)
      .toHaveBeenCalledWith('SIGKILL');
  });

  it('marks the interrupted run for the result that settles afterwards', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    // Callers share one executor (ProjectManager.getExecutor()), so the run and
    // the kill must use the same instance: kill() nulls the handle and marks
    // interruptedByUserStop on the executor the run reads its result from.
    const executor = new CommandExecutor();
    const runPromise = executor.execute('long-running');
    const killPromise = executor.kill();

    child.emit('close', 0);
    await killPromise;

    const result = await runPromise;

    expect(result.interruptedByUserStop)
      .toBe(true);
  });

  it('finishes cleanup exactly once when both exit and close arrive', async () => {
    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const executor = new CommandExecutor();
    const runPromise = executor.execute('long-running');
    const killPromise = executor.kill();

    // Both lifecycle events that cleanup listens for arrive; the second one must
    // hit the already-finished guard instead of resolving the kill twice.
    child.emit('exit', 0, null);
    child.emit('close', 0);

    await killPromise;

    const result = await runPromise;

    expect(result.interruptedByUserStop)
      .toBe(true);
    expect(result.code)
      .toBe(0);
  });

  it('logs when the Windows taskkill fails to kill the process tree', async () => {
    pretendPlatform('win32');
    execMock
      .mockImplementationOnce((_command: string, callback?: (error: Error | null)=> void) => {
        callback?.(new Error('taskkill failed'));

        return {};
      });

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'cmd',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);
    child.emit('close', 0);

    const result = await resultPromise;

    expect(result.timedOut)
      .toBe(true);
    expect(consoleErrorSpy)
      .toHaveBeenCalledWith('CommandExecutor: failed to kill process tree:', expect.any(Error));
  });

  it('escalates to SIGKILL on the process group on non-Windows platforms', async () => {
    pretendPlatform('linux');

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'cmd',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);
    jest.advanceTimersByTime(5000);

    const result = await resultPromise;

    expect(result)
      .toEqual(expect.objectContaining({
        code: null,
        timedOut: true,
      }));
    expect(processKillSpy)
      .toHaveBeenCalledWith(-1234, 'SIGKILL');
  });

  it('kills the child directly when the SIGKILL escalation throws on non-Windows', async () => {
    pretendPlatform('linux');
    processKillSpy.mockImplementation((_pid: number, signal: NodeJS.Signals) => {
      if (signal === 'SIGKILL') {
        throw new Error('ESRCH');
      }

      return true;
    });

    const child = new FakeChildProcess();

    spawnMock.mockReturnValue(child);

    const resultPromise = new CommandExecutor()
      .execute(
        'cmd',
        [],
        [],
        { timeout: 10 },
      );

    jest.advanceTimersByTime(10);
    jest.advanceTimersByTime(5000);

    const result = await resultPromise;

    expect(result)
      .toEqual(expect.objectContaining({
        code: null,
        timedOut: true,
      }));
    expect(child.kill)
      .toHaveBeenCalledWith('SIGKILL');
  });
});
