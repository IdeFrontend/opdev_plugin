import {
  VIEW_CONTAINER_ID,
  workbenchViewContainerCommand,
} from '@shared/flavor';

/**
 * View container id of the plugin's panel. It is contributed to the secondary side bar
 * (auxiliary bar) / secondary activity bar — see `contributes.viewsContainers` in the
 * extension manifest.
 */
export const OPS_OPERATE_VIEW_CONTAINER_ID = VIEW_CONTAINER_ID;

/**
 * Candidate workbench commands for FOCUSING (revealing) the plugin's OWN panel, in priority
 * order. The editor-title icon only ever shows/focuses the panel — it never toggles it
 * closed. The host executes the FIRST one it actually registers:
 *
 *  1. `workbench.view.extension.<id>` — standard VS Code view container command.
 *  2. `workbench.action.focusAuxiliaryBar` — focus the secondary (auxiliary) side bar where
 *     the container lives. The target IDE is a VS Code fork (`VSCode-huawei`) that
 *     contributes the container via the non-standard `secondarySidebar` /
 *     `secondaryActivitybar` keys and does NOT register the per-container command above
 *     (calling it throws "command not found"); this fork provides the auxiliary-bar
 *     command family (`toggleAuxiliaryBar` / `closeAuxiliaryBar` are used elsewhere).
 *
 * `workbench.action.toggleSidebarVisibility` (the original GC-33 bug — toggles the PRIMARY
 * side bar and closes Explorer/Debug/etc.) and the auxiliary-bar TOGGLE are deliberately
 * absent: the icon must focus, not toggle.
 */
export const OPS_OPERATE_FOCUS_COMMAND_CANDIDATES: readonly string[] = [
  workbenchViewContainerCommand(),
  'workbench.action.focusAuxiliaryBar',
];

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
