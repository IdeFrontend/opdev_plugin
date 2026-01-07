import * as vscode from 'vscode';

/**
 * 功能开关配置
 * 控制是否启用 V2 版本的功能
 */
export const FEATURE_FLAGS = {
  /** 使用 V2 版本的构建服务 */
  USE_V2_BUILD: false,

  /** 使用 V2 版本的运行服务 */
  USE_V2_RUN: false,

  /** 使用 V2 版本的构建示例服务 */
  USE_V2_BUILD_EXAMPLE: false,

  /** 使用 V2 版本的仿真服务 */
  USE_V2_SIMULATE: false,

  /** 使用 V2 版本的上板服务 */
  USE_V2_ON_BOARD: false,

  /** 使用 V2 版本的异常检测服务 */
  USE_V2_SANITIZER: false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * 从 VSCode 配置中获取功能开关状态
 * 如果配置不存在,使用默认值
 */
export function getFeatureFlag(key: FeatureFlagKey): boolean {
  try {
    const config = vscode.workspace.getConfiguration('mstt');
    const configKey = `featureFlags.${key.toLowerCase()}`;

    return config.get<boolean>(configKey, FEATURE_FLAGS[key]);
  }
  catch {
    // 如果获取配置失败,使用默认值
    return FEATURE_FLAGS[key];
  }
}

/**
 * 检查是否所有 V2 功能都已启用
 */
export function isAllV2Enabled(): boolean {
  return Object.keys(FEATURE_FLAGS)
    .every((key) =>
      getFeatureFlag(key as FeatureFlagKey));
}

/**
 * 获取当前启用的 V2 功能列表
 */
export function getEnabledV2Features(): FeatureFlagKey[] {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).filter((key) =>
    getFeatureFlag(key));
}
