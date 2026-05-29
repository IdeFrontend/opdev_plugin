import { ProjectManager } from '@plugin/core/project/project-manager';
import { getConfigById } from '@plugin/domain/services/configuration';
import { getOpByProjectIdAndOpName } from '@plugin/domain/models/model';
import {
  applyAscendPlaceholdersToScript,
  buildOperatorSpawnEnvFromResolution,
  isSimulatorCompile,
  OperatorSpawnEnvContext,
  resolveAscendEnvForOperatorCommand,
} from '@plugin/domain/utils/ascend-util';
import { injectAscendEnvExports } from '@plugin/domain/utils/shell-env-exports';
import {
  deriveOperatorToolOutputLabel,
  type OperatorToolOutputLabel,
} from '@plugin/helpers/output-channel';

export function resolveOpTypeForSpawn(
  projectId: number | undefined,
  operatorNames?: string,
): string | undefined {
  if (!projectId || !operatorNames?.trim()) {
    return undefined;
  }

  const first = operatorNames.split(',')[0]?.trim();

  if (!first) {
    return undefined;
  }

  return getOpByProjectIdAndOpName(projectId, first)?.op_type;
}

export function buildOperatorSpawnContext(options: {
  configId?: number;
  operatorNames?: string;
  scriptField?: string | null;
  script?: string;
}): OperatorSpawnEnvContext {
  const config = options.configId ? getConfigById(options.configId) : undefined;
  const projectId = config?.project_id;

  return {
    opType: resolveOpTypeForSpawn(projectId, options.operatorNames),
    projectId,
    configType: config?.config_type ?? null,
    scriptField: options.scriptField ?? null,
    script: options.script ?? null,
  };
}

/**
 * Resolve ascend env once, substitute placeholders in the command string,
 * embed resolved vars as `export … &&` prefixes, and execute.
 */
export async function executeOperatorCommand(
  command: string,
  spawnContext: OperatorSpawnEnvContext,
  meta?: { outputLabel?: OperatorToolOutputLabel },
) {
  const ctxWithCommand: OperatorSpawnEnvContext = {
    ...spawnContext,
    script: spawnContext.script ?? command,
  };
  const isSimulator = isSimulatorCompile(ctxWithCommand);
  const resolution = resolveAscendEnvForOperatorCommand(ctxWithCommand);
  const env = buildOperatorSpawnEnvFromResolution(resolution, isSimulator);
  const finalCommand = applyAscendPlaceholdersToScript(command, resolution);
  const runnableCommand = injectAscendEnvExports(finalCommand, env);
  const toolOutputLabel = meta?.outputLabel ?? deriveOperatorToolOutputLabel(ctxWithCommand);

  return ProjectManager.getInstance()
    .getExecutor()
    .execute(runnableCommand, [], [], { toolOutputLabel }, true);
}
