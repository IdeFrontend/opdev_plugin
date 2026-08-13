import { t } from 'i18next';

import { ProjectManager } from '@plugin/core/project/project-manager';
import { getConfigById } from '@plugin/domain/services/configuration';
import { getOpByProjectIdAndOpName } from '@plugin/domain/models/model';
import { getProjectById } from '@plugin/domain/models/project-model';
import {
  applyAscendPlaceholdersToScript,
  buildOperatorSpawnEnvFromResolution,
  isSimulatorCompile,
  mergeTritonSanitizerSpawnEnv,
  OperatorSpawnEnvContext,
  resolveAscendEnvForOperatorCommand,
} from '@plugin/domain/utils/ascend-util';
import type { OperatorOpType } from '@shared/operator-op-type';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { injectAscendEnvExports } from '@plugin/domain/utils/shell-env-exports';
import {
  deriveOperatorToolOutputLabel,
  type OperatorToolOutputLabel,
} from '@plugin/helpers/output-channel';
import {
  RemoteToolUnavailableError,
  type OperatorCommandTransformer,
} from '@plugin/helpers/remote-command';
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

export function resolveOpTypeForSpawn(
  projectId: number | undefined,
  operatorNames?: string,
): OperatorOpType | undefined {
  if (!projectId || !operatorNames?.trim()) {
    return undefined;
  }

  const first = operatorNames.split(',')[0]?.trim();

  if (!first) {
    return undefined;
  }

  const raw = getOpByProjectIdAndOpName(projectId, first)?.op_type;

  return OperatorPluginRegistry.normalizeOpTypeForSpawn(raw) ?? undefined;
}

export function buildOperatorSpawnContext(options: {
  configId?: number;
  operatorNames?: string;
  scriptField?: string | null;
  script?: string;
}): OperatorSpawnEnvContext {
  const config = options.configId ? getConfigById(options.configId) : undefined;
  const projectId = config?.project_id;
  const project = projectId ? getProjectById(projectId) : undefined;
  const configOp = (config?.user_options as Record<string, unknown> | undefined)?.op as
    | string
    | undefined;
  const opName = options.operatorNames?.split(',')[0]?.trim() || configOp?.trim();

  let opType = resolveOpTypeForSpawn(projectId, options.operatorNames);

  if (!opType && projectId && opName) {
    opType = OperatorPluginRegistry.normalizeOpTypeForSpawn(getOpByProjectIdAndOpName(projectId, opName)?.op_type) ?? undefined;
  }

  if (!opType && project) {
    opType = OperatorPluginRegistry.normalizeOpTypeForSpawn(project.project_type) ?? undefined;
  }

  return {
    opType,
    configId: options.configId,
    operatorNames: options.operatorNames,
    projectId,
    projectType: OperatorPluginRegistry.normalizeProjectTypeForSpawn(project?.project_type),
    configType: config?.config_type ?? null,
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
  const projectId = spawnContext.projectId;
  const project = projectId ? getProjectById(projectId) : undefined;

  return {
    ...spawnContext,
    script: spawnContext.script ?? command,
    projectType: spawnContext.projectType
      ?? OperatorPluginRegistry.normalizeProjectTypeForSpawn(project?.project_type),
    opType: spawnContext.opType
      ?? resolveOpTypeForSpawn(projectId, undefined)
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

  const filtered = OperatorPluginRegistry.filterSpawnEnv(
    buildOperatorSpawnEnvFromResolution(resolution, isSimulator),
    ctxWithCommand.opType ?? undefined,
    ctxWithCommand.projectType,
  );
  const env = mergeTritonSanitizerSpawnEnv(filtered, ctxWithCommand);
  const finalCommand = applyAscendPlaceholdersToScript(command, resolution);
  const runnableCommand = injectAscendEnvExports(finalCommand, env);
  const toolOutputLabel = meta?.outputLabel ?? deriveOperatorToolOutputLabel(ctxWithCommand);
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
