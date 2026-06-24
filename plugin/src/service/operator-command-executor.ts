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
    opType = OperatorPluginRegistry.normalizeOpTypeForSpawn(
      getOpByProjectIdAndOpName(projectId, opName)?.op_type,
    ) ?? undefined;
  }
  if (!opType && project) {
    opType = OperatorPluginRegistry.normalizeOpTypeForSpawn(project.project_type) ?? undefined;
  }

  return {
    opType,
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

export async function executeOperatorCommand(
  command: string,
  spawnContext: OperatorSpawnEnvContext,
  meta?: { outputLabel?: OperatorToolOutputLabel },
) {
  const ctxWithCommand = enrichOperatorSpawnContext(spawnContext, command);
  const isSimulator = isSimulatorCompile(ctxWithCommand);
  const resolution = resolveAscendEnvForOperatorCommand(ctxWithCommand);
  const filtered = OperatorPluginRegistry.filterSpawnEnv(
    buildOperatorSpawnEnvFromResolution(resolution, isSimulator),
    ctxWithCommand.opType ?? undefined,
    ctxWithCommand.projectType,
  );
  const env = mergeTritonSanitizerSpawnEnv(filtered, ctxWithCommand);
  const finalCommand = applyAscendPlaceholdersToScript(command, resolution);
  const runnableCommand = injectAscendEnvExports(finalCommand, env);
  const toolOutputLabel = meta?.outputLabel ?? deriveOperatorToolOutputLabel(ctxWithCommand);

  return ProjectManager.getInstance()
    .getExecutor()
    .execute(runnableCommand, [], [], { toolOutputLabel }, true);
}
