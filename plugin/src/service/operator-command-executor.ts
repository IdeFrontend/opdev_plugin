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

import { ProjectManager } from '@plugin/core/project/project-manager';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { resolveOpEntryForProject } from '@plugin/helpers/op-resolver';
import {
  applyAscendPlaceholdersToScript,
  buildOperatorSpawnEnvFromResolution,
  isSimulatorCompile,
  mergeTritonSanitizerSpawnEnv,
  persistDetectedSocVersion,
  type AscendEnvResolution,
  OperatorSpawnEnvContext,
  resolveAscendEnvForOperatorCommand,
} from '@plugin/domain/utils/ascend-util';
import {
  applyNpuArchToTerminalEnv,
  getTerminalEnvCollection,
} from '@plugin/helpers/terminal-npu-arch-env';
import type { OperatorOpType } from '@shared/operator-op-type';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { injectAscendEnvExports } from '@plugin/domain/utils/shell-env-exports';
import type { OperatorToolOutputLabel } from '@plugin/helpers/output-channel';
import type { BaseContext } from '@plugin/domain/services/command-strategy';
import {
  RemoteToolUnavailableError,
  type OperatorCommandTransformer,
} from '@plugin/helpers/remote-command';
import { readWorkspaceProjectTypeSetting } from '@plugin/helpers/operator-project-workspace-config';
import { ConfigService } from '@plugin/service/config-service';

/** 30 min covers a cold full rebuild; anything past that is a hang, not a slow run. */
const DEFAULT_OPERATOR_COMMAND_TIMEOUT_SECONDS = 30 * 60;
const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;

/** Configured operator command timeout in ms, or undefined when disabled. */
export function resolveOperatorCommandTimeoutMs(): number | undefined {
  const configured = ConfigService.readOpDevtoolsSetting<number>('execution.commandTimeoutSeconds');
  const seconds = typeof configured === 'number'
    ? configured
    : DEFAULT_OPERATOR_COMMAND_TIMEOUT_SECONDS;

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }

  return Math.min(Math.round(seconds * 1000), MAX_NODE_TIMER_DELAY_MS);
}

/**
 * Workspace `op-devtools.projectType` override (view id form, e.g. 'ascend') for
 * the project's own path, when available. Returns undefined when the project is
 * unknown or the setting was never written — callers cascade to the DB record.
 */
function resolveWorkspaceProjectTypeSetting(project?: { project_path?: string } | null): string | undefined {
  return project?.project_path
    ? readWorkspaceProjectTypeSetting(vscode.Uri.file(project.project_path))
    : undefined;
}

export function resolveOpTypeForSpawn(
  projectPath: string | undefined,
  operatorNames?: string,
): OperatorOpType | undefined {
  if (!projectPath || !operatorNames?.trim()) {
    return undefined;
  }

  const first = operatorNames.split(',')[0]?.trim();

  if (!first) {
    return undefined;
  }

  const project = getProjectByPath(projectPath);
  const projectType = readWorkspaceProjectTypeSetting(vscode.Uri.file(projectPath))
    ?? project?.project_type;
  const raw = resolveOpRecord(projectPath, first)?.op_type;

  return OperatorPluginRegistry.normalizeOpTypeForSpawn(raw) ?? undefined;
}

export function buildOperatorSpawnContext(options: {
  projectPath?: string;
  operatorNames?: string;
  scriptField?: string | null;
  script?: string;
  toolOutputLabel?: OperatorToolOutputLabel;
  isSimulator?: boolean;
  sanitizerRun?: boolean;
  baseContext?: BaseContext;
}): OperatorSpawnEnvContext {
  // baseContext (from the section base-context resolvers) already carries the
  // resolved project / operator records — when present the builder takes
  // everything from it and never re-resolves anything. The fallback path below
  // (getProjectByPath / resolveOpRecord / resolveOpEntryForProject cascade)
  // runs only when the caller has no BaseContext in scope.
  const project = options.baseContext
    ? options.baseContext.project
    : options.projectPath
      ? getProjectByPath(options.projectPath)
      : undefined;
  // Operator name: the explicit sidebar selection wins; otherwise fall back to
  // the root operator of the project (the synthesized record's own name —
  // the config row `op` is not persisted).
  const opName = options.operatorNames?.split(',')[0]?.trim()
    || (options.baseContext
      ? options.baseContext.operator?.op_name
      : options.projectPath
        ? resolveOpRecord(options.projectPath, '')?.op_name
        : undefined);
  let opType = options.baseContext
    ? OperatorPluginRegistry.normalizeOpTypeForSpawn(options.baseContext.operator?.op_type) ?? undefined
    : resolveOpTypeForSpawn(options.projectPath, options.operatorNames);

  if (!options.baseContext) {
    if (!opType && options.projectPath && opName) {
      opType = OperatorPluginRegistry.normalizeOpTypeForSpawn(resolveOpEntryForProject(options.projectPath, opName)?.opType) ?? undefined;
    }

    if (!opType && project) {
      opType = OperatorPluginRegistry.normalizeOpTypeForSpawn(project.project_type) ?? undefined;
    }
  }

  return {
    opType,
    operatorNames: options.operatorNames,
    projectPath: project?.project_path ?? options.projectPath,
    // Cascade: workspace `projectType` setting → synthesized record (only when
    // no caller-provided baseContext wins outright).
    projectType: options.baseContext
      ? OperatorPluginRegistry.normalizeProjectTypeForSpawn(options.baseContext.project?.project_type)
      : OperatorPluginRegistry.normalizeProjectTypeForSpawn(resolveWorkspaceProjectTypeSetting(project) ?? project?.project_type),
    toolOutputLabel: options.toolOutputLabel ?? null,
    isSimulator: options.isSimulator === true,
    sanitizerRun: options.sanitizerRun === true,
    scriptField: options.scriptField ?? null,
    script: options.script ?? null,
  };
}

/**
 * Resolve ascend env once, substitute placeholders in the command string,
 * embed resolved vars as `export … &&` prefixes, and execute.
 */
function enrichOperatorSpawnContext(
  spawnContext: OperatorSpawnEnvContext,
  command: string,
): OperatorSpawnEnvContext {
  const project = spawnContext.projectPath
    ? getProjectByPath(spawnContext.projectPath)
    : undefined;

  return {
    ...spawnContext,
    script: spawnContext.script ?? command,
    // Cascade: explicit context → workspace `projectType` setting → DB record.
    projectType: spawnContext.projectType
      ?? OperatorPluginRegistry.normalizeProjectTypeForSpawn(resolveWorkspaceProjectTypeSetting(project) ?? project?.project_type),
    opType: spawnContext.opType
      ?? resolveOpTypeForSpawn(spawnContext.projectPath, undefined)
      ?? OperatorPluginRegistry.normalizeOpTypeForSpawn(project?.project_type)
      ?? undefined,
  };
}

/**
 * Failure text for a finished command result.
 *
 * A timeout resolves as `{ code: null, timedOut: true }`, so a caller that only
 * looks at `code !== 0` tells the user the compile/run failed and hides both the
 * real cause and the setting that controls it.
 */
export function commandFailureMessage(
  result: { timedOut?: boolean;
    output?: string },
  fallbackKey: string,
  params: Record<string, unknown> = {},
): string {
  if (result.timedOut) {
    return t('build.commandTimedOut', { output: result.output ?? '' });
  }

  return t(fallbackKey, params);
}

/**
 * Keep the reopen / manual-build path in sync with what the plugin just resolved.
 * Refreshes `NPU_ARCH` in the integrated-terminal env (so a hand-typed `bash build.sh` in this
 * window matches the plugin build) and pins a host-detected SOC into `settings.json` (so the
 * next "Open Folder" resolves it without probing). Skipped for simulator runs, whose SOC/arch
 * describe the simulator device rather than the host. Best-effort; never blocks the command.
 */
function syncReopenBuildEnv(resolution: AscendEnvResolution, isSimulator: boolean): void {
  if (isSimulator) {
    return;
  }

  applyNpuArchToTerminalEnv(getTerminalEnvCollection(), resolution.npuArch);

  void persistDetectedSocVersion(resolution)
    .catch(() => { /* persistence is an optimization; never fail the command */ });
}

export async function executeOperatorCommand(
  command: string,
  spawnContext: OperatorSpawnEnvContext,
  meta?: {
    outputLabel?: OperatorToolOutputLabel;
    transformCommand?: OperatorCommandTransformer;
    detached?: boolean;
    readyKeyword?: string;
  },
) {
  const ctxWithCommand = enrichOperatorSpawnContext(spawnContext, command);
  const isSimulator = isSimulatorCompile(ctxWithCommand);
  const resolution = await resolveAscendEnvForOperatorCommand(ctxWithCommand);

  if (!resolution) {
    return {
      code: 1,
      output: '',
      stdout: '',
      stderr: '',
      interruptedByUserStop: true,
      timedOut: false,
    };
  }

  syncReopenBuildEnv(resolution, isSimulator);

  const filtered = OperatorPluginRegistry.filterSpawnEnv(
    buildOperatorSpawnEnvFromResolution(resolution, isSimulator),
    ctxWithCommand.opType ?? undefined,
    ctxWithCommand.projectType,
  );
  const env = mergeTritonSanitizerSpawnEnv(filtered, ctxWithCommand);
  const finalCommand = applyAscendPlaceholdersToScript(command, resolution);
  const runnableCommand = injectAscendEnvExports(finalCommand, env);
  const toolOutputLabel = meta?.outputLabel ?? (ctxWithCommand.toolOutputLabel as OperatorToolOutputLabel | undefined) ?? 'tool';
  let commandToExecute: string;

  try {
    commandToExecute = meta?.transformCommand
      ? await meta.transformCommand(runnableCommand)
      : runnableCommand;
  }
  catch (error) {
    if (error instanceof RemoteToolUnavailableError) {
      return {
        code: 1,
        output: '',
        stdout: '',
        stderr: '',
        interruptedByUserStop: true,
        timedOut: false,
      };
    }

    throw error;
  }

  const executor = ProjectManager.getInstance()
    .getExecutor();

  if (meta?.detached) {
    // Detached runs wait on a ready keyword and keep going afterwards, so the command timeout
    // does not apply to them.
    return executor.executeDetached(commandToExecute, meta.readyKeyword || 'ready', [], { toolOutputLabel }, true);
  }

  const timeout = resolveOperatorCommandTimeoutMs();

  return executor.execute(commandToExecute, [], [], {
    toolOutputLabel,
    ...(timeout !== undefined ? { timeout } : {}),
  }, true);
}
