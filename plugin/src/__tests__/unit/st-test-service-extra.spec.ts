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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';

jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({ startNpuHardwareProbe: jest.fn() }));

jest.mock('@plugin/helpers/remote-command', () => ({
  buildRemoteExecCommand: (command: string) => command,
  buildRemoteStTestCommand: (command: string, pullDir: string) =>
    `remote_tool.sh exec --command '${command}' --pull-dir '${pullDir}'`,
  ensureRemoteToolAvailable: jest.fn(),
  RemoteToolUnavailableError: class RemoteToolUnavailableError extends Error {},
}));

jest.mock('@plugin/domain/services/st-test-run-history', () => ({
  createStTestRunHistoryRecord: jest.fn(() => ({})),
  persistStTestRunHistoryRecord: jest.fn(),
}));

import type {
  CommandExecutor,
  CommandResult,
} from '@plugin/class/command-options';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { isStTestCancelledError } from '@plugin/domain/services/st-test-errors';
import { resolveStTestOutputCsvPath } from '@plugin/domain/utils/st-test-paths';
import { startNpuHardwareProbe } from '@plugin/domain/utils/npu-hardware-probe';
import { ensureRemoteToolAvailable } from '@plugin/helpers/remote-command';
import { appendLog } from '@plugin/helpers/output-channel';
import { persistStTestRunHistoryRecord } from '@plugin/domain/services/st-test-run-history';
import {
  resolveRemoteManagedTtkRootBase,
  StTestService,
} from '@plugin/service/st-test-service';
import {
  OPS_TEST_KIT_REVISION,
  type TtkRuntime,
} from '@plugin/service/ttk-installer.service';

const KERNEL_CSV = 'testcase_name,op_name\ncase,add\n';
const REMOTE_ENV_READY_SENTINEL = '__MSTT_REMOTE_ENV_READY__';
const REMOTE_HOME_SENTINEL = '__MSTT_REMOTE_HOME__=';
const REMOTE_PYTHON_VERSION_SENTINEL = '__MSTT_REMOTE_PYTHON_VERSION__=';
const REMOTE_TTK_ROOT_SENTINEL = '__MSTT_REMOTE_TTK_ROOT__=';
const REMOTE_TTK_LOCK_ACQUIRED_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_ACQUIRED__';
const REMOTE_TTK_LOCK_HELD_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_HELD__';
const REMOTE_TTK_LOCK_STALE_RECOVERED_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_STALE_RECOVERED__';

function commandResult(
  code: number = 0,
  stdout: string = '',
  stderr: string = '',
): CommandResult {
  return {
    code,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
    interruptedByUserStop: false,
    timedOut: false,
  };
}

describe('StTestService startStTest preflight (extra)', () => {
  let workspaceRoot: string;
  let operatorPath: string;
  let context: vscode.ExtensionContext;
  let executor: EventEmitter & { execute: jest.Mock };
  let ensureTtkAvailable: jest.Mock<Promise<TtkRuntime>>;
  let detectProjectType: jest.Mock<Promise<OperatorProjectType>>;
  let outputLines: string[];
  let outputChannel: {
    append: jest.Mock;
    appendLine: jest.Mock;
    show: jest.Mock;
  };

  const startNpuProbe = startNpuHardwareProbe as unknown as jest.Mock;
  const remoteToolAvailable = ensureRemoteToolAvailable as unknown as jest.Mock;
  const persistHistory = persistStTestRunHistoryRecord as unknown as jest.Mock;
  const appendLogMock = appendLog as unknown as jest.Mock;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-extra-'));
    operatorPath = path.join(workspaceRoot, 'experimental', 'add custom');
    fs.mkdirSync(path.join(operatorPath, 'tests', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(operatorPath, 'tests', 'st', 'arch35'), { recursive: true });
    fs.writeFileSync(path.join(operatorPath, 'tests', 'st', 'arch35', 'ttk_kernel_extra.csv'), KERNEL_CSV);
    context = {} as vscode.ExtensionContext;
    executor = Object.assign(new EventEmitter(), { execute: jest.fn() });
    ensureTtkAvailable = jest.fn(async () => ({
      source: 'system',
      interpreter: '/usr/bin/python3',
      versionOutput: 'TTK v2.0.0',
      pythonPathEntries: [],
      workingDirectory: path.join(workspaceRoot, 'system-ttk'),
    }));
    detectProjectType = jest.fn(async () => OperatorProjectType.STANDARD_CUSTOM);
    outputLines = [];
    outputChannel = {
      append: jest.fn(),
      appendLine: jest.fn((line: string) => outputLines.push(line)),
      show: jest.fn(),
    };
    jest.clearAllMocks();
    startNpuProbe.mockResolvedValue(false);
    remoteToolAvailable.mockResolvedValue(true);
    persistHistory.mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
    });
  });

  function createService(overrides: Record<string, unknown> = {}): StTestService {
    return new StTestService(context, {
      getExecutor: () => executor as unknown as CommandExecutor,
      ensureTtkAvailable,
      detectProjectType,
      getEnvironmentScriptPath: () => '/cann/CANN env/set_env.sh',
      getOutputChannel: () => outputChannel as unknown as vscode.OutputChannel,
      createRunId: () => 'run-id',
      ...overrides,
    });
  }

  function expectedOutputPath(sequence: number = 1): string {
    const inputCsvPath = path.join(operatorPath, 'tests', 'st', 'arch35', 'ttk_kernel_extra.csv');

    return resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence,
    });
  }

  it('installs the default dependency implementations in the constructor', () => {
    // Constructing without dependencies only assigns the lazily-evaluated
    // defaults, so no executor or TTK installer work is performed here.
    expect(() => new StTestService({} as vscode.ExtensionContext))
      .not
      .toThrow();
  });

  it('rejects an empty ST test mode selection', async () => {
    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: [],
      }))
      .rejects
      .toThrow('Select at least one ST test mode');
    expect(executor.execute)
      .not
      .toHaveBeenCalled();
  });

  it('rejects an operator path without any tests directory', async () => {
    const bareOperatorPath = path.join(workspaceRoot, 'experimental', 'bare-op');

    fs.mkdirSync(bareOperatorPath, { recursive: true });

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'bare-op',
        operatorPath: bareOperatorPath,
        modes: ['kernel'],
      }))
      .rejects
      .toThrow(`No tests/assets or tests directory exists under ${bareOperatorPath}`);
    expect(executor.execute)
      .not
      .toHaveBeenCalled();
  });

  it('rejects an operator directory outside the workspace', async () => {
    const outsideOperatorPath = path.join(workspaceRoot, '..', 'outside-op');

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'outside-op',
        operatorPath: outsideOperatorPath,
        modes: ['kernel'],
      }))
      .rejects
      .toThrow('Selected operator is outside the current workspace');
  });

  it('rejects invalid ST test argument tokens with the validation code', async () => {
    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
        argumentsByMode: { kernel: 'not-an-array' as unknown as readonly string[] },
      }))
      .rejects
      .toThrow('Invalid ST test kernel argument token (not_array)');
    expect(executor.execute)
      .not
      .toHaveBeenCalled();
  });

  it('treats an interrupted TTK command as a cancellation', async () => {
    executor.execute.mockResolvedValue({
      ...commandResult(),
      interruptedByUserStop: true,
    });

    try {
      await createService({ shouldRunRemotely: async () => false })
        .startStTest({
          workspaceRoot,
          operatorName: 'add custom',
          operatorPath,
          modes: ['kernel'],
        });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }

    expect(outputLines.join('\n'))
      .toContain('Cancelled. Produced before cancellation: none');
  });

  it('keeps the run when run history persistence fails', async () => {
    const outputPath = expectedOutputPath();

    executor.execute.mockImplementation(async () => {
      fs.writeFileSync(outputPath, KERNEL_CSV);

      return commandResult();
    });
    persistHistory.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const result = await createService({ shouldRunRemotely: async () => false })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      });

    expect(result.outputPaths)
      .toEqual([outputPath]);
    expect(outputLines.join('\n'))
      .toContain('Could not persist run history: disk full');
    expect(appendLogMock)
      .toHaveBeenCalledWith('op-devtools/st-test', 'ST run history persistence failed', expect.objectContaining({ runId: 'run-id' }));
  });
});

describe('StTestService remote runtime resolution (extra)', () => {
  let workspaceRoot: string;
  let operatorPath: string;
  let executor: EventEmitter & { execute: jest.Mock };
  let detectProjectType: jest.Mock<Promise<OperatorProjectType>>;
  let outputLines: string[];
  let outputChannel: {
    append: jest.Mock;
    appendLine: jest.Mock;
    show: jest.Mock;
  };
  let managedRoot: string;

  const startNpuProbe = startNpuHardwareProbe as unknown as jest.Mock;
  const remoteToolAvailable = ensureRemoteToolAvailable as unknown as jest.Mock;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-remote-'));
    operatorPath = path.join(workspaceRoot, 'experimental', 'add custom');
    fs.mkdirSync(path.join(operatorPath, 'tests', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(operatorPath, 'tests', 'st', 'arch35'), { recursive: true });
    fs.writeFileSync(path.join(operatorPath, 'tests', 'st', 'arch35', 'ttk_kernel_extra.csv'), KERNEL_CSV);
    executor = Object.assign(new EventEmitter(), { execute: jest.fn() });
    detectProjectType = jest.fn(async () => OperatorProjectType.STANDARD_CUSTOM);
    outputLines = [];
    outputChannel = {
      append: jest.fn(),
      appendLine: jest.fn((line: string) => outputLines.push(line)),
      show: jest.fn(),
    };
    managedRoot = path.posix.join(
      resolveRemoteManagedTtkRootBase('/home/remote-user'),
      'python-3.11',
    );
    jest.clearAllMocks();
    startNpuProbe.mockResolvedValue(false);
    remoteToolAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
    });
  });

  function createService(overrides: Record<string, unknown> = {}): StTestService {
    return new StTestService({} as vscode.ExtensionContext, {
      getExecutor: () => executor as unknown as CommandExecutor,
      ensureTtkAvailable: jest.fn(),
      detectProjectType,
      getEnvironmentScriptPath: () => '/cann/CANN env/set_env.sh',
      getOutputChannel: () => outputChannel as unknown as vscode.OutputChannel,
      createRunId: () => 'run-id',
      ...overrides,
    });
  }

  function expectedOutputPath(sequence: number = 1): string {
    const inputCsvPath = path.join(operatorPath, 'tests', 'st', 'arch35', 'ttk_kernel_extra.csv');

    return resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence,
    });
  }

  function startRemoteFlow(): Promise<unknown> {
    return createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      });
  }

  it('falls back to the local TTK when the local NPU probe succeeds', async () => {
    const outputPath = expectedOutputPath();

    startNpuProbe.mockResolvedValue(true);
    executor.execute.mockImplementation(async () => {
      fs.writeFileSync(outputPath, KERNEL_CSV);

      return commandResult();
    });

    const result = await createService({
      ensureTtkAvailable: jest.fn(async () => ({
        source: 'system',
        interpreter: '/usr/bin/python3',
        versionOutput: 'TTK v2.0.0',
        pythonPathEntries: [],
        workingDirectory: path.join(workspaceRoot, 'system-ttk'),
      })),
    })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      });

    expect(remoteToolAvailable)
      .not
      .toHaveBeenCalled();
    expect(result.runtimeSource)
      .toBe('system');
  });

  it('treats an unavailable remote tool as a cancellation', async () => {
    startNpuProbe.mockRejectedValue(new Error('probe crashed'));
    remoteToolAvailable.mockResolvedValue(false);

    try {
      await startRemoteFlow();
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }

    expect(outputLines.join('\n'))
      .toContain('Cancelled. Produced before cancellation: none');
    expect(executor.execute)
      .not
      .toHaveBeenCalled();
  });

  it('rejects when the remote environment script probe fails', async () => {
    executor.execute.mockImplementation(async () => commandResult(7, '', 'no such file'));

    await expect(startRemoteFlow())
      .rejects
      .toThrow('Remote environment script is unavailable: /cann/CANN env/set_env.sh');
  });

  it('rejects when the remote Python probe fails', async () => {
    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      return commandResult(7, '', 'python3 not found');
    });

    await expect(startRemoteFlow())
      .rejects
      .toThrow('Remote Python probe failed with exit code 7');
  });

  it('rejects a malformed remote Python probe response', async () => {
    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      // The home sentinel line is missing from the response.
      return commandResult(0, '__MSTT_REMOTE_HOME__\n');
    });

    await expect(startRemoteFlow())
      .rejects
      .toThrow('Remote Python probe returned an invalid response');
  });

  it('rejects a malformed remote Python version', async () => {
    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      return commandResult(0, `${REMOTE_HOME_SENTINEL}/home/remote-user\n${REMOTE_PYTHON_VERSION_SENTINEL}3.11.5\n`);
    });

    await expect(startRemoteFlow())
      .rejects
      .toThrow('Remote Python probe returned an invalid version');
  });

  it('falls back to the managed cache when the remote system TTK validation fails', async () => {
    const outputPath = expectedOutputPath();
    let ttkVersionCalls = 0;

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      if (command.includes(REMOTE_PYTHON_VERSION_SENTINEL)) {
        return commandResult(0, `${REMOTE_HOME_SENTINEL}/home/remote-user\n${REMOTE_PYTHON_VERSION_SENTINEL}3.11\n`);
      }

      if (command.includes('import os, ttk')) {
        return commandResult(0, `${REMOTE_TTK_ROOT_SENTINEL}/opt/ops-test-kit\n`);
      }

      if (command.includes("'-m' 'ttk' '-v'")) {
        ttkVersionCalls += 1;

        // Stage 4 fails for the system TTK, stage 6 passes for the managed cache.
        return ttkVersionCalls === 1
          ? commandResult(7, '', 'TTK import failed')
          : commandResult(0, 'TTK v2.0.0\n');
      }

      if (command.includes(REMOTE_TTK_ROOT_SENTINEL)) {
        return commandResult(0, `${REMOTE_TTK_ROOT_SENTINEL}${managedRoot}\n`);
      }

      if (command.includes("'ttk' 'kernel'")) {
        fs.writeFileSync(outputPath, KERNEL_CSV);

        return commandResult();
      }

      throw new Error(`Unhandled remote command: ${command}`);
    });

    const result = await startRemoteFlow();

    expect(outputLines.join('\n'))
      .toContain('Remote system TTK validation failed; checking the managed cache.');
    expect(result.runtimeSource)
      .toBe('remote');
    expect(result.outputPaths)
      .toEqual([outputPath]);
  });

  it('replaces a remote managed TTK cache whose validation fails', async () => {
    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      if (command.includes(REMOTE_PYTHON_VERSION_SENTINEL)) {
        return commandResult(0, `${REMOTE_HOME_SENTINEL}/home/remote-user\n${REMOTE_PYTHON_VERSION_SENTINEL}3.11\n`);
      }

      if (command.includes('import os, ttk')) {
        return commandResult(7);
      }

      if (command.includes(REMOTE_TTK_ROOT_SENTINEL)) {
        return commandResult(0, `${REMOTE_TTK_ROOT_SENTINEL}${managedRoot}\n`);
      }

      if (command.includes("'-m' 'ttk' '-v'")) {
        return commandResult(7, '', 'TTK import failed');
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(7, '', 'mkdir failed');
      }

      throw new Error(`Unhandled remote command: ${command}`);
    });

    await expect(startRemoteFlow())
      .rejects
      .toThrow('Remote TTK step failed while acquiring the remote managed TTK cache lock; exit code 7');
    expect(outputLines.join('\n'))
      .toContain('Existing remote managed TTK is unusable; preparing a replacement cache.');
  });

  it('rejects an unknown remote lock attempt result', async () => {
    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      if (command.includes(REMOTE_PYTHON_VERSION_SENTINEL)) {
        return commandResult(0, `${REMOTE_HOME_SENTINEL}/home/remote-user\n${REMOTE_PYTHON_VERSION_SENTINEL}3.11\n`);
      }

      if (command.includes('import os, ttk') || command.includes(REMOTE_TTK_ROOT_SENTINEL)) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, '');
      }

      throw new Error(`Unhandled remote command: ${command}`);
    });

    await expect(startRemoteFlow())
      .rejects
      .toThrow('Remote managed TTK cache lock attempt returned an unknown result');
  });

  it('rejects a remote ops-test-kit revision mismatch', async () => {
    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      if (command.includes(REMOTE_PYTHON_VERSION_SENTINEL)) {
        return commandResult(0, `${REMOTE_HOME_SENTINEL}/home/remote-user\n${REMOTE_PYTHON_VERSION_SENTINEL}3.11\n`);
      }

      if (command.includes('import os, ttk') || command.includes(REMOTE_TTK_ROOT_SENTINEL)) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, `${REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(0, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
      }

      // Staging setup, clone and dependency install succeed; the failing
      // cleanup and lock release prove the swallow-all guards in the
      // provisioning catch/finally keep the original error intact.
      if (command.includes('rm -rf')
        && command.includes('.staging-run-id')
        && !command.includes('mkdir -p')) {
        return Promise.reject(new Error('cleanup failed'));
      }

      if (command.includes('grep -Fq') && command.includes('.lock/owner.json')) {
        return Promise.reject(new Error('release failed'));
      }

      return commandResult();
    });

    await expect(startRemoteFlow())
      .rejects
      .toThrow(`Remote ops-test-kit revision does not match ${OPS_TEST_KIT_REVISION}`);
  });

  it('rejects a failed staged remote managed TTK validation with its signature flag', async () => {
    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      if (command.includes(REMOTE_PYTHON_VERSION_SENTINEL)) {
        return commandResult(0, `${REMOTE_HOME_SENTINEL}/home/remote-user\n${REMOTE_PYTHON_VERSION_SENTINEL}3.11\n`);
      }

      if (command.includes('import os, ttk') || command.includes(REMOTE_TTK_ROOT_SENTINEL)) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, `${REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(0, `${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'ttk' '-v'")) {
        // The staged runtime reports a version signature but still fails to import.
        return commandResult(7, 'TTK v2.0.0\n', 'ImportError');
      }

      return commandResult();
    });

    await expect(startRemoteFlow())
      .rejects
      .toThrow('Staged remote managed TTK validation failed with exit code 7; TTK version signature found: true');
    expect(outputLines.join('\n'))
      .toContain('cleaning up the failed remote managed TTK staging directory');
  });

  it('restores the previous cache when the published remote managed TTK validation fails', async () => {
    let ttkVersionCalls = 0;

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      if (command.includes(REMOTE_PYTHON_VERSION_SENTINEL)) {
        return commandResult(0, `${REMOTE_HOME_SENTINEL}/home/remote-user\n${REMOTE_PYTHON_VERSION_SENTINEL}3.11\n`);
      }

      if (command.includes('import os, ttk') || command.includes(REMOTE_TTK_ROOT_SENTINEL)) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, `${REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(0, `${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'-m' 'ttk' '-v'")) {
        ttkVersionCalls += 1;

        // Stage 14 passes, stage 16 fails after the cache was published.
        return ttkVersionCalls === 1
          ? commandResult(0, 'TTK v2.0.0\n')
          : commandResult(7, '', 'broken after publish');
      }

      return commandResult();
    });

    await expect(startRemoteFlow())
      .rejects
      .toThrow('Published remote managed TTK validation failed with exit code 7; TTK version signature found: false');
    expect(outputLines.join('\n'))
      .toContain('restoring the previous remote managed TTK cache');
  });

  it('accepts a remote managed TTK that became ready while waiting for the cache lock', async () => {
    const outputPath = expectedOutputPath();
    let managedProbeCalls = 0;

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes(REMOTE_ENV_READY_SENTINEL)) {
        return commandResult(0, `${REMOTE_ENV_READY_SENTINEL}\n`);
      }

      if (command.includes(REMOTE_PYTHON_VERSION_SENTINEL)) {
        return commandResult(0, `${REMOTE_HOME_SENTINEL}/home/remote-user\n${REMOTE_PYTHON_VERSION_SENTINEL}3.11\n`);
      }

      if (command.includes('import os, ttk')) {
        return commandResult(7);
      }

      if (command.includes(REMOTE_TTK_ROOT_SENTINEL)) {
        managedProbeCalls += 1;

        // Stage 5 finds nothing, the stage 8 recheck after the lock sees the cache.
        return managedProbeCalls === 1
          ? commandResult(7)
          : commandResult(0, `${REMOTE_TTK_ROOT_SENTINEL}${managedRoot}\n`);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, `${REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      if (command.includes("'-m' 'ttk' '-v'")) {
        return commandResult(0, 'TTK v2.0.0\n');
      }

      if (command.includes("'ttk' 'kernel'")) {
        fs.writeFileSync(outputPath, KERNEL_CSV);

        return commandResult();
      }

      if (command.includes('grep -Fq') && command.includes('.lock/owner.json')) {
        return commandResult();
      }

      throw new Error(`Unhandled remote command: ${command}`);
    });

    const result = await startRemoteFlow();

    expect(outputLines.join('\n'))
      .toContain('Remote managed TTK became ready while waiting for the cache lock.');
    expect(result.runtimeSource)
      .toBe('remote');
    expect(result.outputPaths)
      .toEqual([outputPath]);
    expect(executor.execute)
      .toHaveBeenCalledTimes(9);
  });

  it('cancels when a remote TTK probe result is interrupted', async () => {
    executor.execute.mockResolvedValue({
      ...commandResult(),
      interruptedByUserStop: true,
    });

    try {
      await startRemoteFlow();
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }

    expect(outputLines.join('\n'))
      .toContain('Cancelled. Produced before cancellation: none');
  });

  it('requires an absolute remote TTK working directory', () => {
    const service = createService() as unknown as {
      buildRemoteTtkExecutionCommand: (command: string, workingDirectory: string | undefined)=> string;
    };

    expect(() => service.buildRemoteTtkExecutionCommand('echo hi', undefined))
      .toThrow('Remote TTK working directory is unavailable');
    expect(() => service.buildRemoteTtkExecutionCommand('echo hi', 'ops-test-kit'))
      .toThrow('Remote TTK working directory is unavailable');

    const wrapped = service.buildRemoteTtkExecutionCommand('echo hi', '/opt/ttk');

    expect(wrapped)
      .toContain('cd \'/opt/ttk\'');
    expect(wrapped)
      .toContain('test ! -L \'/opt/ttk\'');
    expect(wrapped)
      .toContain('echo hi');
  });

  it('rethrows non-ENOENT lstat errors from the result file check', async () => {
    const outputPath = expectedOutputPath();
    const realLstatSync = jest.requireActual('fs').lstatSync as typeof fs.lstatSync;
    let executed = false;

    executor.execute.mockImplementation(async () => {
      executed = true;

      return commandResult();
    });

    const lstatSpy = jest.spyOn(jest.requireActual('fs'), 'lstatSync')
      .mockImplementation((targetPath) => {
        if (executed && path.resolve(targetPath as string) === path.resolve(outputPath)) {
          const error = new Error('permission denied') as NodeJS.ErrnoException;

          error.code = 'EACCES';
          throw error;
        }

        return realLstatSync(targetPath as fs.PathLike);
      });

    try {
      await expect(createService({
        shouldRunRemotely: async () => false,
        ensureTtkAvailable: jest.fn(async () => ({
          source: 'system',
          interpreter: '/usr/bin/python3',
          versionOutput: 'TTK v2.0.0',
          pythonPathEntries: [],
          workingDirectory: path.join(workspaceRoot, 'system-ttk'),
        })),
      })
        .startStTest({
          workspaceRoot,
          operatorName: 'add custom',
          operatorPath,
          modes: ['kernel'],
        }))
        .rejects
        .toThrow('permission denied');
      expect(outputLines.join('\n'))
        .toContain('[ST test] Failed: permission denied');
    }
    finally {
      lstatSpy.mockRestore();
    }
  });
});
