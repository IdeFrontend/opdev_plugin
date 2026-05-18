import {
  applyAscendPlaceholdersToScript,
  AscendEnvResolution,
  computeAscendEnvResolution,
  enrichAscendResolutionForPlaceholders,
  isSimulatorCompile,
  ResolveAscendEnvContext,
} from '@plugin/domain/utils/ascend-util';

/**
 * Substitute `{soc_version}` and `{simulator_type}` using a single env resolution.
 * When `resolution` is omitted (tests / legacy), computes once without logging.
 *
 * Operator commands should use {@link resolveAscendEnvForOperatorCommand} in
 * {@link executeOperatorCommand} instead of calling this before execute.
 */
export function replaceOperatorScriptPlaceholders(
  script: string,
  resolution?: AscendEnvResolution,
): string {
  if (resolution) {
    return applyAscendPlaceholdersToScript(script, resolution);
  }

  const spawnLike = {
    script,
    configType: null as string | null,
    scriptField: null as string | null,
  };
  const isSimulator = isSimulatorCompile(spawnLike);
  const resolveCtx: ResolveAscendEnvContext = { isSimulator };
  const computed = enrichAscendResolutionForPlaceholders(
    resolveCtx,
    computeAscendEnvResolution(resolveCtx),
    script,
  );

  return applyAscendPlaceholdersToScript(script, computed);
}
