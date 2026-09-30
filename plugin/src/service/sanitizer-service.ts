/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  buildOperatorSpawnContext,
  commandFailureMessage,
  executeOperatorCommand,
} from '@plugin/service/operator-command-executor';
import {
  getSanitizerCommand, getBuildExampleCommand, getBuildOpCommand, resolveSanitizerBaseContext, resolveBuildExampleBaseContext,
} from '@plugin/domain';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { ConfigService } from '@plugin/service/config-service';
import {
  buildRemoteBuildExampleCommand,
  buildRemoteExecCommand,
  createRemoteCommandWhenNoNpuTransformer,
  resolveRemotePullDir,
} from '@plugin/helpers/remote-command';
import { notifyBuildSucceededForSidebar } from './build-service';
import {
  OperatorProjectType, OperatorProjectDetector,
} from '@plugin/domain/services/operator-project-detector';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { getLatestSanitizerLogAbsPath } from '@plugin/helpers/sanitizer-log-path';
import { isNpuCheckReport } from '@plugin/helpers/sanitizer-log-reports';
import { evaluateSanitizerRunOutcome } from '@plugin/helpers/sanitizer-run-outcome';
import { cleanupCwdSanitizerLog } from '@plugin/helpers/cleanup-sanitizer-cwd-log';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { getSanitizerLogDirName } from '@plugin/domain/services/command-strategy/sanitizer-option-guards';
import { syncSanitizerPythonTargetFromActiveEditor } from '@plugin/helpers/sync-sanitizer-python-target';
import { probeTritonPythonDependencies } from '@plugin/domain/services/command-strategy/triton-strategy';
import { msAgentBridgeService } from '@plugin/service/ms-agent-bridge.service';
import { sanitizerDiagnosticsService } from '@plugin/service/sanitizer-diagnostics.service';
import { COMMAND_FLASH_MS_SANITIZER_RUN_DATA } from '@plugin/constants';

export class SanitizerService {
  /**
   * Capture the active `.py` into the sanitizer config before the options webview opens.
   * The panel opens in ViewColumn.Active and displaces the editor, so once it is shown
   * `runSanitizer` can no longer read the active file. Returns false (after warning) when an
   * active-file project has no `.py` focused, so the caller can skip opening the panel.
   */
  async captureActiveFileTargetForOptionsPanel(): Promise<boolean> {
    const projectPath = ProjectManager.getInstance().projectPath;
    const project = projectPath ? getProjectByPath(projectPath) : null;

    if (!project) {
      // No project yet — let the panel open; runSanitizer reports config errors.
      return true;
    }

    const behavior = OperatorPluginRegistry.getOpPlugin(project.project_type).buildBehavior;

    if (!behavior.requiresActiveFileCheck) {
      return true;
    }

    return syncSanitizerPythonTargetFromActiveEditor(behavior.activeFileExtension || '.py');
  }

  /**
   * Run anomaly detection (sanitizer)
   */
  async runSanitizer(params: { operatorNames?: string } = {}): Promise<void> {
    try {
      const projectPath = ProjectManager.getInstance().projectPath;
      const project = projectPath ? getProjectByPath(projectPath) : null;

      if (!projectPath || !project) {
        vscode.window.showErrorMessage(t('sanitizer.detectionFailedError', { error: 'No sanitizer config' }));

        return;
      }

      const opPlugin = OperatorPluginRegistry.getOpPlugin(project.project_type);
      const behavior = opPlugin.buildBehavior;

      if (behavior.requiresActiveFileCheck) {
        const synced = await syncSanitizerPythonTargetFromActiveEditor(behavior.activeFileExtension || '.py');

        if (!synced) {
          return;
        }
      }

      if (opPlugin.opType === 'triton') {
        const probe = await probeTritonPythonDependencies();

        if (!probe.ok) {
          vscode.window.showErrorMessage(t('sanitizer.tritonDepsFailed', {
            interpreter: probe.interpreter,
            detail: probe.stderr,
          }));

          return;
        }
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (behavior.requiresBuildBeforeAnalysis) {
        const sanitizerBaseContext = resolveSanitizerBaseContext(projectPath, params.operatorNames);
        // npu-check resolves call-stack frames from the line tables embedded in the
        // built artifacts, so its pre-build compile must carry -gline-tables-only to
        // report source locations. The mssanitizer build instruments the binary at
        // compile time instead and must NOT carry the flag.
        const compileOption = sanitizerBaseContext.config.toolType === 'npu-check'
          ? '-gline-tables-only'
          : '';
        const buildCommand = getBuildOpCommand(
          sanitizerBaseContext,
          compileOption,
          params.operatorNames,
        );
        const buildRes = await executeOperatorCommand(
          buildCommand,
          buildOperatorSpawnContext({
            baseContext: sanitizerBaseContext,
            projectPath,
            operatorNames: params.operatorNames,
            script: buildCommand,
            sanitizerRun: true,
          }),
          { outputLabel: 'sanitizer' },
        );

        if (buildRes.code !== 0) {
          if (buildRes.interruptedByUserStop) {
            return;
          }

          vscode.window.showErrorMessage(commandFailureMessage(buildRes, 'sanitizer.compileFailed', { output: buildRes.output }));

          return;
        }

        if (workspaceFolders && workspaceFolders.length > 0) {
          const workspacePath = workspaceFolders[0].uri.fsPath;

          try {
            const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
            const isRootStandardCustom = rootDetection.isOperatorProject
              && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

            if (isRootStandardCustom) {
              if (ConfigService.hasBuildExampleConfig()) {
                const exampleBaseContext = resolveBuildExampleBaseContext(projectPath, params.operatorNames);
                const exampleBuildCommand = getBuildExampleCommand(
                  exampleBaseContext,
                  '',
                  params.operatorNames,
                  undefined,
                  true,
                );
                const exampleBuildRes = await executeOperatorCommand(
                  exampleBuildCommand,
                  buildOperatorSpawnContext({
                    baseContext: exampleBaseContext,
                    projectPath,
                    operatorNames: params.operatorNames,
                    script: exampleBuildCommand,
                  }),
                  {
                    outputLabel: 'sanitizer',
                    transformCommand: createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteBuildExampleCommand(
                      command,
                      workspacePath,
                    )),
                  },
                );

                if (exampleBuildRes.code !== 0) {
                  if (exampleBuildRes.interruptedByUserStop) {
                    return;
                  }

                  vscode.window.showErrorMessage(commandFailureMessage(exampleBuildRes, 'sanitizer.exampleCompileFailed', { output: exampleBuildRes.output }));

                  return;
                }
              }
            }
          }
          catch (error) {
            console.warn('[runSanitizer] Failed to detect project type:', error);
          }
        }

        await notifyBuildSucceededForSidebar(projectPath, params.operatorNames);
      }

      const sanitizerBaseContext = resolveSanitizerBaseContext(projectPath, params.operatorNames);
      // npu-check reports go to `npu-check-log`, mssanitizer keeps
      // `mindstudio_sanitizer_log` — the report dir (mkdir + remote pull) follows the tool.
      const sanitizerCommandName = sanitizerBaseContext.config.toolType === 'npu-check' ? 'npu-check' : 'mssanitizer';
      const sanitizerLogDirName = getSanitizerLogDirName(sanitizerCommandName);

      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const logPath = joinIdeConfigPath(workspacePath, sanitizerLogDirName);

        if (!fs.existsSync(logPath)) {
          // recursive so a fresh workspace without the IDE config dir does not throw ENOENT.
          fs.mkdirSync(logPath, {
            recursive: true,
            mode: 0o750,
          });
        }
      }

      const sanitizerCommand =
        getSanitizerCommand(
          sanitizerBaseContext,
          resolveBuildExampleBaseContext(projectPath, params.operatorNames),
          params.operatorNames,
        ) || '';
      const remoteSanitizerCommandTransformer = createRemoteCommandWhenNoNpuTransformer((command) => buildRemoteExecCommand(command, this.getRemoteSanitizerLogPullDir(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, sanitizerLogDirName)));
      const res = await executeOperatorCommand(
        sanitizerCommand,
        buildOperatorSpawnContext({
          baseContext: sanitizerBaseContext,
          projectPath,
          operatorNames: params.operatorNames,
          script: sanitizerCommand,
          toolOutputLabel: 'sanitizer',
          sanitizerRun: true,
        }),
        { transformCommand: remoteSanitizerCommandTransformer },
      );

      if (res.interruptedByUserStop) {
        return;
      }

      // mssanitizer also writes its own ./mindstudio_sanitizer_log into its working directory
      // (the operator build dir / workspace root); remove those copies so they do not clutter
      // the project. The .vscode/mindstudio_sanitizer_log report dir (read below) is a separate path.
      if (workspaceFolders && workspaceFolders.length > 0) {
        cleanupCwdSanitizerLog(workspaceFolders[0].uri.fsPath);
      }

      // The root-keyed model resolves every selection to the ROOT record, so
      // a single cleanup covers all selected operators (the mssanitizer cwd is
      // <root>/build for the ascend forms).
      const opPaths = new Set<string>();

      for (const name of (params.operatorNames ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)) {
        const opPath = resolveOpRecord(projectPath, name)?.op_path;

        if (opPath) {
          opPaths.add(opPath);
        }
      }

      for (const opPath of opPaths) {
        cleanupCwdSanitizerLog(path.join(opPath, 'build'));
      }

      const wfAfter = vscode.workspace.workspaceFolders?.[0];
      const logAbs = wfAfter ? getLatestSanitizerLogAbsPath(wfAfter.uri.fsPath) : undefined;

      // mssanitizer.bin always exits 0 — even on a CLI/setup error or an abnormal target
      // exit — so the exit code alone cannot tell a real run from a failed one. It also
      // opens its --log-file with O_TRUNC before the run, so a failed run leaves an empty
      // log behind. Treat the run as successful only when it produced a non-empty report;
      // otherwise that empty log would surface as a false success toast + an empty results node.
      const outcome = evaluateSanitizerRunOutcome({
        code: res.code,
        output: res.output,
        logPath: logAbs,
      });

      if (!outcome.ok) {
        // Drop the 0-byte report mssanitizer left behind so it cannot become an empty node.
        if (logAbs && fs.existsSync(logAbs) && fs.statSync(logAbs).size === 0) {
          try {
            fs.rmSync(logAbs);
          }
          catch (cleanupError) {
            console.warn('[runSanitizer] failed to remove empty sanitizer log:', cleanupError);
          }
        }

        vscode.window.showErrorMessage(commandFailureMessage(res, 'sanitizer.detectionFailed', { output: outcome.reason ?? res.output }));

        return;
      }

      vscode.window.showInformationMessage(t('sanitizer.detectionSuccess'));

      if (wfAfter && logAbs && fs.existsSync(logAbs)) {
        sanitizerDiagnosticsService.publishFromLogFile(logAbs, wfAfter.uri.fsPath);

        // msAgent only understands mssanitizer logs; npu-check reports must not be fed into it.
        if (!isNpuCheckReport(logAbs)) {
          void msAgentBridgeService.tryLoadLogWithIntegration(logAbs);
        }
      }

      // After a successful detection, refresh sanitizer data and switch to the fresh report
      // without opening the sanitizer webview.
      await vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA, { openLatest: true });
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(t('sanitizer.detectionFailedError', { error: (e as Error).message }));
    }
  }

  /**
   * Absolute path of the IDE config sanitizer report directory under the workspace root
   * (`mindstudio_sanitizer_log` for mssanitizer, `npu-check-log` for npu-check), formatted
   * with forward slashes for `remote_tool.sh --pull-dir`. The selected tool writes its
   * report there (see the mkdir above), so after the remote run we pull this directory
   * back so the local analysis pipeline (`sanitizerDiagnosticsService.publishFromLogFile`)
   * can read it on the same absolute path.
   *
   * Mirrors `buildService.getRemotePullDir(rootPath, outputDir)` — uses `path.resolve` to
   * normalize the root and `joinIdeConfigPath` so `.arts` (CodeArts) is picked up automatically.
   */
  private getRemoteSanitizerLogPullDir(rootPath: string | undefined, logDirName: string): string {
    return resolveRemotePullDir(rootPath, logDirName, 'sanitizer log retrieval');
  }
}

export const sanitizerService = new SanitizerService();
