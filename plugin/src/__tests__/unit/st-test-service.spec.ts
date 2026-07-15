import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';

import type { CommandExecutor } from '@plugin/class/command-options';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { isStTestCancelledError } from '@plugin/domain/services/st-test-errors';
import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';
import {
  discoverStTestInputCsvFiles,
  resolveStTestOutputCsvPath,
  resolveStTestRunDirectory,
} from '@plugin/domain/utils/st-test-paths';
import { StTestService } from '@plugin/service/st-test-service';
import type { TtkRuntime } from '@plugin/service/ttk-installer.service';

const CSV_BY_MODE = {
  kernel: 'testcase_name,op_name\ncase,add\n',
  aclnn: 'testcase_name,api_name\ncase,aclnnAdd\n',
  e2e: 'testcase_name,api_name\ncase,torch.add\n',
} as const;

function commandResult(code: number = 0) {
  return {
    code,
    stdout: '',
    stderr: '',
    output: '',
    interruptedByUserStop: false,
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
      .toEqual({
        outputPaths: expectedOutputs,
        runDirectory: expectedRunDirectory,
        runtimeSource: 'system',
      });
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
        .toEqual({ cwd: systemTtkRoot });
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
      .toContain('Precision results were not interpreted');
    expect(executor.listenerCount('stdout'))
      .toBe(0);
    expect(executor.listenerCount('stderr'))
      .toBe(0);
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
      .toEqual({ cwd: managedRoot });
    expect(command)
      .toContain(shellQuoteBash(inputCsvPath));
    expect(command)
      .toContain(shellQuoteBash(expectedOutput));
    expect(command)
      .toContain(shellQuoteBash(path.join(operatorPath, 'tests', 'assets')));
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
      .toEqual({
        outputPaths: [expectedOutput],
        runDirectory: expectedRunDirectory,
        runtimeSource: 'system',
      });
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
