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

//FIXME: remove once persisted settings always include the --ops placeholder
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
 * Persisted settings may omit `--ops={operatorNames}`; append `--ops` when
 * operators are selected.
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
 * When names are set but the script has no `--ops` (persisted settings without the
 * placeholder), appends `--ops` for standard-custom ascend-style compile lines only.
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

  //FIXME: remove once persisted settings always include the --ops placeholder
  if (!scriptHasLiteralOpsFlag(result) && isStandardCustomCompileScript(result)) {
    result = appendLegacyStandardCustomOpsFlag(result, names);
  }

  return result;
}

/**
 * Ensure a standard-custom (`--vendor_name=custom`) `--run_example` line carries
 * `--soc={soc_version}`. build.sh's `--run_example` validates/selects the platform from
 * `--soc`; without it the run-example phase prints an empty "mode:" and bails to its
 * usage text instead of building/running the example. No-op when
 * the script already has a `--soc` flag or is not a standard-custom line. The injected
 * `{soc_version}` placeholder is resolved later by {@link executeOperatorCommand}.
 */
export function ensureStandardCustomSocFlag(script: string): string {
  if (/\B--soc=/.test(script)) {
    return script;
  }

  if (script.includes('--vendor_name=custom')) {
    return script.replace(
      /--vendor_name=custom\b/,
      '--soc={soc_version} --vendor_name=custom',
    );
  }

  return script;
}

/**
 * Substitute `{soc_version}` and `{simulator_type}` using a single env resolution.
 * When `resolution` is omitted (tests / direct callers), computes once without logging.
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
