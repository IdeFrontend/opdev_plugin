import * as vscode from 'vscode';

/**
 * Feature flag configuration
 * Controls whether V2 features are enabled
 */
export const FEATURE_FLAGS = {
  /** Use V2 build service */
  USE_V2_BUILD: false,

  /** Use V2 run service */
  USE_V2_RUN: false,

  /** Use V2 build example service */
  USE_V2_BUILD_EXAMPLE: false,

  /** Use V2 simulate service */
  USE_V2_SIMULATE: false,

  /** Use V2 on-board service */
  USE_V2_ON_BOARD: false,

  /** Use V2 sanitizer (anomaly detection) service */
  USE_V2_SANITIZER: false,

  /** Use V2 dump tensor service */
  USE_V2_DUMP_TENSOR: false,

  /** Use V2 UT test service */
  USE_V2_UT_TEST: false,

  /**
   * Experimental: msAgent integration for sanitizer (auto load log, AI fix in sidebar).
   * Requires msAgent installed separately; UI is hidden when commands are unavailable.
   * Setting is stored under `op-devtools.sanitizer.enableMsAgentAiFix` (see package.json).
   */
  ENABLE_MSAGENT_SANITIZER_AI_FIX: false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

const V2_FEATURE_FLAG_PREFIX = 'USE_V2_';

function isV2FeatureFlagKey(key: FeatureFlagKey): boolean {
  return key.startsWith(V2_FEATURE_FLAG_PREFIX);
}

/**
 * Get feature flag state from VSCode configuration.
 * Uses default value if config is missing.
 * V2 flags: `mstt.featureFlags.<lowercase_key>`.
 * msAgent flag: `op-devtools.sanitizer.enableMsAgentAiFix`.
 */
export function getFeatureFlag(key: FeatureFlagKey): boolean {
  try {
    if (key === 'ENABLE_MSAGENT_SANITIZER_AI_FIX') {
      return (
        vscode.workspace
          .getConfiguration('op-devtools')
          .get<boolean>('sanitizer.enableMsAgentAiFix', FEATURE_FLAGS[key]) ?? FEATURE_FLAGS[key]
      );
    }

    const config = vscode.workspace.getConfiguration('mstt');
    const configKey = `featureFlags.${key.toLowerCase()}`;

    return config.get<boolean>(configKey, FEATURE_FLAGS[key]);
  }
  catch {
    // If config read fails, use default value
    return FEATURE_FLAGS[key];
  }
}

/**
 * Experimental msAgent + sanitizer integration (sidebar AI fix, auto parseLog).
 * Prefer this helper at call sites for clarity.
 */
export function isMsAgentSanitizerAiFixEnabled(): boolean {
  return getFeatureFlag('ENABLE_MSAGENT_SANITIZER_AI_FIX');
}

/**
 * Check whether all V2 features are enabled.
 */
export function isAllV2Enabled(): boolean {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[])
    .filter(isV2FeatureFlagKey)
    .every((key) => getFeatureFlag(key));
}

/**
 * Get the list of currently enabled V2 features.
 */
export function getEnabledV2Features(): FeatureFlagKey[] {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[])
    .filter(isV2FeatureFlagKey)
    .filter((key) => getFeatureFlag(key));
}
