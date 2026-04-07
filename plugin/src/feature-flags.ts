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
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * Get feature flag state from VSCode configuration.
 * Uses default value if config is missing.
 */
export function getFeatureFlag(key: FeatureFlagKey): boolean {
  try {
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
 * Check whether all V2 features are enabled.
 */
export function isAllV2Enabled(): boolean {
  return Object.keys(FEATURE_FLAGS)
    .every((key) =>
      getFeatureFlag(key as FeatureFlagKey));
}

/**
 * Get the list of currently enabled V2 features.
 */
export function getEnabledV2Features(): FeatureFlagKey[] {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).filter((key) =>
    getFeatureFlag(key));
}
