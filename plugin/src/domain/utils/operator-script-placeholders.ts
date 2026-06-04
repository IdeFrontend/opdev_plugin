import {
  applyAscendPlaceholdersToScript,
  AscendEnvResolution,
  computeAscendEnvResolution,
  enrichAscendResolutionForPlaceholders,
  isSimulatorCompile,
  ResolveAscendEnvContext,
} from '@plugin/domain/utils/ascend-util';

function scriptHasLiteralOpsFlag(script: string): boolean {
  return /\B--ops=/.test(script);
}

//FIXME: remove after legacy settings deleted
/** Ascend standard-custom compile scripts that accept a `--ops` build.sh flag. */
function isStandardCustomCompileScript(script: string): boolean {
  if (script.includes('--vendor_name=custom')) {
    return true;
  }

  if (/\B--pkg\b/.test(script)) {
    return true;
  }

  // Ascend UT: bash … --soc=… -u
  if (/\B--soc=/.test(script) && /\s-u\b/.test(script)) {
    return true;
  }

  return false;
}

/**
 * Legacy migrated settings may omit `--ops={operatorNames}`; append `--ops` like the
 * old Ascend Command.addOptions path when operators are selected.
 */
function appendLegacyStandardCustomOpsFlag(script: string, names: string): string {
  if (script.includes('--vendor_name=custom')) {
    return script.replace(
      /--vendor_name=custom\b/,
      `--vendor_name=custom --ops=${names}`,
    );
  }

  if (/\B--pkg\b/.test(script)) {
    return script.replace(/\B--pkg\b/, `--pkg --ops=${names}`);
  }

  if (/\s-u\b/.test(script)) {
    return script.replace(/\s-u\b/, ` --ops=${names} -u`);
  }

  return `${script} --ops=${names}`;
}

/**
 * Substitute `{operatorNames}` in compile scripts. When `operatorNames` is empty,
 * removes the `--ops={operatorNames}` token entirely (not `--ops=` with an empty value).
 * When names are set but the script has no `--ops` (legacy settings), appends `--ops`
 * for standard-custom ascend-style compile lines only.
 */
export function applyOperatorNamesPlaceholder(
  script: string,
  operatorNames?: string | null,
): string {
  const names = operatorNames?.trim() ?? '';

  if (!names) {
    return script
      .replace(/\s*--ops=\{operatorNames\}/g, '')
      .replace(/\{operatorNames\}/g, '')
      .replace(/  +/g, ' ')
      .trim();
  }

  let result = script.replace(/\{operatorNames\}/g, names);

  //FIXME: remove after legacy settings deleted
  if (!scriptHasLiteralOpsFlag(result) && isStandardCustomCompileScript(result)) {
    result = appendLegacyStandardCustomOpsFlag(result, names);
  }

  return result;
}

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
