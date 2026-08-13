import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';

import type { CommandExecutor } from '@plugin/class/command-options';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { isStTestCancelledError } from '@plugin/domain/services/st-test-errors';
import { ST_TEST_RUN_MANIFEST_FILE } from '@plugin/domain/services/st-test-run-history';
import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';
import {
  discoverStTestInputCsvFiles,
  resolveStTestOutputCsvPath,
  resolveStTestRunDirectory,
} from '@plugin/domain/utils/st-test-paths';
import {
  resolveRemoteManagedTtkRootBase,
  resolveRemoteStTestPullDir,
  StTestService,
} from '@plugin/service/st-test-service';
import {
  OPS_TEST_KIT_REVISION,
  type TtkRuntime,
} from '@plugin/service/ttk-installer.service';

const CSV_BY_MODE = {
  kernel: 'testcase_name,op_name\ncase,add\n',
  aclnn: 'testcase_name,api_name\ncase,aclnnAdd\n',
  e2e: 'testcase_name,api_name\ncase,torch.add\n',
} as const;
const REMOTE_TTK_LOCK_ACQUIRED_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_ACQUIRED__';
const REMOTE_TTK_LOCK_HELD_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_HELD__';
const REMOTE_TTK_LOCK_STALE_RECOVERED_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_STALE_RECOVERED__';

function commandResult(
  code: number = 0,
  stdout: string = '',
  stderr: string = '',
) {
  return {
    code,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
    interruptedByUserStop: false,
    timedOut: false,
  };
}

describe('StTestService', () => {
  let workspaceRoot: string;
  let operatorPath: string;
  let context: vscode.ExtensionContext;
  let systemTtkRoot: string;
  let executor: EventEmitter & { execute: jest.Mock };
  let ensureTtkAvailable: jest.Mock<Promise<TtkRuntime>>;
  let detectProjectType: jest.Mock<Promise<OperatorProjectType>>;
  let rawChunks: string[];
  let outputLines: string[];
  let outputChannel: {
    append: jest.Mock;
    appendLine: jest.Mock;
    show: jest.Mock;
  };

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-service-'));
    operatorPath = path.join(workspaceRoot, 'experimental', 'add custom');
    fs.mkdirSync(path.join(operatorPath, 'tests', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(operatorPath, 'tests', 'st', 'arch35'), { recursive: true });
    context = { globalStorageUri: { fsPath: path.join(workspaceRoot, '.global-storage') } } as vscode.ExtensionContext;
    systemTtkRoot = path.join(workspaceRoot, 'system-ttk');
    fs.mkdirSync(systemTtkRoot);
    executor = Object.assign(new EventEmitter(), { execute: jest.fn() });
    ensureTtkAvailable = jest.fn(async () => ({
      source: 'system',
      interpreter: '/usr/bin/python3',
      versionOutput: 'TTK v2.0.0',
      pythonPathEntries: [],
      workingDirectory: systemTtkRoot,
    }));
    detectProjectType = jest.fn(async () => OperatorProjectType.STANDARD_CUSTOM);
    rawChunks = [];
    outputLines = [];
    outputChannel = {
      append: jest.fn((chunk: string) => rawChunks.push(chunk)),
      appendLine: jest.fn((line: string) => outputLines.push(line)),
      show: jest.fn(),
    };
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
      shouldRunRemotely: async () => false,
      ...overrides,
    });
  }

  function writeInput(
    name: string,
    mode: keyof typeof CSV_BY_MODE = 'kernel',
  ): string {
    const inputPath = path.join(operatorPath, 'tests', 'st', 'arch35', name);

    fs.writeFileSync(inputPath, CSV_BY_MODE[mode]);

    return inputPath;
  }

  it('uses the ST results directory as the remote ST result pull directory', () => {
    const workspacePath = process.platform === 'win32'
      ? path.join('C:\\repo', 'workspace')
      : path.join('/repo', 'workspace');
    const expected = process.platform === 'win32'
      ? 'C:/repo/workspace/.vscode/st-results/'
      : '/repo/workspace/.vscode/st-results/';

    expect(resolveRemoteStTestPullDir(workspacePath))
      .toBe(expected);
  });

  it('runs every selected-mode CSV sequentially with unique outputs and raw Test output', async () => {
    const kernelZ = writeInput('zeta.csv');
    const kernelA = writeInput('alpha.csv');
    const aclnn = writeInput('beta.csv', 'aclnn');
    const expectedInputs = [
      kernelA,
      kernelZ,
      aclnn,
    ];
    const expectedOutputs = expectedInputs.map((inputCsvPath, index) => resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: index < 2 ? 'kernel' : 'aclnn',
      inputCsvPath,
      runId: 'run-id',
      sequence: index + 1,
    }));
    const expectedRunDirectory = resolveStTestRunDirectory({
      workspaceRoot,
      operatorName: 'add custom',
      runId: 'run-id',
    });
    const expectedRawChunks = expectedInputs.flatMap((_, index) => [
      `raw stdout ${index}\n`,
      `raw stderr ${index}\n`,
    ]);
    let executionIndex = 0;

    executor.execute.mockImplementation(async () => {
      const outputPath = expectedOutputs[executionIndex];
      const command = executor.execute.mock.calls[executionIndex][0] as string;

      expect(outputLines)
        .toContain(`[ST test] Command: ${command}`);

      fs.writeFileSync(outputPath, `result ${executionIndex}`);
      executor.emit('stdout', `raw stdout ${executionIndex}\n`);
      executor.emit('stderr', `raw stderr ${executionIndex}\n`);
      executionIndex += 1;

      return commandResult();
    });

    const result = await createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: [
          'aclnn',
          'kernel',
        ],
      });

    expect(result)
      .toMatchObject({
        outputPaths: expectedOutputs,
        runDirectory: expectedRunDirectory,
        runtimeSource: 'system',
      });
    expect(result.artifacts)
      .toEqual(expectedInputs.map((inputCsvPath, index) => ({
        artifactId: `run-id:${String(index + 1)}`,
        sequence: index + 1,
        mode: index < 2 ? 'kernel' : 'aclnn',
        inputCsvPath,
        outputCsvPath: expectedOutputs[index],
      })));
    expect(fs.existsSync(path.join(expectedRunDirectory, ST_TEST_RUN_MANIFEST_FILE)))
      .toBe(true);
    expect(result.report.files.map((file) => ({
      sequence: file.sequence,
      mode: file.mode,
      testFile: file.testFile,
    })))
      .toEqual([
        {
          sequence: 1,
          mode: 'kernel',
          testFile: 'tests/st/arch35/alpha.csv',
        },
        {
          sequence: 2,
          mode: 'kernel',
          testFile: 'tests/st/arch35/zeta.csv',
        },
        {
          sequence: 3,
          mode: 'aclnn',
          testFile: 'tests/st/arch35/beta.csv',
        },
      ]);
    expect(executor.execute)
      .toHaveBeenCalledTimes(3);
    expectedInputs.forEach((inputPath, index) => {
      const command = executor.execute.mock.calls[index][0] as string;

      expect(command)
        .toContain(shellQuoteBash(inputPath));
      expect(command)
        .toContain(shellQuoteBash(expectedOutputs[index]));
      expect(command)
        .toContain(shellQuoteBash(path.join(operatorPath, 'tests', 'assets')));
      expect(command)
        .toContain(". '/cann/CANN env/set_env.sh'");
      expect(executor.execute.mock.calls[index][3])
        .toEqual({
          cwd: systemTtkRoot,
          timeout: 1800 * 1000,
        });
    });
    expect(ensureTtkAvailable)
      .toHaveBeenCalledWith({
        environmentScriptPath: '/cann/CANN env/set_env.sh',
        isCancellationRequested: undefined,
      });
    expect(outputChannel.show)
      .toHaveBeenCalledWith(true);
    expect(rawChunks)
      .toEqual(expectedRawChunks);
    expect(outputChannel.append.mock.calls)
      .toEqual(expectedRawChunks.map((chunk) => [chunk]));
    expect(outputLines.join('\n'))
      .toContain('Precision report: invalid');
    expect(outputLines.filter((line) => line.startsWith('[ST test] Command: ')))
      .toHaveLength(3);
    expect(executor.listenerCount('stdout'))
      .toBe(0);
    expect(executor.listenerCount('stderr'))
      .toBe(0);
  });

  it('passes configured arguments to the matching mode command', async () => {
    const inputCsvPath = writeInput('ttk_kernel_custom.csv');
    const outputCsvPath = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });

    executor.execute.mockImplementation(async () => {
      fs.writeFileSync(outputCsvPath, CSV_BY_MODE.kernel);

      return commandResult();
    });

    await createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add',
        operatorPath,
        modes: ['kernel'],
        argumentsByMode: {
          kernel: [
            '--warmup',
            'two words',
          ],
        },
      });

    const command = executor.execute.mock.calls[0][0] as string;

    expect(command)
      .toContain("'--warmup' 'two words'");
    expect(command).not.toContain('-d=false');
    expect(outputLines)
      .toContain(`[ST test] Command: ${command}`);
  });

  it('executes a managed TTK command from its final managed source root', async () => {
    const inputCsvPath = writeInput('ttk_kernel_a.csv');
    const managedRoot = path.join(workspaceRoot, '.global-storage', 'ttk', 'ops-test-kit');
    const expectedOutput = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });

    ensureTtkAvailable.mockResolvedValue({
      source: 'managed',
      interpreter: '/usr/bin/python3',
      versionOutput: 'TTK v3.0.0',
      pythonPathEntries: [
        managedRoot,
        path.join(path.dirname(managedRoot), 'dependencies'),
      ],
      workingDirectory: managedRoot,
    });
    executor.execute.mockImplementation(async () => {
      fs.writeFileSync(expectedOutput, 'result');

      return commandResult();
    });

    await createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      });

    const command = executor.execute.mock.calls[0][0] as string;

    expect(executor.execute.mock.calls[0][3])
      .toEqual({
        cwd: managedRoot,
        timeout: 1800 * 1000,
      });
    expect(command)
      .toContain(shellQuoteBash(inputCsvPath));
    expect(command)
      .toContain(shellQuoteBash(expectedOutput));
    expect(command)
      .toContain(shellQuoteBash(path.join(operatorPath, 'tests', 'assets')));
    expect(command).not.toContain('remote_tool.sh');
    expect(executor.execute)
      .toHaveBeenCalledTimes(1);
    expect(outputLines.join('\n')).not.toContain('Remote TTK');
  });

  it('runs remote ST commands with remote managed TTK PYTHONPATH and pulls the ST results directory', async () => {
    const inputCsvPath = writeInput('ttk_kernel_remote.csv');
    const expectedOutput = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });

    const remoteHome = '/home/remote-user';
    const managedRoot = path.posix.join(
      resolveRemoteManagedTtkRootBase(remoteHome),
      'python-3.11',
    );

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, `__MSTT_REMOTE_HOME__=${remoteHome}\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n`);
      }

      if (command.includes('import os, ttk')) {
        return commandResult(7, '', 'ModuleNotFoundError: No module named ttk\n');
      }

      if (command.includes('__MSTT_REMOTE_TTK_ROOT__')) {
        return commandResult(0, `__MSTT_REMOTE_TTK_ROOT__=${managedRoot}\n`);
      }

      if (command.includes("'\\''-m'\\'' '\\''ttk'\\'' '\\''-v'\\''")) {
        return commandResult(0, 'TTK v2.0.0\n');
      }

      fs.writeFileSync(expectedOutput, CSV_BY_MODE.kernel);

      return commandResult();
    });

    const result = await createService({ shouldRunRemotely: async () => true })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      });

    const launchedCommand = executor.execute.mock.calls[5][0] as string;

    expect(executor.execute)
      .toHaveBeenCalledTimes(6);
    expect(launchedCommand)
      .toMatch(/^remote_tool\.sh exec --progress --command '/);
    expect(launchedCommand)
      .toContain("--pull-dir '");
    expect(launchedCommand)
      .toContain(resolveRemoteStTestPullDir(workspaceRoot));
    expect(launchedCommand)
      .toContain("'\\''python3'\\'' '\\''-m'\\'' '\\''ttk'\\''");
    expect(launchedCommand)
      .toContain('export PYTHONDONTWRITEBYTECODE=1');
    expect(launchedCommand)
      .toContain(managedRoot.replace(/\//g, '/'));
    expect(launchedCommand)
      .toContain('dependencies');
    expect(launchedCommand)
      .toContain('PYTHONPATH');
    expect(launchedCommand)
      .toContain(`cd '\\''${path.posix.join(managedRoot, 'ops-test-kit')}'\\''`);
    expect(launchedCommand)
      .toContain(`test ! -L '\\''${path.posix.join(managedRoot, 'ops-test-kit')}'\\''`);
    expect(launchedCommand)
      .toContain(`test -w '\\''${path.posix.join(managedRoot, 'ops-test-kit')}'\\''`);
    expect(launchedCommand)
      .toContain('Remote TTK working directory');
    expect(executor.execute.mock.calls[4][0])
      .toContain(`cd '\\''${path.posix.join(managedRoot, 'ops-test-kit')}'\\''`);
    expect(launchedCommand).not.toContain(context.globalStorageUri.fsPath);
    expect(ensureTtkAvailable)
      .not.toHaveBeenCalled();
    expect(result.runtimeSource)
      .toBe('remote');
    expect(outputLines)
      .toContain(`[ST test] Command: ${launchedCommand}`);
    expect(outputLines.join('\n'))
      .toContain('Remote TTK 1/17: checking the remote environment script');
    expect(outputLines.join('\n'))
      .toContain('Remote system TTK was not found; checking the managed cache.');
    expect(outputLines.join('\n'))
      .toContain(`Remote managed TTK root: ${managedRoot}`);
  });

  it('uses a remote system TTK without checking the managed cache', async () => {
    const inputCsvPath = writeInput('ttk_kernel_remote_system.csv');
    const expectedOutput = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });
    const remoteSystemRoot = '/opt/ops-test-kit';

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, '__MSTT_REMOTE_HOME__=/home/remote-user\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n');
      }

      if (command.includes('import os, ttk')) {
        return commandResult(0, `__MSTT_REMOTE_TTK_ROOT__=${remoteSystemRoot}\n`);
      }

      if (command.includes("'\\''-m'\\'' '\\''ttk'\\'' '\\''-v'\\''")) {
        return commandResult(0, 'TTK v2.0.0\n');
      }

      fs.writeFileSync(expectedOutput, CSV_BY_MODE.kernel);

      return commandResult();
    });

    const result = await createService({ shouldRunRemotely: async () => true })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      });
    const launchedCommand = executor.execute.mock.calls[4][0] as string;

    expect(executor.execute)
      .toHaveBeenCalledTimes(5);
    expect(launchedCommand)
      .toMatch(/^remote_tool\.sh exec --progress --command '/);
    expect(launchedCommand).not.toContain('globalStorage');
    expect(launchedCommand).not.toContain('PYTHONPATH');
    expect(launchedCommand)
      .toContain(`cd '\\''${remoteSystemRoot}'\\''`);
    expect(launchedCommand)
      .toContain(`test ! -L '\\''${remoteSystemRoot}'\\''`);
    expect(launchedCommand)
      .toContain(`test -w '\\''${remoteSystemRoot}'\\''`);
    expect(launchedCommand)
      .toContain('Remote TTK working directory');
    expect(executor.execute.mock.calls[3][0])
      .toContain(`cd '\\''${remoteSystemRoot}'\\''`);
    expect(ensureTtkAvailable).not.toHaveBeenCalled();
    expect(result.runtimeSource)
      .toBe('remote');
    expect(outputLines.join('\n'))
      .toContain(`Remote system TTK root: ${remoteSystemRoot}`);
    expect(outputLines.join('\n'))
      .toContain('Remote system TTK is ready; managed TTK preparation skipped.');
    expect(outputLines.join('\n')).not.toContain('locating the remote managed TTK cache');
  });

  it('stops a remote run whose TTK probe timed out instead of reinstalling TTK', async () => {
    writeInput('ttk_kernel_remote_timeout.csv');

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, '__MSTT_REMOTE_HOME__=/home/remote-user\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n');
      }

      // The probe hangs. execute() reports that in the result instead of rejecting, and
      // every probe here reads a non-zero exit as "this TTK is unusable", so a timeout must
      // not be mistaken for an absent TTK and start a clone plus pip install.
      return {
        ...commandResult(null as unknown as number),
        timedOut: true,
      };
    });

    await expect(createService({ shouldRunRemotely: async () => true })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects
      .toThrow(/timed out/);

    expect(outputLines.join('\n'))
      .not
      .toContain('downloading the pinned ops-test-kit revision');
  });

  it('provisions TTK in the remote NPU environment before running ST', async () => {
    const inputCsvPath = writeInput('ttk_kernel_remote_install.csv');
    const expectedOutput = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });
    const remoteHome = '/home/remote-user';
    const managedRoot = path.posix.join(
      resolveRemoteManagedTtkRootBase(remoteHome),
      'python-3.11',
    );

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, `__MSTT_REMOTE_HOME__=${remoteHome}\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n`);
      }

      if (command.includes('import os, ttk')) {
        return commandResult(7, '', 'ModuleNotFoundError: No module named ttk\n');
      }

      if (command.includes('__MSTT_REMOTE_TTK_ROOT__')) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, `${REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      if (command.includes('rev-parse HEAD')) {
        return commandResult(0, `${OPS_TEST_KIT_REVISION}\n`);
      }

      if (command.includes("'\\''-m'\\'' '\\''ttk'\\'' '\\''-v'\\''")) {
        return commandResult(0, 'TTK v2.0.0\n');
      }

      if (command.includes("'\\''ttk'\\'' '\\''kernel'\\''")) {
        fs.writeFileSync(expectedOutput, CSV_BY_MODE.kernel);
      }

      return commandResult();
    });

    const result = await createService({ shouldRunRemotely: async () => true })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      });
    const commands = executor.execute.mock.calls.map((call) => call[0] as string);

    expect(commands.length)
      .toBeGreaterThanOrEqual(16);
    expect(commands.some((command) => command.includes('git init -q')))
      .toBe(true);
    expect(commands.some((command) => command.includes('gitcode.com/cann/ops-test-kit.git')))
      .toBe(true);
    expect(commands.some((command) => command.includes('fetch --depth=1 origin')
      && command.includes(OPS_TEST_KIT_REVISION)))
      .toBe(true);
    expect(commands.some((command) => command.includes("'\\''pip'\\'' '\\''install'\\''")))
      .toBe(true);
    expect(commands.some((command) => command.includes("'\\''--upgrade'\\''")))
      .toBe(false);
    expect(commands.some((command) => command.includes('.lock/owner.json')))
      .toBe(true);
    expect(commands.some((command) => command.includes('.staging-run-id')))
      .toBe(true);
    expect(commands.some((command) => command.includes(`mv '\\''${path.posix.join(path.posix.dirname(managedRoot), '.staging-run-id')}'\\'' '\\''${managedRoot}'\\''`)))
      .toBe(true);
    expect(commands.some((command) => command.includes('{ [ ! -e')
      && command.includes(`'\\''${managedRoot}'\\'' ] || mv`)
      && command.includes(`mv '\\''${path.posix.join(path.posix.dirname(managedRoot), '.staging-run-id')}'\\'' '\\''${managedRoot}'\\''`)))
      .toBe(true);
    expect(commands.some((command) => command.includes(managedRoot)))
      .toBe(true);
    expect(commands.filter((command) => /git init|fetch --depth|checkout --detach|rev-parse HEAD|'\\''pip'\\''/.test(command))
      .every((command) => command.includes(`test ! -L '\\''${path.posix.join(path.posix.dirname(managedRoot), '.staging-run-id')}'\\''`)
        && command.includes(`test ! -L '\\''${path.posix.join(path.posix.dirname(managedRoot), '.staging-run-id', 'ops-test-kit')}'\\''`)
        && command.includes(`test ! -L '\\''${path.posix.join(path.posix.dirname(managedRoot), '.staging-run-id', 'dependencies')}'\\''`)))
      .toBe(true);
    expect(executor.execute.mock.calls.slice(0, -1)
      .every((call) => {
        const options = call[3] as { timeout?: number };

        return typeof options.timeout === 'number' && options.timeout > 0;
      }))
      .toBe(true);
    expect(ensureTtkAvailable).not.toHaveBeenCalled();
    expect(result.runtimeSource)
      .toBe('remote');
    expect(outputLines.join('\n'))
      .toContain(`Remote managed TTK is absent; preparing it at ${managedRoot}.`);
    expect(outputLines.join('\n'))
      .toContain(`Remote managed TTK prepared successfully: ${managedRoot}`);
  });

  it('stops before ST when remote TTK provisioning fails', async () => {
    writeInput('ttk_kernel_remote_install_failure.csv');

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, '__MSTT_REMOTE_HOME__=/home/remote-user\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n');
      }

      if (command.includes('import os, ttk') || command.includes('__MSTT_REMOTE_TTK_ROOT__')) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, `${REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      if (command.includes('fetch --depth=1 origin')) {
        return commandResult(7, '', 'network unavailable\n');
      }

      return commandResult();
    });

    await expect(createService({ shouldRunRemotely: async () => true })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects.toThrow(/downloading the pinned ops-test-kit revision.*exit code 7/);

    const commands = executor.execute.mock.calls.map((call) => call[0] as string);

    expect(commands.some((command) => command.includes("'\\''ttk'\\'' '\\''kernel'\\''")))
      .toBe(false);
    expect(commands.some((command) => command.includes("'\\''pip'\\'' '\\''install'\\''")))
      .toBe(false);
    expect(outputLines.join('\n'))
      .toContain('Remote TTK 11/17 exit code: 7');
    expect(outputLines.join('\n'))
      .toContain('Produced before failure: none');
  });

  it('releases the remote managed TTK lock and staging directory after cancellation once the lock is acquired', async () => {
    writeInput('ttk_kernel_remote_install_cancel.csv');
    let cancelled = false;

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, '__MSTT_REMOTE_HOME__=/home/remote-user\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n');
      }

      if (command.includes('import os, ttk') || command.includes('__MSTT_REMOTE_TTK_ROOT__')) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        cancelled = true;

        return commandResult(0, `${REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      return commandResult();
    });

    try {
      await createService({ shouldRunRemotely: async () => true })
        .startStTest({
          workspaceRoot,
          operatorName: 'add custom',
          operatorPath,
          modes: ['kernel'],
        }, { isCancellationRequested: () => cancelled });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }

    const commands = executor.execute.mock.calls.map((call) => call[0] as string);

    expect(commands.some((command) => command.includes('rm -rf') && command.includes('.staging-run-id')))
      .toBe(true);
    expect(commands.some((command) => command.includes('grep -Fq')
      && command.includes('.lock/owner.json')))
      .toBe(true);
  });

  it('polls remote managed TTK lock attempts on the client instead of waiting in a remote loop', async () => {
    writeInput('ttk_kernel_remote_lock_wait.csv');
    const sleep = jest.fn(async () => undefined);
    let now = 0;
    let lockAttempts = 0;

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, '__MSTT_REMOTE_HOME__=/home/remote-user\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n');
      }

      if (command.includes('import os, ttk') || command.includes('__MSTT_REMOTE_TTK_ROOT__')) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        lockAttempts += 1;

        return commandResult(0, `${lockAttempts < 3 ? REMOTE_TTK_LOCK_HELD_SENTINEL : REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      if (command.includes('fetch --depth=1 origin')) {
        return commandResult(7, '', 'stop after lock acquisition\n');
      }

      return commandResult();
    });

    await expect(createService({
      now: () => {
        now += 500;

        return now;
      },
      shouldRunRemotely: async () => true,
      sleep,
    })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects.toThrow(/downloading the pinned ops-test-kit revision/);

    const lockCommands = executor.execute.mock.calls
      .map((call) => call[0] as string)
      .filter((command) => command.includes('.lock/owner.json') && !command.includes('grep -Fq'));

    expect(lockCommands)
      .toHaveLength(3);
    expect(lockCommands.every((command) => !command.includes('while true') && !command.includes('sleep 1')))
      .toBe(true);
    expect(sleep)
      .toHaveBeenCalledTimes(2);
  });

  it('cancels promptly while waiting for the remote managed TTK lock', async () => {
    writeInput('ttk_kernel_remote_lock_cancel.csv');
    const sleep = jest.fn(async () => undefined);

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, '__MSTT_REMOTE_HOME__=/home/remote-user\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n');
      }

      if (command.includes('import os, ttk') || command.includes('__MSTT_REMOTE_TTK_ROOT__')) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, `${REMOTE_TTK_LOCK_HELD_SENTINEL}\n`);
      }

      return commandResult();
    });

    try {
      await createService({
        now: () => 0,
        shouldRunRemotely: async () => true,
        sleep,
      })
        .startStTest({
          workspaceRoot,
          operatorName: 'add custom',
          operatorPath,
          modes: ['kernel'],
        }, { isCancellationRequested: () => sleep.mock.calls.length > 0 });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }

    const lockCommands = executor.execute.mock.calls
      .map((call) => call[0] as string)
      .filter((command) => command.includes('.lock/owner.json') && !command.includes('grep -Fq'));

    expect(lockCommands)
      .toHaveLength(1);
    expect(sleep)
      .toHaveBeenCalledTimes(1);
  });

  it('recovers a stale remote managed TTK lock before retrying acquisition', async () => {
    writeInput('ttk_kernel_remote_lock_stale.csv');
    let lockAttempts = 0;

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, '__MSTT_REMOTE_HOME__=/home/remote-user\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n');
      }

      if (command.includes('import os, ttk') || command.includes('__MSTT_REMOTE_TTK_ROOT__')) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        lockAttempts += 1;

        return commandResult(0, `${lockAttempts === 1 ? REMOTE_TTK_LOCK_STALE_RECOVERED_SENTINEL : REMOTE_TTK_LOCK_ACQUIRED_SENTINEL}\n`);
      }

      if (command.includes('fetch --depth=1 origin')) {
        return commandResult(7, '', 'stop after stale lock recovery\n');
      }

      return commandResult();
    });

    await expect(createService({ shouldRunRemotely: async () => true })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects.toThrow(/downloading the pinned ops-test-kit revision/);

    expect(lockAttempts)
      .toBe(2);
    expect(outputLines.join('\n'))
      .toContain('Recovered a stale remote managed TTK cache lock');
  });

  it('reports a clear timeout while waiting for the remote managed TTK lock', async () => {
    writeInput('ttk_kernel_remote_lock_timeout.csv');

    executor.execute.mockImplementation(async (command: string) => {
      if (command.includes('__MSTT_REMOTE_ENV_READY__')) {
        return commandResult(0, '__MSTT_REMOTE_ENV_READY__\n');
      }

      if (command.includes('__MSTT_REMOTE_PYTHON_VERSION__')) {
        return commandResult(0, '__MSTT_REMOTE_HOME__=/home/remote-user\n__MSTT_REMOTE_PYTHON_VERSION__=3.11\n');
      }

      if (command.includes('import os, ttk') || command.includes('__MSTT_REMOTE_TTK_ROOT__')) {
        return commandResult(7);
      }

      if (command.includes('.lock/owner.json') && !command.includes('grep -Fq')) {
        return commandResult(0, `${REMOTE_TTK_LOCK_HELD_SENTINEL}\n`);
      }

      return commandResult();
    });

    await expect(createService({
      now: jest.fn()
        .mockReturnValueOnce(0)
        .mockReturnValue(20 * 60_000),
      shouldRunRemotely: async () => true,
    })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects.toThrow('Timed out waiting for remote managed TTK cache lock');
  });

  it('fails preflight for any selected mode with no CSV before provisioning or execution', async () => {
    writeInput('ttk_kernel_a.csv');

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: [
          'kernel',
          'e2e',
        ],
      }))
      .rejects.toThrow(/mode\(s\) e2e/);
    expect(ensureTtkAvailable).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('stops the remaining sequence after a command failure and reports completed paths', async () => {
    [
      'ttk_kernel_a.csv',
      'ttk_kernel_b.csv',
      'ttk_kernel_c.csv',
    ].forEach((name) => writeInput(name));
    const inputs = discoverStTestInputCsvFiles(operatorPath).kernel;
    const firstOutput = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add',
      mode: 'kernel',
      inputCsvPath: inputs[0],
      runId: 'run-id',
      sequence: 1,
    });
    let index = 0;

    executor.execute.mockImplementation(async () => {
      if (index === 0) {
        fs.writeFileSync(firstOutput, 'result');
      }

      index += 1;

      return commandResult(index === 2 ? 7 : 0);
    });

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects.toThrow(`Completed results: ${firstOutput}`);
    expect(executor.execute)
      .toHaveBeenCalledTimes(2);
  });

  it('does not launch the next CSV after cancellation between commands', async () => {
    writeInput('ttk_kernel_a.csv');
    writeInput('ttk_kernel_b.csv');
    const firstInput = discoverStTestInputCsvFiles(operatorPath).kernel[0];
    const firstOutput = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add',
      mode: 'kernel',
      inputCsvPath: firstInput,
      runId: 'run-id',
      sequence: 1,
    });
    let cancellationChecks = 0;

    executor.execute.mockImplementation(async () => {
      fs.writeFileSync(firstOutput, 'result');

      return commandResult();
    });

    try {
      await createService()
        .startStTest({
          workspaceRoot,
          operatorName: 'add',
          operatorPath,
          modes: ['kernel'],
        }, {
          isCancellationRequested: () => {
            cancellationChecks += 1;

            return cancellationChecks >= 4;
          },
        });
      throw new Error('Expected cancellation');
    }
    catch (error) {
      expect(isStTestCancelledError(error))
        .toBe(true);
    }

    expect(executor.execute)
      .toHaveBeenCalledTimes(1);
    expect(outputLines.join('\n'))
      .toContain(`Process completed; result file: ${firstOutput}`);
    expect(outputLines.join('\n'))
      .toContain(`Produced before cancellation: ${firstOutput}`);
  });

  it('treats a missing result file after exit zero as an infrastructure error', async () => {
    writeInput('e2e-suite.csv', 'e2e');
    executor.execute.mockResolvedValue(commandResult());

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add',
        operatorPath,
        modes: ['e2e'],
      }))
      .rejects.toThrow(/exited successfully but did not create/);
  });

  it('reports a timed-out case instead of a bare non-zero exit code', async () => {
    writeInput('e2e-suite.csv', 'e2e');
    executor.execute.mockResolvedValue({
      ...commandResult(null as unknown as number),
      timedOut: true,
    });

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add',
        operatorPath,
        modes: ['e2e'],
      }))
      .rejects.toThrow(/timed out for e2e-suite\.csv/);
  });

  it('rejects a pre-existing result path before executing TTK', async () => {
    const inputCsvPath = writeInput('ttk_kernel_a.csv');
    const outputCsvPath = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });

    fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
    fs.writeFileSync(outputCsvPath, 'pre-existing result');

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects.toThrow(/Refusing to overwrite pre-existing ST result path/);
    expect(executor.execute).not.toHaveBeenCalled();
    expect(fs.readFileSync(outputCsvPath, 'utf8'))
      .toBe('pre-existing result');
  });

  it.each([
    'directory',
    'symbolic link',
  ] as const)('rejects a successful command that creates a non-regular %s result', async (kind) => {
    const inputCsvPath = writeInput('ttk_kernel_a.csv');
    const outputCsvPath = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });

    executor.execute.mockImplementation(async () => {
      if (kind === 'directory') {
        fs.mkdirSync(outputCsvPath);
      }
      else {
        const targetDirectory = path.join(workspaceRoot, 'symlink-target');

        fs.mkdirSync(targetDirectory);
        fs.symlinkSync(
          targetDirectory,
          outputCsvPath,
          process.platform === 'win32' ? 'junction' : 'dir',
        );
      }

      return commandResult();
    });

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects.toThrow(/did not create a new regular result file/);
    expect(executor.execute)
      .toHaveBeenCalledTimes(1);
    expect(fs.lstatSync(outputCsvPath)
      .isFile())
      .toBe(false);

    if (kind === 'symbolic link') {
      expect(fs.lstatSync(outputCsvPath)
        .isSymbolicLink())
        .toBe(true);
    }
  });

  it('accepts an in-workspace operator directory named with a leading two dots', async () => {
    const dotOperatorPath = path.join(workspaceRoot, '..custom');
    const inputCsvPath = path.join(dotOperatorPath, 'tests', 'st', 'arch35', 'ttk_kernel_a.csv');
    const expectedOutput = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: '..custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });
    const expectedRunDirectory = resolveStTestRunDirectory({
      workspaceRoot,
      operatorName: '..custom',
      runId: 'run-id',
    });

    fs.mkdirSync(path.join(dotOperatorPath, 'tests', 'assets'), { recursive: true });
    fs.mkdirSync(path.dirname(inputCsvPath), { recursive: true });
    fs.writeFileSync(inputCsvPath, CSV_BY_MODE.kernel);
    executor.execute.mockImplementation(async () => {
      fs.writeFileSync(expectedOutput, 'result');

      return commandResult();
    });

    const result = await createService()
      .startStTest({
        workspaceRoot,
        operatorName: '..custom',
        operatorPath: dotOperatorPath,
        modes: ['kernel'],
      });

    expect(result)
      .toMatchObject({
        outputPaths: [expectedOutput],
        runDirectory: expectedRunDirectory,
        runtimeSource: 'system',
      });
  });

  it('keeps completed artifacts accessible when report construction unexpectedly fails', async () => {
    const inputCsvPath = writeInput('ttk_kernel_a.csv');
    const outputCsvPath = resolveStTestOutputCsvPath({
      workspaceRoot,
      operatorName: 'add custom',
      mode: 'kernel',
      inputCsvPath,
      runId: 'run-id',
      sequence: 1,
    });

    executor.execute.mockImplementation(async () => {
      fs.writeFileSync(outputCsvPath, `${CSV_BY_MODE.kernel}`);

      return commandResult();
    });

    const result = await createService({
      buildResultReport: jest.fn(() => {
        throw new Error('unexpected parser failure');
      }),
    })
      .startStTest({
        workspaceRoot,
        operatorName: 'add custom',
        operatorPath,
        modes: ['kernel'],
      });

    expect(result.outputPaths)
      .toEqual([outputCsvPath]);
    expect(result.artifacts)
      .toHaveLength(1);
    expect(result.report)
      .toMatchObject({
        outcome: 'invalid',
        summary: {
          files: 1,
          invalidFiles: 1,
        },
        files: [
          {
            artifactId: 'run-id:1',
            error: { code: 'file_unreadable' },
          },
        ],
      });
    expect(JSON.stringify(result.report)).not.toContain(workspaceRoot);
    expect(result.report.files[0].error)
      .not.toHaveProperty('detail');
    expect(outputLines.join('\n'))
      .toContain('Could not interpret precision results: unexpected parser failure');
  });

  it('rejects non-standard-custom contexts before provisioning', async () => {
    writeInput('ttk_kernel_a.csv');
    detectProjectType.mockResolvedValue(OperatorProjectType.ASCEND_C);

    await expect(createService()
      .startStTest({
        workspaceRoot,
        operatorName: 'add',
        operatorPath,
        modes: ['kernel'],
      }))
      .rejects.toThrow(/only for standard-custom/);
    expect(ensureTtkAvailable).not.toHaveBeenCalled();
  });
});
