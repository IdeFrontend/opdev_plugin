import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
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
import { getLatestSanitizerLogAbsPath } from '@plugin/helpers/sanitizer-log-path';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
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
   * Run anomaly detection (sanitizer)
   */
  async runSanitizer(params: { operatorNames?: string } = {}): Promise<void> {
    try {
      // Build before running sanitizer
      const sanitizerConfigId: number | undefined =
        await this.getSanitizerConfigIdInternal();
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

      // For standard custom operators, build example first
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;

        try {
          const rootDetection = await OperatorProjectDetector.detectOperatorProject(workspacePath);
          const isRootStandardCustom = rootDetection.isOperatorProject && rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM;

          if (isRootStandardCustom) {
            const exConfigId = await buildService.getBuildExampleConfigId();
            const exampleCompileOption = '';
            const exampleBuildCommand = getBuildExampleCommand(
              Number(exConfigId),
              exampleCompileOption,
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

            console.log('example buildRes', exampleBuildRes);

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

      if (sanitizerConfigId != null) {
        await notifyBuildSucceededForSidebar(Number(sanitizerConfigId), params.operatorNames);
      }

      // Create log directory
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const logPath = joinIdeConfigPath(workspacePath, 'mindstudio_sanitizer_log');

        if (!fs.existsSync(logPath)) {
          fs.mkdirSync(logPath, { mode: 0o750 });
        }
      }

      // Run anomaly detection
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

      if (res.code !== 0) {
        vscode.window.showErrorMessage(t('sanitizer.detectionFailed', { output: res.output }));

        return;
      }

      vscode.window.showInformationMessage(t('sanitizer.detectionSuccess'));

      const wfAfter = vscode.workspace.workspaceFolders?.[0];

      if (wfAfter) {
        const logAbs = getLatestSanitizerLogAbsPath(wfAfter.uri.fsPath);

        if (logAbs && fs.existsSync(logAbs)) {
          sanitizerDiagnosticsService.publishFromLogFile(logAbs, wfAfter.uri.fsPath);
          void msAgentBridgeService.tryLoadLogWithIntegration(logAbs);
        }
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
