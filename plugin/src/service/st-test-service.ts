import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

import type { CommandExecutor } from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  buildStTestCommand,
  normalizeStTestModes,
  type StTestMode,
} from '@plugin/domain/services/st-test-command';
import { StTestCancelledError } from '@plugin/domain/services/st-test-errors';
import {
  createStTestRunId,
  discoverStTestInputCsvFiles,
  ensureStTestOutputDirectory,
  resolveStTestOutputCsvPath,
  resolveStTestPluginDir,
  resolveStTestRunDirectory,
  ST_TEST_ARCH_DIR,
  validateStTestOperatorDirectory,
} from '@plugin/domain/utils/st-test-paths';
import { getEnvironmentScriptPathFromWorkspace } from '@plugin/helpers/operator-project-workspace-config';
import {
  appendLog,
  getOperatorToolOutputChannel,
} from '@plugin/helpers/output-channel';
import {
  getTtkInstallerService,
  type EnsureTtkOptions,
  type TtkRuntime,
} from '@plugin/service/ttk-installer.service';

const ST_TEST_LOG_SCOPE = 'op-devtools/st-test';

export type StartStTestParams = {
  workspaceRoot: string;
  operatorName: string;
  operatorPath: string;
  modes: readonly string[];
};

export type StTestExecutionResult = {
  outputPaths: string[];
  runDirectory: string;
  runtimeSource: TtkRuntime['source'];
};

export type StTestExecutionOptions = {
  isCancellationRequested?: ()=> boolean;
};

type PlannedStTest = {
  mode: StTestMode;
  inputCsvPath: string;
  outputCsvPath: string;
  sequence: number;
};

type StTestServiceDependencies = {
  getExecutor: ()=> CommandExecutor;
  ensureTtkAvailable: (options: EnsureTtkOptions)=> Promise<TtkRuntime>;
  detectProjectType: (workspaceRoot: string)=> Promise<OperatorProjectType | undefined>;
  getEnvironmentScriptPath: ()=> string;
  getOutputChannel: ()=> vscode.OutputChannel;
  createRunId: ()=> string;
};

export class StTestService {
  private readonly dependencies: StTestServiceDependencies;

  constructor(
    context: vscode.ExtensionContext,
    dependencies: Partial<StTestServiceDependencies> = {},
  ) {
    this.dependencies = {
      getExecutor: dependencies.getExecutor ?? (() => ProjectManager.getInstance()
        .getExecutor()),
      ensureTtkAvailable: dependencies.ensureTtkAvailable ?? ((options) => getTtkInstallerService(context)
        .ensureAvailable(options)),
      detectProjectType: dependencies.detectProjectType ?? (async (workspaceRoot) => {
        const match = await OperatorPluginRegistry.detectProject(workspaceRoot);

        return match?.projectType;
      }),
      getEnvironmentScriptPath: dependencies.getEnvironmentScriptPath
        ?? getEnvironmentScriptPathFromWorkspace,
      getOutputChannel: dependencies.getOutputChannel ?? (() => getOperatorToolOutputChannel('test')),
      createRunId: dependencies.createRunId ?? createStTestRunId,
    };
  }

  async startStTest(
    params: StartStTestParams,
    options: StTestExecutionOptions = {},
  ): Promise<StTestExecutionResult> {
    const modes = normalizeStTestModes(params.modes);

    if (modes.length === 0) {
      throw new Error('Select at least one ST test mode');
    }

    await this.validateStandardCustomOperator(params);

    const pluginPath = resolveStTestPluginDir(params.operatorPath);

    if (!pluginPath) {
      throw new Error(`No tests/assets or tests directory exists under ${params.operatorPath}`);
    }

    const runId = this.dependencies.createRunId();
    const plan = this.createPlan(params, modes, runId);
    const runDirectory = resolveStTestRunDirectory({
      workspaceRoot: params.workspaceRoot,
      operatorName: params.operatorName,
      runId,
    });
    const environmentScriptPath = this.dependencies.getEnvironmentScriptPath();
    const executor = this.dependencies.getExecutor();
    const outputChannel = this.dependencies.getOutputChannel();
    const appendRawOutput = (chunk: string): void => {
      outputChannel.append(chunk);
    };
    const completed: string[] = [];

    outputChannel.show(true);
    outputChannel.appendLine(`[ST test] Operator: ${params.operatorName}`);
    outputChannel.appendLine(`[ST test] Modes: ${modes.join(', ')}`);
    outputChannel.appendLine(`[ST test] Inputs: ${plan.length}; architecture: ${ST_TEST_ARCH_DIR}`);
    outputChannel.appendLine(`[ST test] Run directory: ${runDirectory}`);
    executor.on('stdout', appendRawOutput);
    executor.on('stderr', appendRawOutput);

    try {
      this.throwIfCancelled(options.isCancellationRequested);
      outputChannel.appendLine('[ST test] Checking system or managed TTK...');

      const runtime = await this.dependencies.ensureTtkAvailable({
        environmentScriptPath,
        isCancellationRequested: options.isCancellationRequested,
      });

      outputChannel.appendLine(`[ST test] TTK source: ${runtime.source}`);

      for (const item of plan) {
        this.throwIfCancelled(options.isCancellationRequested);
        ensureStTestOutputDirectory(item.outputCsvPath);

        if (this.pathEntryExists(item.outputCsvPath)) {
          throw new Error(`Refusing to overwrite pre-existing ST result path: ${item.outputCsvPath}`);
        }

        outputChannel.appendLine('');
        outputChannel.appendLine(`[ST test] ${item.sequence}/${plan.length} ${item.mode}: ${item.inputCsvPath}`);
        outputChannel.appendLine(`[ST test] Result: ${item.outputCsvPath}`);

        const command = buildStTestCommand({
          interpreter: runtime.interpreter,
          environmentScriptPath,
          pythonPathEntries: runtime.pythonPathEntries,
          mode: item.mode,
          inputCsvPath: item.inputCsvPath,
          outputCsvPath: item.outputCsvPath,
          pluginPath,
        });
        const result = await executor.execute(
          command,
          [],
          [],
          { cwd: runtime.workingDirectory },
          false,
        );

        if (result.interruptedByUserStop || options.isCancellationRequested?.()) {
          throw new StTestCancelledError();
        }

        if (result.code !== 0) {
          const message = `TTK ${item.mode} failed for ${path.basename(item.inputCsvPath)} `
            + `with exit code ${String(result.code)}. Expected result: ${item.outputCsvPath}. `
            + `Completed results: ${completed.join(', ') || 'none'}`;

          throw new Error(message);
        }

        const outputStat = this.tryLstat(item.outputCsvPath);

        if (!outputStat?.isFile()) {
          const message = `TTK ${item.mode} exited successfully but did not create a new regular result file at ${item.outputCsvPath}. `
            + `Completed results: ${completed.join(', ') || 'none'}`;

          throw new Error(message);
        }

        completed.push(item.outputCsvPath);
        outputChannel.appendLine(`[ST test] Process completed; result file: ${item.outputCsvPath}`);
      }

      outputChannel.appendLine('');
      outputChannel.appendLine('[ST test] All requested TTK processes completed. Precision results were not interpreted.');
      completed.forEach((outputPath) => outputChannel.appendLine(`[ST test] Produced: ${outputPath}`));

      appendLog(ST_TEST_LOG_SCOPE, 'ST test processes completed', {
        operatorName: params.operatorName,
        modes,
        resultCount: completed.length,
        runtimeSource: runtime.source,
      });

      return {
        outputPaths: completed,
        runDirectory,
        runtimeSource: runtime.source,
      };
    }
    catch (error) {
      const completedSummary = completed.join(', ') || 'none';

      if (error instanceof StTestCancelledError) {
        outputChannel.appendLine(`[ST test] Cancelled. Produced before cancellation: ${completedSummary}`);
      }
      else {
        const message = error instanceof Error ? error.message : String(error);

        outputChannel.appendLine(`[ST test] Failed: ${message}`);
        outputChannel.appendLine(`[ST test] Produced before failure: ${completedSummary}`);
      }

      throw error;
    }
    finally {
      executor.off('stdout', appendRawOutput);
      executor.off('stderr', appendRawOutput);
    }
  }

  private createPlan(
    params: StartStTestParams,
    modes: readonly StTestMode[],
    runId: string,
  ): PlannedStTest[] {
    const discoveredInputs = discoverStTestInputCsvFiles(params.operatorPath);
    const inputsByMode = modes.map((mode) => ({
      mode,
      inputs: discoveredInputs[mode],
    }));
    const missing = inputsByMode.filter((item) => item.inputs.length === 0)
      .map((item) => item.mode);

    if (missing.length > 0) {
      const message = `No ST CSV files found for mode(s) ${missing.join(', ')} under `
        + `${path.join(params.operatorPath, 'tests', 'st', ST_TEST_ARCH_DIR)}. `
        + 'Modes are determined from CSV contents.';

      throw new Error(message);
    }

    let sequence = 0;

    return inputsByMode.flatMap(({
      mode,
      inputs,
    }) => inputs.map((inputCsvPath) => {
      sequence += 1;

      return {
        mode,
        inputCsvPath,
        outputCsvPath: resolveStTestOutputCsvPath({
          workspaceRoot: params.workspaceRoot,
          operatorName: params.operatorName,
          mode,
          inputCsvPath,
          runId,
          sequence,
        }),
        sequence,
      };
    }));
  }

  private async validateStandardCustomOperator(params: StartStTestParams): Promise<void> {
    validateStTestOperatorDirectory(params.workspaceRoot, params.operatorPath);

    const projectType = await this.dependencies.detectProjectType(path.resolve(params.workspaceRoot));

    if (projectType !== OperatorProjectType.STANDARD_CUSTOM) {
      throw new Error('ST testing is available only for standard-custom operator projects');
    }
  }

  private throwIfCancelled(isCancellationRequested?: ()=> boolean): void {
    if (isCancellationRequested?.()) {
      throw new StTestCancelledError();
    }
  }

  private pathEntryExists(targetPath: string): boolean {
    return this.tryLstat(targetPath) !== undefined;
  }

  private tryLstat(targetPath: string): fs.Stats | undefined {
    try {
      return fs.lstatSync(targetPath);
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }

      throw error;
    }
  }
}
