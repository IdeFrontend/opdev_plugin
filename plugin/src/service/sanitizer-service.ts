import { t } from 'i18next';
import * as vscode from 'vscode';
import * as fs from 'fs';

import { ProjectManager } from '@plugin/core/project/project-manager';
import {
  buildOperatorSpawnContext,
  executeOperatorCommand,
} from '@plugin/service/operator-command-executor';
import {
  getSanitizerCommand, getBuildExampleCommand, getBuildOpCommand,
} from '@plugin/domain';
import { configService } from './config-service';
import {
  buildService, notifyBuildSucceededForSidebar,
} from './build-service';
import {
  OperatorProjectType, OperatorProjectDetector,
} from '@plugin/domain/services/operator-project-detector';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { getLatestSanitizerLogAbsPath } from '@plugin/helpers/sanitizer-log-path';
import { evaluateSanitizerRunOutcome } from '@plugin/helpers/sanitizer-run-outcome';
import { cleanupCwdSanitizerLog } from '@plugin/helpers/cleanup-sanitizer-cwd-log';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { syncSanitizerPythonTargetFromActiveEditor } from '@plugin/helpers/sync-sanitizer-python-target';
import { probeTritonPythonDependencies } from '@plugin/domain/services/command-strategy/triton-strategy';
import { getProjectById } from '@plugin/domain';
import { msAgentBridgeService } from '@plugin/service/ms-agent-bridge.service';
import { sanitizerDiagnosticsService } from '@plugin/service/sanitizer-diagnostics.service';
import { COMMAND_FLASH_MS_SANITIZER_RUN_DATA } from '@plugin/constants';

const CONFIG_TYPES = { SANITIZER: 'sanitizer' } as const;

export class SanitizerService {
  /**
   * Get anomaly detection (sanitizer) config ID
   */
  async getSanitizerConfigIdInternal(): Promise<number | undefined> {
    try {
      const configData = await configService.getSanitizerConfigsList();

      return configData.find((v) => v.config_type === CONFIG_TYPES.SANITIZER)
        ?.config_id;
    }
    catch {
      return undefined;
    }
  }

  /**
   * Capture the active `.py` into the sanitizer config before the options webview opens.
   * The panel opens in ViewColumn.Active and displaces the editor, so once it is shown
   * `runSanitizer` can no longer read the active file. Returns false (after warning) when an
   * active-file project has no `.py` focused, so the caller can skip opening the panel.
   */
  async captureActiveFileTargetForOptionsPanel(): Promise<boolean> {
    const sanitizerConfigId = await this.getSanitizerConfigIdInternal();

    if (sanitizerConfigId == null) {
      // No sanitizer config yet — let the panel open; runSanitizer reports config errors.
      return true;
    }

    const projectIdStr = ProjectManager.getInstance().projectId;
    const project = projectIdStr ? getProjectById(Number(projectIdStr)) : null;
    const behavior = OperatorPluginRegistry.getOpPlugin(project?.project_type).buildBehavior;

    if (!behavior.requiresActiveFileCheck) {
      return true;
    }

    return syncSanitizerPythonTargetFromActiveEditor(
      Number(sanitizerConfigId),
      behavior.activeFileExtension || '.py',
    );
  }

  /**
   * Run anomaly detection (sanitizer)
   */
  async runSanitizer(params: { operatorNames?: string } = {}): Promise<void> {
    try {
      const sanitizerConfigId: number | undefined =
        await this.getSanitizerConfigIdInternal();

      if (sanitizerConfigId == null) {
        vscode.window.showErrorMessage(t('sanitizer.detectionFailedError', { error: 'No sanitizer config' }));

        return;
      }

      const projectIdStr = ProjectManager.getInstance().projectId;
      const project = projectIdStr ? getProjectById(Number(projectIdStr)) : null;
      const opPlugin = OperatorPluginRegistry.getOpPlugin(project?.project_type);
      const behavior = opPlugin.buildBehavior;

      if (behavior.requiresActiveFileCheck) {
        const synced = await syncSanitizerPythonTargetFromActiveEditor(
          Number(sanitizerConfigId),
          behavior.activeFileExtension || '.py',
        );

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
        const buildCommand = getBuildOpCommand(
          Number(sanitizerConfigId),
          '',
          params.operatorNames,
        );
        const buildRes = await executeOperatorCommand(
          buildCommand,
          buildOperatorSpawnContext({
            configId: Number(sanitizerConfigId),
            operatorNames: params.operatorNames,
            script: buildCommand,
          }),
          { outputLabel: 'compile' },
        );

        if (buildRes.code !== 0) {
          vscode.window.showErrorMessage(t('sanitizer.compileFailed', { output: buildRes.output }));

          return;
        }

        if (workspaceFolders && workspaceFolders.length > 0) {
          const workspacePath = workspaceFolders[0].uri.fsPath;

          try {
            const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
            const isRootStandardCustom = rootDetection.isOperatorProject
              && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

            if (isRootStandardCustom) {
              const exConfigId = await buildService.getBuildExampleConfigId();
              const exampleBuildCommand = getBuildExampleCommand(
                Number(exConfigId),
                '',
                params.operatorNames,
              );
              const exampleBuildRes = await executeOperatorCommand(
                exampleBuildCommand,
                buildOperatorSpawnContext({
                  configId: Number(exConfigId),
                  operatorNames: params.operatorNames,
                  script: exampleBuildCommand,
                }),
                { outputLabel: 'compile' },
              );

              if (exampleBuildRes.code !== 0) {
                vscode.window.showErrorMessage(t('sanitizer.exampleCompileFailed', { output: exampleBuildRes.output }));

                return;
              }
            }
          }
          catch (error) {
            console.warn('[runSanitizer] Failed to detect project type:', error);
          }
        }

        await notifyBuildSucceededForSidebar(Number(sanitizerConfigId), params.operatorNames);
      }

      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const logPath = joinIdeConfigPath(workspacePath, 'mindstudio_sanitizer_log');

        if (!fs.existsSync(logPath)) {
          // recursive so a fresh workspace without the IDE config dir does not throw ENOENT.
          fs.mkdirSync(logPath, {
            recursive: true,
            mode: 0o750,
          });
        }
      }

      const exampleConfigId: number | undefined | string =
        await buildService.getBuildExampleConfigId();

      const sanitizerCommand =
        getSanitizerCommand(
          Number(sanitizerConfigId),
          Number(exampleConfigId),
          params.operatorNames,
        ) || '';
      const res = await executeOperatorCommand(
        sanitizerCommand,
        buildOperatorSpawnContext({
          configId: Number(sanitizerConfigId),
          operatorNames: params.operatorNames,
          script: sanitizerCommand,
        }),
      );

      // mssanitizer also writes its own ./mindstudio_sanitizer_log into its working directory
      // (the operator run path / workspace root); remove that copy so it does not clutter the
      // project. The .vscode/mindstudio_sanitizer_log report dir (read below) is a separate path.
      if (workspaceFolders && workspaceFolders.length > 0) {
        cleanupCwdSanitizerLog(workspaceFolders[0].uri.fsPath);
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

        vscode.window.showErrorMessage(t('sanitizer.detectionFailed', { output: outcome.reason ?? res.output }));

        return;
      }

      vscode.window.showInformationMessage(t('sanitizer.detectionSuccess'));

      if (wfAfter && logAbs && fs.existsSync(logAbs)) {
        sanitizerDiagnosticsService.publishFromLogFile(logAbs, wfAfter.uri.fsPath);
        void msAgentBridgeService.tryLoadLogWithIntegration(logAbs);
      }

      // After detection, refresh sanitizer data without opening the legacy sanitizer webview.
      await vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(t('sanitizer.detectionFailedError', { error: (e as Error).message }));
    }
  }
}

export const sanitizerService = new SanitizerService();
