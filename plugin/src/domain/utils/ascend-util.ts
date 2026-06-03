import {
  CANN_SOC_ASCEND_310P,
  CANN_SOC_ASCEND_910,
  CANN_SOC_ASCEND_910B,
  CANN_SOC_ASCEND_910_93,
  CANN_SOC_ASCEND_950,
  DEFAULT_FALLBACK_CANN_SOC,
  DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME,
  NPU_ARCH_DAV_2201,
  NPU_ARCH_DAV_3510,
  SIMULATOR_ASCEND_310P,
  SIMULATOR_ASCEND_910,
  SIMULATOR_ASCEND_910C,
  SIMULATOR_ASCEND_950PR_9589, SIMULATOR_ASCEND_910B3,
} from '@shared/cann-env-constants';
import {
  SUPPORT_COMPUTE_UNIT_ASCEND_910_95,
  SUPPORT_COMPUTE_UNIT_ASCEND_950,
  SUPPORT_TILING_DIR_ARCH22,
  SUPPORT_TILING_DIR_ARCH35,
} from '@shared/cann-aclnn-build-defaults';
import {
  getSocVersionWithWorkspaceOverride,
  getWorkspaceSimulatorType,
} from '@plugin/helpers/operator-project-workspace-config';
import {
  execBashWithCannEnv,
  resolveCannSetEnvScriptForDetection,
} from '@plugin/domain/utils/ascend-detection-env';
import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import { maybeWarnSocNotDetected } from '@plugin/helpers/ascend-soc-warning';
import { appendLog } from '@plugin/helpers/output-channel';
import { isAscendA5ProfilerCannSoc } from '@shared/msprof-onboard-env';

const ASCEND_ENV_LOG_SCOPE = 'op-devtools/ascend-env';

/** Structured ascend-env lines in the Huawei Op Devtools output channel. */
function logAscendEnv(message: string): void {
  appendLog(ASCEND_ENV_LOG_SCOPE, message);
}

function logAscendEnvResolution(
  resolution: AscendEnvResolution,
  ctx: ResolveAscendEnvContext,
): void {
  logAscendEnv(
    `Ascend Environment Resolved: soc=${resolution.socVersion} (source=${resolution.source.socVersion})`
      + (ctx.isSimulator
        ? `, simulator=${resolution.simulatorType ?? '<unset>'}`
        + ` (source=${resolution.source.simulatorType})`
        : '')
      + `, npu_arch=${resolution.npuArch} (source=${resolution.source.npuArch})`
      + `, support_compute_unit=${getSupportComputeUnitForCannSoc(resolution.socVersion)}`
      + `, support_tiling_dir=${getSupportTilingDirForCannSoc(resolution.socVersion)}`
      + ` [isSimulator=${ctx.isSimulator}]`,
  );
}

/**
 * Simulator directory for `{simulator_type}` substitution without re-resolving SOC.
 */
function simulatorTypeForPlaceholders(
  ctx: ResolveAscendEnvContext,
  resolution: AscendEnvResolution,
): string {
  if (resolution.simulatorType) {
    return resolution.simulatorType;
  }

  const sim = resolveSimulatorFirstPass({
    ...ctx,
    isSimulator: true,
  });

  return sim.simulatorType ?? getDefaultSimulatorTypeForCannSoc(resolution.socVersion);
}

/** Fill `simulatorType` for placeholder substitution only (no SOC re-resolution). */
export function enrichAscendResolutionForPlaceholders(
  resolveCtx: ResolveAscendEnvContext,
  resolution: AscendEnvResolution,
  script: string,
): AscendEnvResolution {
  if (!/\{simulator_type\}/.test(script) || resolution.simulatorType) {
    return resolution;
  }

  return {
    ...resolution,
    simulatorType: simulatorTypeForPlaceholders(resolveCtx, resolution),
  };
}

export { isAscendA5ProfilerCannSoc } from '@shared/msprof-onboard-env';

export { DEFAULT_FALLBACK_CANN_SOC } from '@shared/cann-env-constants';

/** Substrings in a normalized SOC slug that select the A5 NPU arch. */
const A5_NPU_ARCH_KEY_FRAGMENTS = [
  CANN_SOC_ASCEND_950,
  'atlas a5',
] as const;

/** Compact SOC token (spaces removed) for Atlas A5-style names. */
const A5_NPU_ARCH_COMPACT_FRAGMENT = 'atlasa5';

/**
 * Substring → CANN SOC slug mapping. Entries are case-insensitive and matched
 * against the lowercased input. Order matters — longer / more specific keys
 * should come first so they win over generic ones (e.g. `Ascend 950` matches
 * before plain `950`).
 */
const ASCEND_SOC_RULES: ReadonlyArray<{ key: string;
  slug: string }> = [
  {
    key: 'atlas a5 series',
    slug: CANN_SOC_ASCEND_950,
  },
  {
    key: 'ascend 950',
    slug: CANN_SOC_ASCEND_950,
  },
  {
    key: CANN_SOC_ASCEND_950,
    slug: CANN_SOC_ASCEND_950,
  },
  {
    key: 'atlas a5',
    slug: CANN_SOC_ASCEND_950,
  },
  {
    key: 'atlasa5',
    slug: CANN_SOC_ASCEND_950,
  },
  {
    key: '910_93',
    slug: CANN_SOC_ASCEND_910_93,
  },
  {
    key: '910c',
    slug: CANN_SOC_ASCEND_910_93,
  },
  {
    key: '910b',
    slug: CANN_SOC_ASCEND_910B,
  },
  {
    key: '310p',
    slug: CANN_SOC_ASCEND_310P,
  },
  {
    key: '910a',
    slug: CANN_SOC_ASCEND_910B,
  },
  {
    key: '950',
    slug: CANN_SOC_ASCEND_950,
  },
];

/**
 * Default simulator device directory (`tools/simulator/<name>/lib`) per CANN
 * SOC slug. Used when no workspace simulator type was set and no
 * `SIMULATOR_TYPE` was in the host env. The inverse map below derives a SOC
 * back from a simulator directory for the simulator-driven SOC rule.
 */
const CANN_SOC_TO_SIMULATOR_TYPE: Readonly<Record<string, string>> = {
  [CANN_SOC_ASCEND_910B]: SIMULATOR_ASCEND_910B3,
  [CANN_SOC_ASCEND_910_93]: SIMULATOR_ASCEND_910C,
  [CANN_SOC_ASCEND_910]: SIMULATOR_ASCEND_910,
  [CANN_SOC_ASCEND_310P]: SIMULATOR_ASCEND_310P,
  [CANN_SOC_ASCEND_950]: SIMULATOR_ASCEND_950PR_9589,
};

const SIMULATOR_TYPE_TO_CANN_SOC: Readonly<Record<string, string>> = Object.freeze(Object.entries(CANN_SOC_TO_SIMULATOR_TYPE)
  .reduce<Record<string, string>>(
    (acc, [
      slug,
      simulator,
    ]) => {
      acc[simulator.toLowerCase()] = slug;

      return acc;
    },
    {},
  ));

/**
 * Normalize a CANN SOC string for stable comparisons / mapping.
 * Example: ` Ascend950 ` → `ascend950`.
 */
export function normalizeCannSoc(cannSoc?: string | null): string {
  return (cannSoc || '').trim()
    .toLowerCase();
}

export function socFromCoreName(coreName?: string): string | undefined {
  if (!coreName) {
    return undefined;
  }

  const lower = coreName.trim()
    .toLowerCase();

  for (const rule of ASCEND_SOC_RULES) {
    if (lower.includes(rule.key)) {
      return rule.slug;
    }
  }

  return undefined;
}

export function getDefaultSimulatorTypeForCannSoc(cannSoc: string): string {
  const key = normalizeCannSoc(cannSoc);

  if (!key) {
    return DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME;
  }

  return CANN_SOC_TO_SIMULATOR_TYPE[key] || DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME;
}

/**
 * Inverse of {@link getDefaultSimulatorTypeForCannSoc}. Returns the CANN SOC
 * slug that the simulator directory belongs to, or `undefined` for unknown
 * names. Used by the simulator-driven SOC rule.
 */
export function simulatorTypeToCannSoc(simulatorType?: string | null): string | undefined {
  const key = (simulatorType || '').trim()
    .toLowerCase();

  if (!key) {
    return undefined;
  }

  if (SIMULATOR_TYPE_TO_CANN_SOC[key]) {
    return SIMULATOR_TYPE_TO_CANN_SOC[key];
  }

  // Conservative heuristic for forward-compatibility: names that include
  // a known generation token map to the same slug as the closest entry.
  if (key.includes('950') || key.includes('9589')) {
    return CANN_SOC_ASCEND_950;
  }

  if (key.includes('910c') || key.includes('910_93')) {
    return CANN_SOC_ASCEND_910_93;
  }

  if (key.includes('910b')) {
    return CANN_SOC_ASCEND_910B;
  }

  if (key.includes('910')) {
    return CANN_SOC_ASCEND_910;
  }

  if (key.includes('310p')) {
    return CANN_SOC_ASCEND_310P;
  }

  return undefined;
}

/**
 * AscendC `--npu-arch` value for a CANN SOC slug. Always derived from the SOC
 * — never from a simulator directory — so that the value stays consistent
 * with `SOC_VERSION` for the resolved environment.
 */
export function getNpuArchForCannSoc(cannSoc?: string | null): string {
  const key = normalizeCannSoc(cannSoc);

  if (!key) {
    return '';
  }

  const compact = key.replace(/\s+/g, '');

  if (
    A5_NPU_ARCH_KEY_FRAGMENTS.some((fragment) => key.includes(fragment))
    || compact.includes(A5_NPU_ARCH_COMPACT_FRAGMENT)
  ) {
    return NPU_ARCH_DAV_3510;
  }

  return NPU_ARCH_DAV_2201;
}

/** A2/A3 vs A5 branch for paired ACLNN spawn defaults ({@link getSupportComputeUnitForCannSoc}, etc.). */
function resolveAclnnBuildDefaultForCannSoc(
  cannSoc: string | null | undefined,
  a5Value: string,
  nonA5Value: string,
): string {
  const key = normalizeCannSoc(cannSoc);

  if (!key) {
    return '';
  }

  return isAscendA5ProfilerCannSoc(key) ? a5Value : nonA5Value;
}

/** Placeholders in ascend `add_custom` CMakeLists.txt replaced at project generation. */
export const MSTT_SUPPORT_COMPUTE_UNIT_PLACEHOLDER = '__MSTT_SUPPORT_COMPUTE_UNIT__' as const;
export const MSTT_SUPPORT_TILING_DIR_PLACEHOLDER = '__MSTT_SUPPORT_TILING_DIR__' as const;

export type AclnnCmakeDefaults = {
  supportComputeUnit: string;
  supportTilingDir: string;
};

/**
 * ACLNN `SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR` for standard-custom ascend cmake.
 */
export function getSupportComputeUnitForCannSoc(cannSoc?: string | null): string {
  return resolveAclnnBuildDefaultForCannSoc(
    cannSoc,
    SUPPORT_COMPUTE_UNIT_ASCEND_950,
    SUPPORT_COMPUTE_UNIT_ASCEND_910_95,
  );
}

/**
 * ACLNN `SUPPORT_TILING_DIR` paired with {@link getSupportComputeUnitForCannSoc}.
 */
export function getSupportTilingDirForCannSoc(cannSoc?: string | null): string {
  return resolveAclnnBuildDefaultForCannSoc(
    cannSoc,
    SUPPORT_TILING_DIR_ARCH35,
    SUPPORT_TILING_DIR_ARCH22,
  );
}

/**
 * Resolve ACLNN cmake capability constants when scaffolding ascend `add_custom`.
 * Uses workspace/project SOC when set, otherwise the same chain as
 * {@link computeAscendEnvResolution} (global env → detection → default).
 */
export function resolveAclnnCmakeDefaultsForGeneration(
  projectSoc?: string | null,
): AclnnCmakeDefaults {
  const cannSoc = normalizeCannSoc(getSocVersionWithWorkspaceOverride(projectSoc))
    || computeAscendEnvResolution({ isSimulator: false }).socVersion;

  return {
    supportComputeUnit: getSupportComputeUnitForCannSoc(cannSoc),
    supportTilingDir: getSupportTilingDirForCannSoc(cannSoc),
  };
}


// ---------------------------------------------------------------------------
// Lazy host SOC detection
// ---------------------------------------------------------------------------

type DetectionState =
  | { kind: 'pending' }
  | { kind: 'resolved';
    soc: string;
    via: 'asys' | 'npu-smi' }
    | { kind: 'failed' };

let detectionState: DetectionState = { kind: 'pending' };

function tryDetectSocViaAsys(): string | undefined {
  try {
    const setEnv = resolveCannSetEnvScriptForDetection();

    if (!setEnv) {
      return undefined;
    }

    const asysOutput = execBashWithCannEnv(setEnv, 'asys info -r=status', 30000);

    if (!/ascend/i.test(asysOutput)) {
      return undefined;
    }

    return socFromCoreName(asysOutput);
  }
  catch {
    return undefined;
  }
}

function tryDetectSocViaNpuSmi(): string | undefined {
  try {
    const setEnv = resolveCannSetEnvScriptForDetection();
    const out = execBashWithCannEnv(setEnv, 'npu-smi info', 20000);

    return socFromCoreName(out);
  }
  catch {
    return undefined;
  }
}

function detectSocOnce(): string | undefined {
  if (detectionState.kind === 'resolved') {
    return detectionState.soc;
  }

  if (detectionState.kind === 'failed') {
    return undefined;
  }

  const asysSoc = tryDetectSocViaAsys();

  if (asysSoc) {
    detectionState = {
      kind: 'resolved',
      soc: asysSoc,
      via: 'asys',
    };
    logAscendEnv(`detected SOC via asys: ${asysSoc}`);

    return asysSoc;
  }

  const npuSoc = tryDetectSocViaNpuSmi();

  if (npuSoc) {
    detectionState = {
      kind: 'resolved',
      soc: npuSoc,
      via: 'npu-smi',
    };
    logAscendEnv(`detected SOC via npu-smi: ${npuSoc}`);

    return npuSoc;
  }

  detectionState = { kind: 'failed' };
  logAscendEnv('SOC autodetection failed (asys/npu-smi); SOC_VERSION will be unset');

  return undefined;
}

/**
 * Test hook — reset the cached detection result so tests can re-exercise the
 * detection path. Not intended for production use.
 */
export function _resetSocDetectionCacheForTest(): void {
  detectionState = { kind: 'pending' };
}

/** Test hook — skip slow host detection (`find` / `asys` / `npu-smi`). */
export function _primeSocDetectionFailedForTest(): void {
  detectionState = { kind: 'failed' };
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export type SocVersionSource =
  | 'workspace-setting'
  | 'global-env'
  | 'detected'
  | 'derived-from-simulator'
  | 'default';

export type SimulatorTypeSource =
  | 'workspace-setting'
  | 'global-env'
  | 'default-from-soc'
  | 'n/a';

export interface AscendEnvResolution {
  socVersion: string;
  npuArch: string;
  simulatorType: string | undefined;
  source: {
    socVersion: SocVersionSource;
    simulatorType: SimulatorTypeSource;
    npuArch: 'derived-from-soc';
  };
}

export interface ResolveAscendEnvContext {
  isSimulator: boolean;
}

interface SimulatorResolution {
  simulatorType: string | undefined;
  source: SimulatorTypeSource;
  /** True when the simulator type came from the VS Code workspace setting. */
  drivesSocResolution: boolean;
}

function resolveSimulatorFirstPass(ctx: ResolveAscendEnvContext): SimulatorResolution {
  if (!ctx.isSimulator) {
    return {
      simulatorType: undefined,
      source: 'n/a',
      drivesSocResolution: false,
    };
  }

  const fromWorkspace = getWorkspaceSimulatorType();

  if (fromWorkspace) {
    return {
      simulatorType: fromWorkspace,
      source: 'workspace-setting',
      drivesSocResolution: true,
    };
  }

  const fromGlobalEnv = getGlobalEnvSnapshot().simulatorType;

  if (fromGlobalEnv) {
    return {
      simulatorType: fromGlobalEnv,
      source: 'global-env',
      drivesSocResolution: false,
    };
  }

  return {
    simulatorType: undefined,
    source: 'default-from-soc',
    drivesSocResolution: false,
  };
}

function resolveSocVersion(
  ctx: ResolveAscendEnvContext,
  sim: SimulatorResolution,
): { socVersion: string;
  source: SocVersionSource } {
  // Spec: simulator runs with an explicit simulator type from the VS Code
  // setting derive the SOC from that simulator type, overriding the regular
  // chain. Env-provided or default simulator types do **not** trigger this.
  if (ctx.isSimulator && sim.drivesSocResolution && sim.simulatorType) {
    const derived = simulatorTypeToCannSoc(sim.simulatorType);

    if (derived) {
      return {
        socVersion: derived,
        source: 'derived-from-simulator',
      };
    }

    logAscendEnv(`simulator type "${sim.simulatorType}" has no known `
      + 'CANN SOC mapping; falling back to the regular SOC resolution chain.');
  }

  // Workspace setting (explicit only; package.json schema default does NOT
  // count — that is enforced by getSocVersionWithWorkspaceOverride which
  // delegates to cfg.inspect).
  const fromWorkspace = normalizeCannSoc(getSocVersionWithWorkspaceOverride(null));

  if (fromWorkspace) {
    return {
      socVersion: fromWorkspace,
      source: 'workspace-setting',
    };
  }

  // OS-level env var captured once at extension activation.
  const fromGlobalEnv = normalizeCannSoc(getGlobalEnvSnapshot().socVersion);

  if (fromGlobalEnv) {
    return {
      socVersion: fromGlobalEnv,
      source: 'global-env',
    };
  }

  // Lazy host detection (`asys`, then `npu-smi`).
  const detected = detectSocOnce();

  if (detected) {
    return {
      socVersion: detected,
      source: 'detected',
    };
  }

  return {
    socVersion: DEFAULT_FALLBACK_CANN_SOC,
    source: 'default',
  };
}

/**
 * Single entry-point that decides `SOC_VERSION`, `SIMULATOR_TYPE` and
 * `NPU_ARCH` for one operator command. All consumers (script placeholders,
 * spawn env, profiler, build-service, model defaults, …) call this so they
 * cannot disagree.
 *
 * Precedence (canonical contract — also captured in `docs/ascend-env-spec.md`):
 *
 * - **`simulatorType`** (only when `isSimulator`):
 *   1. Workspace `op-devtools.performanceTuning.simulation.simulatorType` (explicit).
 *   2. `process.env.SIMULATOR_TYPE` captured at activation.
 *   3. `getDefaultSimulatorTypeForCannSoc(socVersion)` after SOC is resolved.
 * - **`socVersion`**:
 *   - When `isSimulator` AND the simulator type came from the workspace
 *     setting → derived from that simulator type.
 *   - Otherwise: workspace `op-devtools.environment.socVersion` (explicit) →
 *     `process.env.SOC_VERSION` snapshot → `asys` / `npu-smi` detection →
 *     `DEFAULT_FALLBACK_CANN_SOC`.
 * - **`npuArch`**: always `getNpuArchForCannSoc(socVersion)`.
 */
/** Core resolver (no logging). Used internally and by tests. */
export function computeAscendEnvResolution(ctx: ResolveAscendEnvContext): AscendEnvResolution {
  const firstSim = resolveSimulatorFirstPass(ctx);
  const soc = resolveSocVersion(ctx, firstSim);

  let simulatorType = firstSim.simulatorType;
  let simulatorSource = firstSim.source;

  if (ctx.isSimulator && simulatorType === undefined) {
    simulatorType = getDefaultSimulatorTypeForCannSoc(soc.socVersion);
    simulatorSource = 'default-from-soc';
  }

  const npuArch = getNpuArchForCannSoc(soc.socVersion);

  return {
    socVersion: soc.socVersion,
    npuArch,
    simulatorType,
    source: {
      socVersion: soc.source,
      simulatorType: ctx.isSimulator ? simulatorSource : 'n/a',
      npuArch: 'derived-from-soc',
    },
  };
}

/**
 * Resolve env for a single operator command execution. Logs once and returns
 * values for spawn env and `{soc_version}` / `{simulator_type}` substitution.
 */
export function resolveAscendEnvForOperatorCommand(
  spawnContext: OperatorSpawnEnvContext,
): AscendEnvResolution {
  const isSimulator = isSimulatorCompile(spawnContext);
  const resolveCtx: ResolveAscendEnvContext = { isSimulator };
  let resolution = computeAscendEnvResolution(resolveCtx);

  resolution = enrichAscendResolutionForPlaceholders(
    resolveCtx,
    resolution,
    spawnContext.script || '',
  );

  logAscendEnvResolution(resolution, resolveCtx);
  maybeWarnSocNotDetected(resolution);

  return resolution;
}

/**
 * Non-command callers (config bootstrap, profiler helpers). Logs each call.
 */
export function resolveAscendEnv(ctx: ResolveAscendEnvContext): AscendEnvResolution {
  const resolution = computeAscendEnvResolution(ctx);

  logAscendEnvResolution(resolution, ctx);
  maybeWarnSocNotDetected(resolution);

  return resolution;
}

/** Substitute ascend placeholders using an existing resolution (no re-resolve). */
export function applyAscendPlaceholdersToScript(
  script: string,
  resolution: AscendEnvResolution,
): string {
  const simulatorType = resolution.simulatorType ?? '';

  return script
    .replace(/\{soc_version\}/g, resolution.socVersion)
    .replace(/\{simulator_type\}/g, simulatorType);
}

// ---------------------------------------------------------------------------
// Convenience wrappers (thin shims so existing call sites keep working)
// ---------------------------------------------------------------------------

/**
 * Backwards-compatible helper. Returns the CANN SOC slug a non-simulator
 * command would use. New code should prefer {@link resolveAscendEnv} directly
 * so it gets the source-tagged result.
 */
export function resolveEffectiveCannSoc(): string {
  return resolveAscendEnv({ isSimulator: false }).socVersion;
}

/**
 * Backwards-compatible helper. Returns the simulator directory name for a
 * simulator command, honoring all precedence rules in {@link resolveAscendEnv}.
 */
export function resolveSimulatorDir(): string {
  const resolved = resolveAscendEnv({ isSimulator: true });

  return resolved.simulatorType ?? DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME;
}

/**
 * Backwards-compatible helper kept for {@link resolveAscendEnv}-free call sites
 * that already know two SOC candidates (project / global) and want the first
 * non-empty one. Prefer `resolveAscendEnv` for new code.
 */
export function resolveRuntimeCannSoc(
  projectSoc?: string | null,
  fallbackSoc?: string | null,
): string {
  return normalizeCannSoc(projectSoc) || normalizeCannSoc(fallbackSoc);
}

// ---------------------------------------------------------------------------
// Spawn env emission
// ---------------------------------------------------------------------------

/** Context for building per-spawn env overrides (merged over `process.env`). */
export type OperatorSpawnEnvContext = {
  opType?: string | null;
  projectId?: number;
  configType?: string | null;
  scriptField?: string | null;
  script?: string | null;
};

export function isSimulatorCompile(params: OperatorSpawnEnvContext): boolean {
  if (params.configType === 'simulate') {
    return true;
  }

  if (params.scriptField === 'cpu_debug_script') {
    return true;
  }

  const script = params.script || '';

  return /\B--simulator\b/.test(script);
}

/**
 * Ascend variables for a single operator command. {@link executeOperatorCommand}
 * embeds them as `export … &&` prefixes (see `shell-env-exports.ts`); the plugin
 * **never** writes these back to `process.env`.
 *
 * `SOC_VERSION` and `NPU_ARCH` are always emitted when non-empty so cmake
 * `$ENV{…}` fallbacks see consistent values. For simulator-class runs,
 * `SOC_VERSION` is the simulator device directory name (e.g. `Ascend910B3`) so
 * cann `build.sh --simulator` and cmake can link `tools/simulator/${SOC_VERSION}/lib`;
 * for other runs it is the CANN SOC slug (e.g. `ascend910b`). `NPU_ARCH` is always
 * derived from the resolved internal SOC slug. Standard-custom ACLNN capability
 * (`SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR`) is baked into cmake at generation.
 */
export function buildOperatorSpawnEnvFromResolution(
  resolution: AscendEnvResolution,
  isSimulator: boolean,
): Record<string, string> {
  const socVersionForSpawn = isSimulator
    ? (resolution.simulatorType ?? getDefaultSimulatorTypeForCannSoc(resolution.socVersion))
    : resolution.socVersion;

  return {
    SOC_VERSION: socVersionForSpawn,
    NPU_ARCH: resolution.npuArch,
  };
}

/** @deprecated Prefer {@link resolveAscendEnvForOperatorCommand} for operator runs. */
export function getOperatorSpawnEnv(
  ctx: OperatorSpawnEnvContext,
  resolution?: AscendEnvResolution,
): Record<string, string> {
  const resolved = resolution ?? computeAscendEnvResolution({
    isSimulator: isSimulatorCompile(ctx),
  });

  return buildOperatorSpawnEnvFromResolution(resolved, isSimulatorCompile(ctx));
}
