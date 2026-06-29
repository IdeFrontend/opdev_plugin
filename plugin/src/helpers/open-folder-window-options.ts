/**
 * Build the options for `vscode.openFolder` from the chosen window intent.
 *
 * `forceNewWindow: false` does NOT force the current window to be reused: when a folder
 * is already open VS Code falls back to the `window.openFoldersInNewWindow` setting, which
 * by default opens a NEW window. That was issue #34 — picking "Current Window" still spawned
 * a new window. Passing `forceReuseWindow: true` reliably reuses the current window. The two
 * flags are mutually exclusive, so we emit exactly one.
 *
 * @param forceNewWindow true to open in a new window, false to reuse the current window
 * @returns the `vscode.openFolder` options object carrying exactly one of the two flags
 */
export function buildOpenFolderWindowOptions(forceNewWindow: boolean): { forceNewWindow: true } | { forceReuseWindow: true } {
  return forceNewWindow ? { forceNewWindow: true } : { forceReuseWindow: true };
}
