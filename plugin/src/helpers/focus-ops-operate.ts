/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as vscode from 'vscode';

import {
  VIEW_CONTAINER_ID,
  workbenchViewContainerCommand,
} from '@shared/flavor';

/**
 * View container id of the plugin's panel. It is contributed to the primary activity bar
 * (left side bar) — see `contributes.viewsContainers` in the extension manifest.
 */
export const OPS_OPERATE_VIEW_CONTAINER_ID = VIEW_CONTAINER_ID;

/**
 * Candidate workbench commands for FOCUSING (revealing) the plugin's OWN panel, in priority
 * order. The editor-title icon only ever shows/focuses the panel — it never toggles it
 * closed. The host executes the FIRST one it actually registers:
 *
 *  1. `workbench.view.extension.<id>` — standard VS Code view container command; every
 *     VS Code variant registers it for activity-bar containers, so it is the only candidate.
 *
 * `workbench.action.toggleSidebarVisibility` (the original GC-33 bug — toggles the PRIMARY
 * side bar and closes Explorer/Debug/etc.) and any toggle command are deliberately absent:
 * the icon must focus, not toggle.
 */
export const OPS_OPERATE_FOCUS_COMMAND_CANDIDATES: readonly string[] = [workbenchViewContainerCommand()];

/**
 * Pick the command the editor-title icon should run to focus the plugin's panel: the first
 * candidate the host has actually registered. Returns `undefined` when none are available,
 * so the caller can skip execution instead of throwing "command not found".
 *
 * @param availableCommands result of `vscode.commands.getCommands(true)`
 */
export function resolveFocusOpsOperateCommand(availableCommands: readonly string[]): string | undefined {
  return OPS_OPERATE_FOCUS_COMMAND_CANDIDATES.find((command) => availableCommands.includes(command));
}

/**
 * Focus (reveal) the plugin's OWN view container, degrading gracefully across hosts.
 *
 * The generated `workbench.view.extension.<id>` command only exists on hosts that register
 * it (standard VS Code). The VSCode-huawei fork contributes the container via the
 * non-standard `secondarySidebar` / `secondaryActivitybar` keys and does NOT register that
 * command, so calling it blindly throws "command not found" — which, during `activate`,
 * surfaces as "Activating extension failed". This resolves the first candidate the host has
 * actually registered, executes only that, skips when none exist, and swallows any error so
 * it never bubbles out to break activation.
 */
export async function focusOpsOperateViewContainer(): Promise<void> {
  try {
    const availableCommands = await vscode.commands.getCommands(true);
    const focusCommand = resolveFocusOpsOperateCommand(availableCommands);

    if (!focusCommand) {
      console.warn('focusOpsOperateViewContainer: no registered command to focus the plugin view container');

      return;
    }

    await vscode.commands.executeCommand(focusCommand);
  }
  catch (error) {
    console.log(error);
  }
}
