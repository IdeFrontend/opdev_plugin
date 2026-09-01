import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

import type {
  CommandExecutor,
  CommandResult,
} from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { getIdeServerDirName } from '@plugin/helpers/ide-config-dir';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  buildSourcedPythonCommand,
  buildStTestCommand,
  normalizeStTestModes,
} from '@plugin/domain/services/st-test-command';
import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';
import {
  buildStTestResultReport,
  type BuildStTestResultReportParams,
  type CompletedStTestArtifact,
} from '@plugin/domain/services/st-test-result-parser';
import { StTestCancelledError } from '@plugin/domain/services/st-test-errors';
import { resolveOperatorCommandTimeoutMs } from '@plugin/service/operator-command-executor';
import {
  createStTestRunHistoryRecord,
  persistStTestRunHistoryRecord,
} from '@plugin/domain/services/st-test-run-history';
import {
  createStTestRunId,
  discoverStTestInputCsvFiles,
  ensureStTestOutputDirectory,
  resolveStTestOutputCsvPath,
  resolveStTestPluginDir,
  resolveStTestResultsRootDirectory,
  resolveStTestRunDirectory,
  ST_TEST_ARCH_DIR,
  toDisplayPath,
  validateStTestOperatorDirectory,
} from '@plugin/domain/utils/st-test-paths';
import {
  buildRemoteExecCommand,
  buildRemoteStTestCommand,
  ensureRemoteToolAvailable,
  RemoteToolUnavailableError,
} from '@plugin/helpers/remote-command';
import { startNpuHardwareProbe } from '@plugin/domain/utils/npu-hardware-probe';
import { getEnvironmentScriptPathFromWorkspace } from '@plugin/helpers/operator-project-workspace-config';
import {
  appendLog,
  getOperatorToolOutputChannel,
} from '@plugin/helpers/output-channel';
import {
  getTtkInstallerService,
  OPS_TEST_KIT_REPOSITORY,
  OPS_TEST_KIT_REVISION,
  type EnsureTtkOptions,
  type TtkRuntime,
} from '@plugin/service/ttk-installer.service';
import type {
  StTestMode,
  StTestResultReportDto,
} from '@shared/st-test-results';
import {
  cloneDefaultStTestArguments,
  validateStTestArgumentTokens,
} from '@shared/st-test-options';
import { EXTENSION_ID } from '@shared/flavor';

const ST_TEST_LOG_SCOPE = 'op-devtools/st-test';
const REMOTE_ENV_READY_SENTINEL = '__MSTT_REMOTE_ENV_READY__';
const REMOTE_HOME_SENTINEL = '__MSTT_REMOTE_HOME__=';
const REMOTE_PYTHON_VERSION_SENTINEL = '__MSTT_REMOTE_PYTHON_VERSION__=';
const REMOTE_TTK_ROOT_SENTINEL = '__MSTT_REMOTE_TTK_ROOT__=';
const REMOTE_TTK_PROBE_STAGES = 17;
const REMOTE_TTK_PROBE_TIMEOUT_MS = 60_000;
const REMOTE_TTK_DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const REMOTE_TTK_INSTALL_TIMEOUT_MS = 10 * 60_000;
const REMOTE_TTK_LOCK_WAIT_TIMEOUT_MS = 20 * 60_000;
const REMOTE_TTK_LOCK_STALE_MS = 30 * 60_000;
const REMOTE_TTK_LOCK_POLL_MS = 1_000;
const REMOTE_TTK_LOCK_ACQUIRED_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_ACQUIRED__';
const REMOTE_TTK_LOCK_HELD_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_HELD__';
const REMOTE_TTK_LOCK_STALE_RECOVERED_SENTINEL = '__MSTT_REMOTE_TTK_LOCK_STALE_RECOVERED__';

export type StartStTestParams = {
  workspaceRoot: string;
  operatorName: string;
  operatorPath: string;
  modes: readonly string[];
  argumentsByMode?: Partial<Record<StTestMode, readonly string[]>>;
};

export type StTestExecutionResult = {
  outputPaths: string[];
  artifacts: CompletedStTestArtifact[];
  report: StTestResultReportDto;
  runDirectory: string;
  runtimeSource: StTestRuntime['source'];
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
  now: ()=> number;
  sleep: (durationMs: number)=> Promise<void>;
  buildResultReport: (params: BuildStTestResultReportParams)=> StTestResultReportDto;
  shouldRunRemotely: ()=> Promise<boolean>;
};

type StTestRuntime = {
  source: TtkRuntime['source'] | 'remote';
  interpreter: string;
  pythonPathEntries: string[];
  workingDirectory: string;
  remoteWorkingDirectory?: string;
};

type RemotePythonRuntime = {
  home: string;
  majorMinor: string;
};

export function resolveRemoteStTestPullDir(workspaceRoot: string): string {
  return `${resolveStTestResultsRootDirectory(path.resolve(workspaceRoot))
    .replace(/\\/g, '/')}/`;
}

export function resolveRemoteManagedTtkRootBase(remoteHome: string): string {
  return path.posix.join(
    remoteHome,
    getIdeServerDirName(),
    'data',
    'User',
    'globalStorage',
    EXTENSION_ID,
    'ttk',
    OPS_TEST_KIT_REVISION,
  );
}

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
      getOutputChannel: dependencies.getOutputChannel ?? (() => getOperatorToolOutputChannel('st test')),
      createRunId: dependencies.createRunId ?? createStTestRunId,
      now: dependencies.now ?? Date.now,
      sleep: dependencies.sleep ?? ((durationMs) => new Promise((resolve) => {
        setTimeout(resolve, durationMs);
      })),
      buildResultReport: dependencies.buildResultReport ?? buildStTestResultReport,
      shouldRunRemotely: dependencies.shouldRunRemotely ?? StTestService.shouldRunRemotely,
    };
  }

  private static async shouldRunRemotely(): Promise<boolean> {
    try {
      if (await startNpuHardwareProbe()) {
        return false;
      }
    }
    catch {
      // A failed local probe is treated as no local NPU, consistent with other remote fallbacks.
    }

    if (!await ensureRemoteToolAvailable()) {
      throw new RemoteToolUnavailableError();
    }

    return true;
  }

  async startStTest(
    params: StartStTestParams,
    options: StTestExecutionOptions = {},
  ): Promise<StTestExecutionResult> {
    const modes = normalizeStTestModes(params.modes);

    if (modes.length === 0) {
      throw new Error('Select at least one ST test mode');
    }

    const argumentsByMode = this.validateArgumentsByMode(params.argumentsByMode, modes);

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
    const completedArtifacts: CompletedStTestArtifact[] = [];

    outputChannel.show(true);
    outputChannel.appendLine(`[ST test] Operator: ${params.operatorName}`);
    outputChannel.appendLine(`[ST test] Modes: ${modes.join(', ')}`);
    outputChannel.appendLine(`[ST test] Inputs: ${plan.length}; architecture: ${ST_TEST_ARCH_DIR}`);
    outputChannel.appendLine(`[ST test] Run directory: ${runDirectory}`);
    executor.on('stdout', appendRawOutput);
    executor.on('stderr', appendRawOutput);

    try {
      this.throwIfCancelled(options.isCancellationRequested);
      outputChannel.appendLine('[ST test] Checking local NPU hardware...');

      const runRemotely = await this.dependencies.shouldRunRemotely();

      if (!runRemotely) {
        outputChannel.appendLine('[ST test] Checking system or managed TTK...');
      }

      const runtime = await this.resolveRuntime({
        executor,
        environmentScriptPath,
        isCancellationRequested: options.isCancellationRequested,
        outputChannel,
        runRemotely,
        workspaceRoot: params.workspaceRoot,
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
          argumentTokens: argumentsByMode[item.mode],
        });

        const executableCommand = runRemotely
          ? buildRemoteStTestCommand(
            this.buildRemoteTtkExecutionCommand(command, runtime.remoteWorkingDirectory),
            resolveRemoteStTestPullDir(params.workspaceRoot),
          )
          : command;

        outputChannel.appendLine(`[ST test] Command: ${executableCommand}`);
        const result = await executor.execute(
          executableCommand,
          [],
          [],
          {
            cwd: runtime.workingDirectory,
            timeout: resolveOperatorCommandTimeoutMs(),
          },
          false,
        );

        if (result.interruptedByUserStop || options.isCancellationRequested?.()) {
          throw new StTestCancelledError();
        }

        if (result.timedOut) {
          throw new Error(`TTK ${item.mode} timed out for ${path.basename(item.inputCsvPath)} `
            + 'and was terminated. Raise op-devtools.execution.commandTimeoutSeconds if the case '
            + 'legitimately runs that long.');
        }

        if (result.code !== 0) {
          const completedPaths = completedArtifacts.map((artifact) => artifact.outputCsvPath);
          const message = `TTK ${item.mode} failed for ${path.basename(item.inputCsvPath)} `
            + `with exit code ${String(result.code)}. Expected result: ${item.outputCsvPath}. `
            + `Completed results: ${completedPaths.join(', ') || 'none'}`;

          throw new Error(message);
        }

        const outputStat = this.tryLstat(item.outputCsvPath);

        if (!outputStat?.isFile()) {
          const completedPaths = completedArtifacts.map((artifact) => artifact.outputCsvPath);
          const message = `TTK ${item.mode} exited successfully but did not create a new regular result file at ${item.outputCsvPath}. `
            + `Completed results: ${completedPaths.join(', ') || 'none'}`;

          throw new Error(message);
        }

        completedArtifacts.push({
          artifactId: `${runId}:${String(item.sequence)}`,
          sequence: item.sequence,
          mode: item.mode,
          inputCsvPath: item.inputCsvPath,
          outputCsvPath: item.outputCsvPath,
        });
        outputChannel.appendLine(`[ST test] Process completed; result file: ${item.outputCsvPath}`);
      }

      const reportParams: BuildStTestResultReportParams = {
        workspaceRoot: params.workspaceRoot,
        operatorPath: params.operatorPath,
        operatorName: params.operatorName,
        runId,
        runDirectory,
        artifacts: completedArtifacts,
      };
      let report: StTestResultReportDto;

      try {
        report = this.dependencies.buildResultReport(reportParams);
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        outputChannel.appendLine(`[ST test] Could not interpret precision results: ${message}`);
        appendLog(ST_TEST_LOG_SCOPE, 'ST result report construction failed', {
          operatorName: params.operatorName,
          resultCount: completedArtifacts.length,
          error: message,
        });
        report = this.createInvalidReportFallback(reportParams);
      }

      outputChannel.appendLine('');
      outputChannel.appendLine(`[ST test] All requested TTK processes completed. Precision report: ${report.outcome}.`);
      completedArtifacts.forEach((artifact) => outputChannel.appendLine(`[ST test] Produced: ${artifact.outputCsvPath}`));

      appendLog(ST_TEST_LOG_SCOPE, 'ST test processes completed', {
        operatorName: params.operatorName,
        modes,
        resultCount: completedArtifacts.length,
        reportOutcome: report.outcome,
        runtimeSource: runtime.source,
      });

      try {
        persistStTestRunHistoryRecord(createStTestRunHistoryRecord(
          report,
          completedArtifacts,
          runDirectory,
        ));
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        outputChannel.appendLine(`[ST test] Could not persist run history: ${message}`);
        appendLog(ST_TEST_LOG_SCOPE, 'ST run history persistence failed', {
          operatorName: params.operatorName,
          runId,
          error: message,
        });
      }

      return {
        outputPaths: completedArtifacts.map((artifact) => artifact.outputCsvPath),
        artifacts: completedArtifacts,
        report,
        runDirectory,
        runtimeSource: runtime.source,
      };
    }
    catch (error) {
      const completedSummary = completedArtifacts.map((artifact) => artifact.outputCsvPath)
        .join(', ') || 'none';

      if (error instanceof StTestCancelledError || error instanceof RemoteToolUnavailableError) {
        outputChannel.appendLine(`[ST test] Cancelled. Produced before cancellation: ${completedSummary}`);

        if (error instanceof RemoteToolUnavailableError) {
          throw new StTestCancelledError();
        }
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

  private validateArgumentsByMode(
    configured: StartStTestParams['argumentsByMode'],
    modes: readonly StTestMode[],
  ): Record<StTestMode, string[]> {
    const result = {
      kernel: cloneDefaultStTestArguments('kernel'),
      aclnn: cloneDefaultStTestArguments('aclnn'),
      e2e: cloneDefaultStTestArguments('e2e'),
    };

    for (const mode of modes) {
      const validation = validateStTestArgumentTokens(configured?.[mode] ?? result[mode]);

      if (!validation.valid) {
        throw new Error(`Invalid ST test ${mode} argument token (${validation.code})`);
      }

      result[mode] = validation.tokens;
    }

    return result;
  }

  private async resolveRuntime(params: {
    executor: CommandExecutor;
    environmentScriptPath: string;
    isCancellationRequested?: ()=> boolean;
    outputChannel: vscode.OutputChannel;
    runRemotely: boolean;
    workspaceRoot: string;
  }): Promise<StTestRuntime> {
    if (params.runRemotely) {
      return this.resolveRemoteRuntime(params);
    }

    return this.dependencies.ensureTtkAvailable({
      environmentScriptPath: params.environmentScriptPath,
      isCancellationRequested: params.isCancellationRequested,
    });
  }

  private async resolveRemoteRuntime(params: {
    executor: CommandExecutor;
    environmentScriptPath: string;
    isCancellationRequested?: ()=> boolean;
    outputChannel: vscode.OutputChannel;
    workspaceRoot: string;
  }): Promise<StTestRuntime> {
    const environmentProbe = [
      `test -r ${shellQuoteBash(params.environmentScriptPath)}`,
      `printf '%s\\n' ${shellQuoteBash(REMOTE_ENV_READY_SENTINEL)}`,
    ].join(' && ');
    const environmentResult = await this.executeRemoteTtkProbe({
      ...params,
      command: environmentProbe,
      stage: 1,
      description: 'checking the remote environment script',
    });

    if (environmentResult.code !== 0 || !environmentResult.stdout.includes(REMOTE_ENV_READY_SENTINEL)) {
      throw new Error(`Remote environment script is unavailable: ${params.environmentScriptPath}`);
    }

    const pythonResult = await this.executeRemoteTtkProbe({
      ...params,
      command: buildSourcedPythonCommand({
        interpreter: 'python3',
        environmentScriptPath: params.environmentScriptPath,
        args: [
          '-c',
          `import os, sys; print("${REMOTE_HOME_SENTINEL}" + os.path.expanduser("~")); print("${REMOTE_PYTHON_VERSION_SENTINEL}%d.%d" % sys.version_info[:2])`,
        ],
      }),
      stage: 2,
      description: 'detecting the remote Python runtime',
    });
    const pythonRuntime = this.parseRemotePythonRuntime(pythonResult);

    params.outputChannel.appendLine(`[ST test] Remote Python: ${pythonRuntime.majorMinor}; home: ${pythonRuntime.home}`);

    const systemRootResult = await this.executeRemoteTtkProbe({
      ...params,
      command: buildSourcedPythonCommand({
        interpreter: 'python3',
        environmentScriptPath: params.environmentScriptPath,
        args: [
          '-c',
          `import os, ttk; print("${REMOTE_TTK_ROOT_SENTINEL}" + os.path.dirname(os.path.dirname(os.path.abspath(ttk.__file__))))`,
        ],
      }),
      stage: 3,
      description: 'locating system TTK in the remote Python environment',
    });
    const systemRoot = systemRootResult.code === 0
      ? this.parseRemoteAbsolutePath(systemRootResult.stdout, REMOTE_TTK_ROOT_SENTINEL)
      : undefined;

    if (systemRoot) {
      params.outputChannel.appendLine(`[ST test] Remote system TTK root: ${systemRoot}`);

      const validationResult = await this.validateRemoteTtkRuntime({
        ...params,
        description: 'validating the remote system TTK runtime',
        pythonPathEntries: [],
        stage: 4,
        workingDirectory: systemRoot,
      });

      if (this.isRemoteTtkValidationSuccessful(validationResult)) {
        params.outputChannel.appendLine('[ST test] Remote system TTK is ready; managed TTK preparation skipped.');

        return {
          source: 'remote',
          interpreter: 'python3',
          pythonPathEntries: [],
          workingDirectory: params.workspaceRoot,
          remoteWorkingDirectory: systemRoot,
        };
      }

      params.outputChannel.appendLine('[ST test] Remote system TTK validation failed; checking the managed cache.');
    }
    else {
      params.outputChannel.appendLine(`[ST test] Remote TTK 4/${REMOTE_TTK_PROBE_STAGES}: system TTK validation skipped`);
      params.outputChannel.appendLine('[ST test] Remote system TTK was not found; checking the managed cache.');
    }

    const managedRoot = path.posix.join(
      resolveRemoteManagedTtkRootBase(pythonRuntime.home),
      `python-${pythonRuntime.majorMinor}`,
    );
    const managedBase = path.posix.dirname(managedRoot);
    const managedSource = path.posix.join(managedRoot, 'ops-test-kit');
    const managedDependencies = path.posix.join(managedRoot, 'dependencies');
    const managedProbe = this.buildRemoteManagedTtkProbe(managedRoot, managedSource, managedDependencies);
    const managedResult = await this.executeRemoteTtkProbe({
      ...params,
      command: managedProbe,
      stage: 5,
      description: 'locating the remote managed TTK cache',
    });
    const discoveredManagedRoot = managedResult.code === 0
      ? this.parseRemoteAbsolutePath(managedResult.stdout, REMOTE_TTK_ROOT_SENTINEL)
      : undefined;

    if (discoveredManagedRoot) {
      params.outputChannel.appendLine(`[ST test] Remote managed TTK root: ${discoveredManagedRoot}`);

      const validationResult = await this.validateRemoteTtkRuntime({
        ...params,
        description: 'validating the existing remote managed TTK runtime',
        pythonPathEntries: [
          managedSource,
          managedDependencies,
        ],
        stage: 6,
        workingDirectory: managedSource,
      });

      if (this.isRemoteTtkValidationSuccessful(validationResult)) {
        params.outputChannel.appendLine('[ST test] Existing remote managed TTK is ready.');

        return this.createRemoteManagedRuntime(params.workspaceRoot, managedSource, managedDependencies);
      }

      params.outputChannel.appendLine('[ST test] Existing remote managed TTK is unusable; preparing a replacement cache.');
    }
    else {
      params.outputChannel.appendLine(`[ST test] Remote TTK 6/${REMOTE_TTK_PROBE_STAGES}: existing managed TTK validation skipped`);
      params.outputChannel.appendLine(`[ST test] Remote managed TTK is absent; preparing it at ${managedRoot}.`);
    }

    const provisionedRuntime = await this.provisionRemoteManagedTtk({
      ...params,
      managedBase,
      managedDependencies,
      managedRoot,
      managedSource,
    });

    return provisionedRuntime;
  }

  private async provisionRemoteManagedTtk(params: {
    executor: CommandExecutor;
    environmentScriptPath: string;
    isCancellationRequested?: ()=> boolean;
    managedBase: string;
    managedDependencies: string;
    managedRoot: string;
    managedSource: string;
    outputChannel: vscode.OutputChannel;
    workspaceRoot: string;
  }): Promise<StTestRuntime> {
    const lock = await this.acquireRemoteManagedTtkLock(params);
    const stagingRoot = path.posix.join(params.managedBase, `.staging-${this.dependencies.createRunId()}`);
    const stagingSource = path.posix.join(stagingRoot, 'ops-test-kit');
    const stagingDependencies = path.posix.join(stagingRoot, 'dependencies');
    const backupRoot = `${params.managedRoot}.backup-${this.dependencies.createRunId()}`;
    const finalManagedPaths = [
      params.managedRoot,
      params.managedSource,
      params.managedDependencies,
    ];
    const stagingManagedPaths = [
      stagingRoot,
      stagingSource,
      stagingDependencies,
    ];

    try {
      const managedAfterLock = await this.executeRemoteTtkProbe({
        ...params,
        command: this.buildRemoteManagedTtkProbe(params.managedRoot, params.managedSource, params.managedDependencies),
        description: 'rechecking the remote managed TTK cache after acquiring the lock',
        stage: 8,
      });
      const discoveredManagedRoot = managedAfterLock.code === 0
        ? this.parseRemoteAbsolutePath(managedAfterLock.stdout, REMOTE_TTK_ROOT_SENTINEL)
        : undefined;

      if (discoveredManagedRoot) {
        const validationResult = await this.validateRemoteTtkRuntime({
          ...params,
          description: 'validating the remote managed TTK runtime after acquiring the lock',
          pythonPathEntries: [
            params.managedSource,
            params.managedDependencies,
          ],
          stage: 9,
          workingDirectory: params.managedSource,
        });

        if (this.isRemoteTtkValidationSuccessful(validationResult)) {
          params.outputChannel.appendLine('[ST test] Remote managed TTK became ready while waiting for the cache lock.');

          return this.createRemoteManagedRuntime(params.workspaceRoot, params.managedSource, params.managedDependencies);
        }
      }
      else {
        params.outputChannel.appendLine(`[ST test] Remote TTK 9/${REMOTE_TTK_PROBE_STAGES}: managed cache validation after lock skipped`);
      }

      await this.executeRequiredRemoteTtkStep({
        ...params,
        command: this.guardRemoteManagedPaths(
          `rm -rf ${shellQuoteBash(stagingRoot)} && mkdir -p ${shellQuoteBash(stagingSource)} ${shellQuoteBash(stagingDependencies)}`,
          stagingManagedPaths,
        ),
        description: 'creating the remote managed TTK staging directories',
        stage: 10,
      });
      const cloneCommand = [
        `git init -q ${shellQuoteBash(stagingSource)}`,
        `git -C ${shellQuoteBash(stagingSource)} remote add origin ${shellQuoteBash(OPS_TEST_KIT_REPOSITORY)}`,
        `git -C ${shellQuoteBash(stagingSource)} fetch --depth=1 origin ${shellQuoteBash(OPS_TEST_KIT_REVISION)}`,
        `git -C ${shellQuoteBash(stagingSource)} checkout --detach -q FETCH_HEAD`,
      ].join(' && ');

      await this.executeRequiredRemoteTtkStep({
        ...params,
        command: this.guardRemoteManagedPaths(cloneCommand, stagingManagedPaths),
        description: 'downloading the pinned ops-test-kit revision on the NPU environment',
        stage: 11,
        timeout: REMOTE_TTK_DOWNLOAD_TIMEOUT_MS,
      });
      const revisionResult = await this.executeRequiredRemoteTtkStep({
        ...params,
        command: this.guardRemoteManagedPaths(
          `git -C ${shellQuoteBash(stagingSource)} rev-parse HEAD`,
          stagingManagedPaths,
        ),
        description: 'verifying the remote ops-test-kit revision',
        stage: 12,
      });
      const revisionLines = revisionResult.stdout.split(/\r?\n/)
        .filter((line) => /^[0-9a-f]{40}$/i.test(line));
      const revision = revisionLines.length === 1
        ? revisionLines[0]
        : undefined;

      if (revision !== OPS_TEST_KIT_REVISION) {
        throw new Error(`Remote ops-test-kit revision does not match ${OPS_TEST_KIT_REVISION}`);
      }

      const installCommand = buildSourcedPythonCommand({
        interpreter: 'python3',
        environmentScriptPath: params.environmentScriptPath,
        args: [
          '-m',
          'pip',
          'install',
          '--disable-pip-version-check',
          '--no-input',
          '--target',
          stagingDependencies,
          '--requirement',
          path.posix.join(stagingSource, 'requirements.txt'),
        ],
      });

      await this.executeRequiredRemoteTtkStep({
        ...params,
        command: this.guardRemoteManagedPaths(installCommand, stagingManagedPaths),
        description: 'installing ops-test-kit dependencies in the NPU environment',
        stage: 13,
        timeout: REMOTE_TTK_INSTALL_TIMEOUT_MS,
      });
      const stagingValidationResult = await this.validateRemoteTtkRuntime({
        ...params,
        description: 'validating the staged remote managed TTK runtime',
        pythonPathEntries: [
          stagingSource,
          stagingDependencies,
        ],
        stage: 14,
        workingDirectory: stagingSource,
      });

      this.throwIfRemoteTtkValidationFailed(stagingValidationResult, 'Staged remote managed TTK validation failed');

      await this.executeRequiredRemoteTtkStep({
        ...params,
        command: this.guardRemoteManagedPaths(
          [
            `rm -rf ${shellQuoteBash(backupRoot)}`,
            `{ [ ! -e ${shellQuoteBash(params.managedRoot)} ] || mv ${shellQuoteBash(params.managedRoot)} ${shellQuoteBash(backupRoot)}; }`,
            `mv ${shellQuoteBash(stagingRoot)} ${shellQuoteBash(params.managedRoot)}`,
          ].join(' && '),
          [
            ...finalManagedPaths,
            stagingRoot,
            backupRoot,
          ],
        ),
        description: 'publishing the remote managed TTK cache',
        stage: 15,
      });
      const finalValidationResult = await this.validateRemoteTtkRuntime({
        ...params,
        description: 'validating the published remote managed TTK runtime',
        pythonPathEntries: [
          params.managedSource,
          params.managedDependencies,
        ],
        stage: 16,
        workingDirectory: params.managedSource,
      });

      if (!this.isRemoteTtkValidationSuccessful(finalValidationResult)) {
        await this.restoreRemoteManagedTtkBackup({
          ...params,
          isCancellationRequested: undefined,
          backupRoot,
        });
        this.throwIfRemoteTtkValidationFailed(finalValidationResult, 'Published remote managed TTK validation failed');
      }

      await this.cleanupRemoteManagedPath({
        ...params,
        isCancellationRequested: undefined,
        description: 'cleaning up the previous remote managed TTK cache',
        pathToRemove: backupRoot,
        stage: 17,
      });
      params.outputChannel.appendLine(`[ST test] Remote managed TTK prepared successfully: ${params.managedRoot}`);

      return this.createRemoteManagedRuntime(params.workspaceRoot, params.managedSource, params.managedDependencies);
    }
    catch (error) {
      await this.cleanupRemoteManagedPath({
        ...params,
        isCancellationRequested: undefined,
        description: 'cleaning up the failed remote managed TTK staging directory',
        pathToRemove: stagingRoot,
        stage: 17,
      })
        .catch(() => undefined);
      throw error;
    }
    finally {
      await this.releaseRemoteManagedTtkLock({
        ...params,
        isCancellationRequested: undefined,
        lockPath: lock.lockPath,
        token: lock.token,
      })
        .catch(() => undefined);
    }
  }

  private buildRemoteManagedTtkProbe(
    managedRoot: string,
    managedSource: string,
    managedDependencies: string,
  ): string {
    return [
      `test -d ${shellQuoteBash(path.posix.join(managedSource, 'ttk'))}`,
      `test -d ${shellQuoteBash(managedDependencies)}`,
      `printf '%s\\n' ${shellQuoteBash(`${REMOTE_TTK_ROOT_SENTINEL}${managedRoot}`)}`,
    ].join(' && ');
  }

  private async acquireRemoteManagedTtkLock(params: {
    executor: CommandExecutor;
    isCancellationRequested?: ()=> boolean;
    managedRoot: string;
    outputChannel: vscode.OutputChannel;
    workspaceRoot: string;
  }): Promise<{
    lockPath: string;
    token: string;
  }> {
    const lockPath = `${params.managedRoot}.lock`;
    const ownerPath = path.posix.join(lockPath, 'owner.json');
    const token = this.dependencies.createRunId();
    const waitStartedAt = this.dependencies.now();

    while (true) {
      this.throwIfCancelled(params.isCancellationRequested);

      const result = await this.executeRemoteTtkProbe({
        ...params,
        isCancellationRequested: undefined,
        command: this.buildRemoteManagedTtkLockAttemptCommand(params.managedRoot, lockPath, ownerPath, token),
        description: 'acquiring the remote managed TTK cache lock',
        stage: 7,
      });

      if (result.code !== 0) {
        throw new Error(`Remote TTK step failed while acquiring the remote managed TTK cache lock; exit code ${String(result.code)}`);
      }

      if (result.stdout.includes(REMOTE_TTK_LOCK_ACQUIRED_SENTINEL)) {
        return {
          lockPath,
          token,
        };
      }

      if (result.stdout.includes(REMOTE_TTK_LOCK_STALE_RECOVERED_SENTINEL)) {
        params.outputChannel.appendLine(`[ST test] Recovered a stale remote managed TTK cache lock: ${lockPath}`);
        continue;
      }

      if (!result.stdout.includes(REMOTE_TTK_LOCK_HELD_SENTINEL)) {
        throw new Error('Remote managed TTK cache lock attempt returned an unknown result');
      }

      this.throwIfCancelled(params.isCancellationRequested);

      const elapsed = this.dependencies.now() - waitStartedAt;

      if (elapsed >= REMOTE_TTK_LOCK_WAIT_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for remote managed TTK cache lock: ${lockPath}`);
      }

      await this.dependencies.sleep(Math.min(
        REMOTE_TTK_LOCK_POLL_MS,
        REMOTE_TTK_LOCK_WAIT_TIMEOUT_MS - elapsed,
      ));
      this.throwIfCancelled(params.isCancellationRequested);
    }
  }

  private buildRemoteManagedTtkLockAttemptCommand(
    managedRoot: string,
    lockPath: string,
    ownerPath: string,
    token: string,
  ): string {
    const lockCommand = [
      `mkdir -p ${shellQuoteBash(path.posix.dirname(lockPath))};`,
      `token=${shellQuoteBash(token)};`,
      'now=$(date +%s);',
      `if mkdir ${shellQuoteBash(lockPath)} 2>/dev/null; then`,
      `if printf '{"token":"%s","createdAt":%s}\\n' "$token" "$now" > ${shellQuoteBash(ownerPath)}; then`,
      `printf '%s\\n' ${shellQuoteBash(REMOTE_TTK_LOCK_ACQUIRED_SENTINEL)};`,
      'exit 0;',
      'fi;',
      `rm -rf ${shellQuoteBash(lockPath)};`,
      'exit 1;',
      'fi;',
      `lock_mtime=$(stat -c %Y ${shellQuoteBash(lockPath)} 2>/dev/null || printf '%s' "$now");`,
      `if [ $((now - lock_mtime)) -ge ${String(Math.floor(REMOTE_TTK_LOCK_STALE_MS / 1000))} ]; then`,
      `rm -rf ${shellQuoteBash(lockPath)};`,
      `printf '%s\\n' ${shellQuoteBash(REMOTE_TTK_LOCK_STALE_RECOVERED_SENTINEL)};`,
      'exit 0;',
      'fi;',
      `printf '%s\\n' ${shellQuoteBash(REMOTE_TTK_LOCK_HELD_SENTINEL)}`,
    ].join(' ');

    return this.guardRemoteManagedPaths(lockCommand, [
      managedRoot,
      lockPath,
    ]);
  }

  private async releaseRemoteManagedTtkLock(params: {
    executor: CommandExecutor;
    isCancellationRequested?: ()=> boolean;
    lockPath: string;
    outputChannel: vscode.OutputChannel;
    token: string;
    workspaceRoot: string;
  }): Promise<void> {
    const ownerPath = path.posix.join(params.lockPath, 'owner.json');
    const releaseCommand = [
      `if [ -d ${shellQuoteBash(params.lockPath)} ]`,
      `&& [ -f ${shellQuoteBash(ownerPath)} ]`,
      `&& grep -Fq ${shellQuoteBash(params.token)} ${shellQuoteBash(ownerPath)}; then`,
      `rm -rf ${shellQuoteBash(params.lockPath)};`,
      'fi',
    ].join(' ');

    await this.executeRemoteTtkProbe({
      ...params,
      command: releaseCommand,
      description: 'releasing the remote managed TTK cache lock',
      stage: REMOTE_TTK_PROBE_STAGES,
    });
  }

  private async cleanupRemoteManagedPath(params: {
    executor: CommandExecutor;
    description: string;
    isCancellationRequested?: ()=> boolean;
    outputChannel: vscode.OutputChannel;
    pathToRemove: string;
    stage: number;
    workspaceRoot: string;
  }): Promise<void> {
    await this.executeRemoteTtkProbe({
      ...params,
      command: this.guardRemoteManagedPaths(
        `rm -rf ${shellQuoteBash(params.pathToRemove)}`,
        [params.pathToRemove],
      ),
      description: params.description,
      stage: params.stage,
    });
  }

  private async restoreRemoteManagedTtkBackup(params: {
    backupRoot: string;
    executor: CommandExecutor;
    isCancellationRequested?: ()=> boolean;
    managedRoot: string;
    outputChannel: vscode.OutputChannel;
    workspaceRoot: string;
  }): Promise<void> {
    await this.executeRemoteTtkProbe({
      ...params,
      command: this.guardRemoteManagedPaths(
        [
          `rm -rf ${shellQuoteBash(params.managedRoot)}`,
          `[ ! -e ${shellQuoteBash(params.backupRoot)} ] || mv ${shellQuoteBash(params.backupRoot)} ${shellQuoteBash(params.managedRoot)}`,
        ].join(' && '),
        [
          params.managedRoot,
          params.backupRoot,
        ],
      ),
      description: 'restoring the previous remote managed TTK cache',
      stage: REMOTE_TTK_PROBE_STAGES,
    });
  }

  private throwIfRemoteTtkValidationFailed(result: CommandResult, message: string): void {
    if (this.isRemoteTtkValidationSuccessful(result)) {
      return;
    }

    const signatureFound = /(?:^|\n)\s*TTK\s+v[^\r\n]*/i
      .test(`${result.stdout}\n${result.stderr}`);

    throw new Error(`${message} with exit code ${String(result.code)}; TTK version signature found: ${String(signatureFound)}`);
  }

  private async executeRequiredRemoteTtkStep(params: {
    executor: CommandExecutor;
    command: string;
    description: string;
    isCancellationRequested?: ()=> boolean;
    outputChannel: vscode.OutputChannel;
    stage: number;
    timeout?: number;
    workspaceRoot: string;
  }): Promise<CommandResult> {
    const result = await this.executeRemoteTtkProbe(params);

    if (result.code !== 0) {
      throw new Error(`Remote TTK step failed while ${params.description}; exit code ${String(result.code)}`);
    }

    return result;
  }

  private createRemoteManagedRuntime(
    workspaceRoot: string,
    managedSource: string,
    managedDependencies: string,
  ): StTestRuntime {
    return {
      source: 'remote',
      interpreter: 'python3',
      pythonPathEntries: [
        managedSource,
        managedDependencies,
      ],
      workingDirectory: workspaceRoot,
      remoteWorkingDirectory: managedSource,
    };
  }

  private validateRemoteTtkRuntime(params: {
    executor: CommandExecutor;
    description: string;
    environmentScriptPath: string;
    isCancellationRequested?: ()=> boolean;
    outputChannel: vscode.OutputChannel;
    pythonPathEntries: readonly string[];
    stage: number;
    workingDirectory: string;
    workspaceRoot: string;
  }): Promise<CommandResult> {
    return this.executeRemoteTtkProbe({
      ...params,
      command: this.buildRemoteTtkExecutionCommand(
        buildSourcedPythonCommand({
          interpreter: 'python3',
          environmentScriptPath: params.environmentScriptPath,
          pythonPathEntries: params.pythonPathEntries,
          args: [
            '-m',
            'ttk',
            '-v',
          ],
        }),
        params.workingDirectory,
      ),
      stage: params.stage,
      description: params.description,
    });
  }

  private buildRemoteTtkExecutionCommand(
    command: string,
    workingDirectory: string | undefined,
  ): string {
    if (!workingDirectory || !path.posix.isAbsolute(workingDirectory)) {
      throw new Error('Remote TTK working directory is unavailable');
    }

    const quotedWorkingDirectory = shellQuoteBash(workingDirectory);

    return [
      `test -d ${quotedWorkingDirectory}`,
      `test ! -L ${quotedWorkingDirectory}`,
      `test -w ${quotedWorkingDirectory}`,
      `test -x ${quotedWorkingDirectory}`,
      `cd ${quotedWorkingDirectory}`,
      'printf \'[ST test] Remote TTK working directory: %s\\n\' "$PWD"',
      command,
    ].join(' && ');
  }

  private guardRemoteManagedPaths(
    command: string,
    managedPaths: readonly string[],
  ): string {
    return [
      ...managedPaths.map((managedPath) => `test ! -L ${shellQuoteBash(managedPath)}`),
      `{ ${command}; }`,
    ].join(' && ');
  }

  private async executeRemoteTtkProbe(params: {
    executor: CommandExecutor;
    command: string;
    description: string;
    isCancellationRequested?: ()=> boolean;
    outputChannel: vscode.OutputChannel;
    stage: number;
    timeout?: number;
    workspaceRoot: string;
  }): Promise<CommandResult> {
    this.throwIfCancelled(params.isCancellationRequested);
    const remoteCommand = buildRemoteExecCommand(params.command);

    params.outputChannel.appendLine(`[ST test] Remote TTK ${String(params.stage)}/${REMOTE_TTK_PROBE_STAGES}: ${params.description}...`);
    params.outputChannel.appendLine(`[ST test] Probe command: ${remoteCommand}`);
    const result = await params.executor.execute(
      remoteCommand,
      [],
      [],
      {
        cwd: params.workspaceRoot,
        timeout: params.timeout ?? REMOTE_TTK_PROBE_TIMEOUT_MS,
      },
      false,
    );

    if (result.interruptedByUserStop || params.isCancellationRequested?.()) {
      throw new StTestCancelledError();
    }

    // execute() reports a timeout in the result instead of rejecting, and every caller here
    // reads a non-zero exit as "this TTK is not usable". A probe that only hung would then
    // send the run into a full remote clone plus pip install, so stop it at the source --
    // this guard covers the probes, the validations and the provisioning steps alike.
    if (result.timedOut) {
      const timeout = params.timeout ?? REMOTE_TTK_PROBE_TIMEOUT_MS;

      throw new Error(`Remote TTK step timed out after ${String(timeout)}ms while ${params.description}`);
    }

    params.outputChannel.appendLine(`[ST test] Remote TTK ${String(params.stage)}/${REMOTE_TTK_PROBE_STAGES} exit code: ${String(result.code)}`);

    return result;
  }

  private parseRemotePythonRuntime(result: CommandResult): RemotePythonRuntime {
    if (result.code !== 0) {
      throw new Error(`Remote Python probe failed with exit code ${String(result.code)}`);
    }

    const home = this.parseRemoteAbsolutePath(result.stdout, REMOTE_HOME_SENTINEL);
    const versionLines = result.stdout.split(/\r?\n/)
      .filter((line) => line.startsWith(REMOTE_PYTHON_VERSION_SENTINEL));

    if (!home || versionLines.length !== 1) {
      throw new Error('Remote Python probe returned an invalid response');
    }

    const majorMinor = versionLines[0].slice(REMOTE_PYTHON_VERSION_SENTINEL.length);

    if (!/^\d+\.\d+$/.test(majorMinor)) {
      throw new Error('Remote Python probe returned an invalid version');
    }

    return {
      home,
      majorMinor,
    };
  }

  private parseRemoteAbsolutePath(output: string, sentinel: string): string | undefined {
    const pathLines = output.split(/\r?\n/)
      .filter((line) => line.startsWith(sentinel));

    if (pathLines.length !== 1) {
      return undefined;
    }

    const remotePath = pathLines[0].slice(sentinel.length);

    return path.posix.isAbsolute(remotePath) ? remotePath : undefined;
  }

  private isRemoteTtkValidationSuccessful(result: CommandResult): boolean {
    return result.code === 0
      && /(?:^|\n)\s*TTK\s+v[^\r\n]*/i.test(`${result.stdout}\n${result.stderr}`);
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

  private createInvalidReportFallback(params: BuildStTestResultReportParams): StTestResultReportDto {
    return {
      runId: params.runId,
      operatorName: params.operatorName,
      runDirectory: toDisplayPath(params.workspaceRoot, params.runDirectory),
      outcome: 'invalid',
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        invalid: 0,
        files: params.artifacts.length,
        invalidFiles: params.artifacts.length,
      },
      files: params.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        sequence: artifact.sequence,
        mode: artifact.mode,
        testFile: toDisplayPath(params.operatorPath, artifact.inputCsvPath),
        resultFile: toDisplayPath(params.workspaceRoot, artifact.outputCsvPath),
        rowCount: 0,
        error: { code: 'file_unreadable' },
      })),
      rows: [],
    };
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
