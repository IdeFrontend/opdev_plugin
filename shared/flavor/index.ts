/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  BRANDING,
  COMMAND_JSON_BUTTON_ACTION_ID,
  COMMAND_OPEN_CSV_ID,
  COMMAND_PREFIX,
  COMMAND_VSCODE_JUMP_TO_FILE_ID,
  CONTEXT_PREFIX,
  CSV_VIEWER_VIEW_TYPE,
  DUMP_TENSOR_SIDEBAR_VIEW_ID,
  EXTENSION_ID,
  FLAVOR_DEFAULTS,
  FLAVOR_GATES,
  FLAVOR_ID,
  INSIGHT_DATA_VIEWER_PANEL_TYPE,
  MINDSTUDIO_OPSUITE_PANEL_TYPE,
  PLUGIN_SIDEBAR_VIEW_TYPE,
  SETTINGS_PREFIX,
  SUBMENU_OPERATOR_DEBUG_ID,
  SUBMENU_OPERATOR_PERFORMANCE_ID,
  TREE_VIEW_HOME,
  TREE_VIEW_OPERATE,
  TREE_VIEW_OPERATOR_PROJECTS,
  TREE_VIEW_PERFORMANCE_RESULTS,
  TREE_VIEW_SANITIZER_RESULTS,
  TREE_VIEW_ST_TEST_HISTORY,
  VIEW_CONTAINER_ID,
  VIEW_PREFIX,
} from './generated';

export {
  BRANDING,
  COMMAND_JSON_BUTTON_ACTION_ID,
  COMMAND_OPEN_CSV_ID,
  COMMAND_PREFIX,
  COMMAND_VSCODE_JUMP_TO_FILE_ID,
  CONTEXT_PREFIX,
  CSV_VIEWER_VIEW_TYPE,
  DUMP_TENSOR_SIDEBAR_VIEW_ID,
  EXTENSION_ID,
  FLAVOR_DEFAULTS,
  FLAVOR_GATES,
  FLAVOR_ID,
  INSIGHT_DATA_VIEWER_PANEL_TYPE,
  MINDSTUDIO_OPSUITE_PANEL_TYPE,
  PLUGIN_SIDEBAR_VIEW_TYPE,
  SETTINGS_PREFIX,
  SUBMENU_OPERATOR_DEBUG_ID,
  SUBMENU_OPERATOR_PERFORMANCE_ID,
  TREE_VIEW_HOME,
  TREE_VIEW_OPERATE,
  TREE_VIEW_OPERATOR_PROJECTS,
  TREE_VIEW_PERFORMANCE_RESULTS,
  TREE_VIEW_SANITIZER_RESULTS,
  TREE_VIEW_ST_TEST_HISTORY,
  VIEW_CONTAINER_ID,
  VIEW_PREFIX,
};

export type FlavorFeatureKey = keyof typeof FLAVOR_GATES;

export function isFlavorGated(feature: FlavorFeatureKey): boolean {
  return (FLAVOR_GATES as Record<string, boolean>)[feature] !== false;
}

export function getFlavorDefault(featureKey: string): boolean | undefined {
  if (featureKey in FLAVOR_DEFAULTS) {
    return FLAVOR_DEFAULTS[featureKey as keyof typeof FLAVOR_DEFAULTS];
  }

  return undefined;
}

export function contextKey(suffix: string): string {
  return `${CONTEXT_PREFIX}.${suffix}`;
}

export function settingsKey(suffix: string): string {
  return `${SETTINGS_PREFIX}.${suffix}`;
}

export function workbenchViewContainerCommand(): string {
  return `workbench.view.extension.${VIEW_CONTAINER_ID}`;
}

export function treeItemContextKey(suffix: string): string {
  return `${VIEW_PREFIX}.${suffix}`;
}

export function sanitizerDiagnosticCollectionId(): string {
  return `${SETTINGS_PREFIX}-sanitizer`;
}

export function jumpToFileDiagnosticCollectionId(): string {
  return `${VIEW_PREFIX}-jump-to-file`;
}

export function performanceHintsDiagnosticCollectionId(): string {
  return `${VIEW_PREFIX}.performanceHints`;
}
