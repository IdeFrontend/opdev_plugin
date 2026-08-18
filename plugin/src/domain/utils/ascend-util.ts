import fs from 'fs-extra';
import path from 'path';
import {
  DEFAULT_FALLBACK_CANN_SOC,
  DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME,
} from '@shared/cann-env-constants';
import {
  _resetDetectedChipCacheForTest,
  cannSocToSeries,
  detectSocSlugFromChipOrProbe,
  detectSocSlugFromProbe,
  getCachedDetectedChipName,
  getDefaultSimulatorForCannSoc,
  getExactChipRule,
  getNpuArchForChipName,
  getNpuArchForSeries,
  seriesToDefaultSoc,
  simulatorTypeToCannSocSlug,
} from '@shared/ascend-series-registry';
import {
  SUPPORT_COMPUTE_UNIT_ASCEND_910_95,
  SUPPORT_COMPUTE_UNIT_ASCEND_950,
  SUPPORT_TILING_DIR_ARCH22,
  SUPPORT_TILING_DIR_ARCH35,
} from '@shared/cann-aclnn-build-defaults';
import {
  getSocVersionWithWorkspaceOverride,
  getWorkspaceNpuArch,
  getWorkspaceSimulatorType,
} from '@plugin/helpers/operator-project-workspace-config';
import {
  execBashWithCannEnv,
  resolveCannSetEnvScriptForDetection,
} from '@plugin/domain/utils/ascend-detection-env';
import { TRITON_SANITIZER_SPAWN_ENV } from '@plugin/domain/constants/triton-sanitizer-env';
import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import type { OperatorOpType } from '@shared/operator-op-type';
import { maybeWarnSocNotDetected } from '@plugin/helpers/ascend-soc-warning';
import { getRemoteToolSeriesSync } from '@plugin/helpers/remote-command';
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
  logAscendEnv(`Ascend Environment Resolved: soc=${resolution.socVersion} (source=${resolution.source.socVersion})`
    + (ctx.isSimulator
      ? `, simulator=${resolution.simulatorType ?? '<unset>'}`
      + ` (source=${resolution.source.simulatorType})`
      : '')
    + `, npu_arch=${resolution.npuArch} (source=${resolution.source.npuArch})`
    + `, support_compute_unit=${getSupportComputeUnitForCannSoc(resolution.socVersion)}`
    + `, support_tiling_dir=${getSupportTilingDirForCannSoc(resolution.socVersion)}`
    + ` [isSimulator=${ctx.isSimulator}]`);
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

export {
  extractChipNames,
  matchChipNameToSeries,
  normalizeChipNameForMatching,
} from '@shared/ascend-series-registry';

/**
 * Normalize a CANN SOC string for stable comparisons / mapping.
 * Example: ` Ascend950 ` → `ascend950`.
 */
export function normalizeCannSoc(cannSoc?: string | null): string {
  return (cannSoc || '').trim()
    .toLowerCase();
}

/** Chip Name or probe text → default CANN SOC slug (see docs/ascend-env-spec.md §4). */
export function socFromCoreName(coreName?: string): string | undefined {
  if (!coreName) {
    return undefined;
  }

  return detectSocSlugFromChipOrProbe(coreName);
}

export function getDefaultSimulatorTypeForCannSoc(cannSoc: string): string {
  const key = normalizeCannSoc(cannSoc);

  if (!key) {
    return DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME;
  }

  return getDefaultSimulatorForCannSoc(key) || DEFAULT_FALLBACK_SIMULATOR_DEVICE_NAME;
}

/**
 * Inverse of {@link getDefaultSimulatorTypeForCannSoc}. Table lookup only.
 */
export function simulatorTypeToCannSoc(simulatorType?: string | null): string | undefined {
  return simulatorTypeToCannSocSlug(simulatorType);
}

/**
 * `NPU_ARCH` for a resolved CANN SOC slug (spec §6). The slug's series drives
 * the value (§6.2); a cached exact-match chip (Pro/Premium/901) only overrides
 * to `dav-1001` when it belongs to the resolved series — i.e. an A2 (`ascend910b`)
 * slug (§6.1). A cached chip never leaks its arch across series, so non-A2 slugs
 * keep their own series arch. Empty/unknown slug → `''` (§6.3, no silent default).
 */
export function getNpuArchForCannSoc(cannSoc?: string | null): string {
  const key = normalizeCannSoc(cannSoc);

  if (!key) {
    return '';
  }

  const series = cannSocToSeries(key);

  if (!series) {
    return '';
  }

  const cachedChip = getCachedDetectedChipName();

  if (cachedChip) {
    const exact = getExactChipRule(cachedChip);

    if (exact && exact.series === series) {
      return exact.npuArch;
    }
  }

  return getNpuArchForSeries(series);
}

/**
 * `NPU_ARCH` a CANN SOC slug yields from its series alone, ignoring the detected chip.
 * Callers use it to tell a chip-specific arch — `dav-1001` on Ascend910ProA/ProB/PremiumA
 * and the 901 pair — from the series default any process can recompute from the slug.
 */
export function getSeriesNpuArchForCannSoc(cannSoc?: string | null): string {
  const key = normalizeCannSoc(cannSoc);
  const series = key ? cannSocToSeries(key) : undefined;

  return series ? getNpuArchForSeries(series) : '';
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
export function resolveAclnnCmakeDefaultsForGeneration(projectSoc?: string | null): AclnnCmakeDefaults {
  const cannSoc = resolveCannSocForGeneration(projectSoc);

  return {
    supportComputeUnit: getSupportComputeUnitForCannSoc(cannSoc),
    supportTilingDir: getSupportTilingDirForCannSoc(cannSoc),
  };
}

/** Replace `__MSTT_SUPPORT_*__` placeholders in the operator root CMakeLists.txt. */
export function patchAclnnCmakeSupportVars(
  opPath: string,
  projectSoc?: string | null,
): void {
  patchCmakePlaceholders(opPath, projectSoc, (content, projectSocValue) => {
    const defaults = resolveAclnnCmakeDefaultsForGeneration(projectSocValue);

    return content
      .split(MSTT_SUPPORT_COMPUTE_UNIT_PLACEHOLDER)
      .join(defaults.supportComputeUnit)
      .split(MSTT_SUPPORT_TILING_DIR_PLACEHOLDER)
      .join(defaults.supportTilingDir);
  });
}

/** Placeholders in CANN AscendC CMakeLists.txt `ENABLE_MS_SANITIZER` branch. */

export const MSTT_SANITIZER_COMPILE_FLAGS_PLACEHOLDER = '__MSTT_SANITIZER_COMPILE_FLAGS__' as const;

export const MSTT_SANITIZER_LINK_SUFFIX_PLACEHOLDER = '__MSTT_SANITIZER_LINK_SUFFIX__' as const;

const SANITIZER_COMPILE_FLAGS_A5 = '-g';
const SANITIZER_COMPILE_FLAGS_NON_A5 = '-g --cce-enable-sanitizer';
const SANITIZER_LINK_SUFFIX_A5 = '';
const SANITIZER_LINK_SUFFIX_NON_A5 = '--cce-enable-sanitizer';

export type SanitizerCmakeDefaults = {
  compileFlags: string;
  linkSuffix: string;
};

function resolveCannSocForGeneration(projectSoc?: string | null): string {
  return normalizeCannSoc(getSocVersionWithWorkspaceOverride(projectSoc))
    || computeAscendEnvResolution({ isSimulator: false }).socVersion;
}

/**
 * MSSanitizer cmake suffixes for CANN AscendC templates.
 * Fixed in template for all SOCs: compile `-O2`, link `--cce-fatobj-link`.
 * Placeholders supply only the alternating suffix:
 * A5 compile `-g`, link none; non-A5 compile `-g --cce-enable-sanitizer`, link `--cce-enable-sanitizer`.
 */
export function resolveSanitizerCmakeDefaultsForGeneration(projectSoc?: string | null): SanitizerCmakeDefaults {
  const isA5 = isAscendA5ProfilerCannSoc(resolveCannSocForGeneration(projectSoc));

  return {
    compileFlags: isA5 ? SANITIZER_COMPILE_FLAGS_A5 : SANITIZER_COMPILE_FLAGS_NON_A5,
    linkSuffix: isA5 ? SANITIZER_LINK_SUFFIX_A5 : SANITIZER_LINK_SUFFIX_NON_A5,
  };
}

/** Replace `__MSTT_SANITIZER_*__` placeholders in the operator root CMakeLists.txt. */
export function patchCannSanitizerCmakeOptions(
  opPath: string,
  projectSoc?: string | null,
): void {
  patchCmakePlaceholders(opPath, projectSoc, (content, projectSocValue) => {
    if (!content.includes(MSTT_SANITIZER_COMPILE_FLAGS_PLACEHOLDER)
      && !content.includes(MSTT_SANITIZER_LINK_SUFFIX_PLACEHOLDER)) {
      return content;
    }

    const defaults = resolveSanitizerCmakeDefaultsForGeneration(projectSocValue);

    let patched = content
      .split(MSTT_SANITIZER_COMPILE_FLAGS_PLACEHOLDER)
      .join(defaults.compileFlags);

    if (defaults.linkSuffix === '') {
      patched = patched.replace(
        new RegExp(`\\n {8}${MSTT_SANITIZER_LINK_SUFFIX_PLACEHOLDER}`, 'g'),
        '',
      );
    }
    else {
      patched = patched
        .split(MSTT_SANITIZER_LINK_SUFFIX_PLACEHOLDER)
        .join(defaults.linkSuffix);
    }

    return patched;
  });
}

function patchCmakePlaceholders(
  opPath: string,
  projectSoc: string | null | undefined,
  patch: (content: string, projectSocValue: string | null | undefined)=> string,
): void {
  const cmakePath = path.join(opPath, 'CMakeLists.txt');

  if (!fs.pathExistsSync(cmakePath)) {
    return;
  }

  const content = fs.readFileSync(cmakePath, 'utf8');
  const patched = patch(content, projectSoc);

  if (patched !== content) {
    fs.writeFileSync(cmakePath, patched, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Lazy host SOC detection
// ---------------------------------------------------------------------------

type DetectionState =
  | { kind: 'pending' }
  | { kind: 'resolved';
    soc: string;
    via: 'asys' | 'npu-smi' | 'remote-tool' }
    | { kind: 'failed' };

let detectionState: DetectionState = { kind: 'pending' };

function logDetectionHit(
  hit: NonNullable<ReturnType<typeof detectSocSlugFromProbe>>,
  via: 'asys' | 'npu-smi' | 'remote-tool',
): void {
  const npuArch = getNpuArchForChipName(hit.chipRaw)
    ?? getNpuArchForSeries(hit.series);

  logAscendEnv(`detected series=${hit.series.toUpperCase()} soc=${hit.socVersion}`
    + ` npu_arch=${npuArch} chip=${hit.chipRaw} (via=${via})`);
}

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

    const hit = detectSocSlugFromProbe(asysOutput);

    if (!hit) {
      return undefined;
    }

    logDetectionHit(hit, 'asys');

    return hit.socVersion;
  }
  catch {
    return undefined;
  }
}

function tryDetectSocViaNpuSmi(): string | undefined {
  try {
    const setEnv = resolveCannSetEnvScriptForDetection();
    const out = execBashWithCannEnv(setEnv, 'npu-smi info', 20000);
    const hit = detectSocSlugFromProbe(out);

    if (!hit) {
      return undefined;
    }

    logDetectionHit(hit, 'npu-smi');

    return hit.socVersion;
  }
  catch {
    return undefined;
  }
}

function tryDetectSocViaRemoteToolConfig(): string | undefined {
  const series = getRemoteToolSeriesSync();

  if (!series) {
    return undefined;
  }

  const socVersion = seriesToDefaultSoc(series);

  logAscendEnv(`detected series=${series.toUpperCase()} soc=${socVersion} (via=remote-tool-config)`);

  return socVersion;
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

    return asysSoc;
  }

  const npuSoc = tryDetectSocViaNpuSmi();

  if (npuSoc) {
    detectionState = {
      kind: 'resolved',
      soc: npuSoc,
      via: 'npu-smi',
    };

    return npuSoc;
  }

  const remoteConfigSoc = tryDetectSocViaRemoteToolConfig();

  if (remoteConfigSoc) {
    detectionState = {
      kind: 'resolved',
      soc: remoteConfigSoc,
      via: 'remote-tool',
    };

    return remoteConfigSoc;
  }

  detectionState = { kind: 'failed' };
  logAscendEnv('SOC autodetection failed (asys/npu-smi/remote-tool-config); SOC_VERSION will be unset');

  return undefined;
}

/**
 * Test hook — reset the cached detection result so tests can re-exercise the
 * detection path. Not intended for production use.
 */
export function _resetSocDetectionCacheForTest(): void {
  detectionState = { kind: 'pending' };
  _resetDetectedChipCacheForTest();
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

export type NpuArchSource =
  | 'workspace-setting'
  | 'global-env'
  | 'derived-from-soc';

export interface AscendEnvResolution {
  socVersion: string;
  npuArch: string;
  simulatorType: string | undefined;
  source: {
    socVersion: SocVersionSource;
    simulatorType: SimulatorTypeSource;
    npuArch: NpuArchSource;
  };
}

export interface ResolveAscendEnvContext {
  isSimulator: boolean;
}

export interface ResolveAscendEnvOptions {
  /**
   * Set to false to skip the lazy host probe (`asys` / `npu-smi`). Used by callers
   * that run before the user's CANN env is known and must not cache a failed probe.
   */
  allowHostDetection?: boolean;
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
  options: ResolveAscendEnvOptions,
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
  const detected = options.allowHostDetection === false ? undefined : detectSocOnce();

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

function resolveNpuArch(soc: {
  socVersion: string;
  source: SocVersionSource;
}): { npuArch: string;
  source: NpuArchSource } {
  // Explicit user override (issue #29) — wins wherever NPU_ARCH is resolved.
  const fromWorkspace = getWorkspaceNpuArch();

  if (fromWorkspace) {
    return {
      npuArch: fromWorkspace,
      source: 'workspace-setting',
    };
  }

  // OS-level `NPU_ARCH` captured at activation. Ignored when the SOC comes from the
  // simulator type, where the arch must follow the simulated device.
  const fromGlobalEnv = (getGlobalEnvSnapshot().npuArch || '').trim();

  if (fromGlobalEnv && soc.source !== 'derived-from-simulator') {
    return {
      npuArch: fromGlobalEnv,
      source: 'global-env',
    };
  }

  return {
    npuArch: getNpuArchForCannSoc(soc.socVersion),
    source: 'derived-from-soc',
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
 * - **`npuArch`**: workspace `op-devtools.environment.npuArch` (explicit, issue #29) →
 *   `process.env.NPU_ARCH` snapshot (unless the SOC came from the simulator type) →
 *   `getNpuArchForCannSoc(socVersion)`.
 */
/** Core resolver (no logging). Used internally and by tests. */
export function computeAscendEnvResolution(
  ctx: ResolveAscendEnvContext,
  options: ResolveAscendEnvOptions = {},
): AscendEnvResolution {
  const firstSim = resolveSimulatorFirstPass(ctx);
  const soc = resolveSocVersion(ctx, firstSim, options);

  let simulatorType = firstSim.simulatorType;
  let simulatorSource = firstSim.source;

  if (ctx.isSimulator && simulatorType === undefined) {
    simulatorType = getDefaultSimulatorTypeForCannSoc(soc.socVersion);
    simulatorSource = 'default-from-soc';
  }

  const arch = resolveNpuArch(soc);

  return {
    socVersion: soc.socVersion,
    npuArch: arch.npuArch,
    simulatorType,
    source: {
      socVersion: soc.source,
      simulatorType: ctx.isSimulator ? simulatorSource : 'n/a',
      npuArch: arch.source,
    },
  };
}

/**
 * Resolve env for a single operator command execution. Logs once and returns
 * values for spawn env and `{soc_version}` / `{simulator_type}` substitution.
 *
 * Returns undefined if the user cancels or opens settings (execution should be
 * aborted and user should re-run after configuring SOC).
 */
export async function resolveAscendEnvForOperatorCommand(spawnContext: OperatorSpawnEnvContext): Promise<AscendEnvResolution | undefined> {
  const isSimulator = isSimulatorCompile(spawnContext);
  const resolveCtx: ResolveAscendEnvContext = { isSimulator };
  let resolution = computeAscendEnvResolution(resolveCtx);

  resolution = enrichAscendResolutionForPlaceholders(
    resolveCtx,
    resolution,
    spawnContext.script || '',
  );

  logAscendEnvResolution(resolution, resolveCtx);
  const warningResult = await maybeWarnSocNotDetected(resolution);

  if (warningResult === 'cancelled' || warningResult === 'open-settings') {
    return undefined;
  }

  if (warningResult === 'configured') {
    resolution = computeAscendEnvResolution(resolveCtx);

    resolution = enrichAscendResolutionForPlaceholders(
      resolveCtx,
      resolution,
      spawnContext.script || '',
    );

    logAscendEnvResolution(resolution, resolveCtx);
  }

  return resolution;
}

/**
 * Non-command callers (config bootstrap, profiler helpers, webview reads).
 * Resolves silently — user notifications for missing SOC are shown only from
 * {@link resolveAscendEnvForOperatorCommand} when an operator action runs.
 */
export function resolveAscendEnv(ctx: ResolveAscendEnvContext): AscendEnvResolution {
  const resolution = computeAscendEnvResolution(ctx);

  logAscendEnvResolution(resolution, ctx);

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
  opType?: OperatorOpType | null;
  projectId?: number;
  configId?: number;
  operatorNames?: string;
  /** Resolved from `projects.json` when omitted; see {@link normalizeProjectTypeForSpawn}. */
  projectType?: OperatorProjectType | null;
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
 * Full resolution yields `SOC_VERSION` and `NPU_ARCH`; {@link OperatorPluginRegistry.filterSpawnEnv}
 * filters exports by plugin + project type. For simulator-class runs,
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

export function mergeTritonSanitizerSpawnEnv(
  env: Record<string, string>,
  ctx: OperatorSpawnEnvContext,
): Record<string, string> {
  if (ctx.opType === 'triton' && ctx.configType === 'sanitizer') {
    return {
      ...env,
      ...TRITON_SANITIZER_SPAWN_ENV,
    };
  }

  return env;
}

/** @deprecated Prefer {@link resolveAscendEnvForOperatorCommand} for operator runs. */
export function getOperatorSpawnEnv(
  ctx: OperatorSpawnEnvContext,
  resolution?: AscendEnvResolution,
): Record<string, string> {
  const resolved = resolution ?? computeAscendEnvResolution({ isSimulator: isSimulatorCompile(ctx) });
  const isSimulator = isSimulatorCompile(ctx);
  const filtered = OperatorPluginRegistry.filterSpawnEnv(
    buildOperatorSpawnEnvFromResolution(resolved, isSimulator),
    ctx.opType ?? undefined,
    ctx.projectType,
  );

  return mergeTritonSanitizerSpawnEnv(filtered, ctx);
}
