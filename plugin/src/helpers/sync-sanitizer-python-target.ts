import * as path from 'path';
import * as vscode from 'vscode';
import { t } from 'i18next';

import {
  postConfig, getConfig,
} from '@plugin/domain/services/configuration';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { quoteShellTokenIfNeeded } from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';

export type PythonTargetAction = 'sync-from-active' | 'use-existing' | 'no-target';

/**
 * Decides how to resolve the python target for an active-file flow (sanitizer / simulate /
 * on-board).
 *
 * The settings webview opens in `ViewColumn.Active` and displaces the `.py`, so at run
 * time (Start clicked inside the webview) there is no active text editor. When a matching
 * file is focused we (re)sync from it; when nothing is focused we trust the target already
 * captured in config (e.g. at panel open); a focused non-matching file still warns.
 */
export function decidePythonTargetAction(input: {
  activeFileName: string | undefined;
  activeFileExtension: string;
  existingTargetFile: string | undefined;
}): PythonTargetAction {
  const {
    activeFileName, activeFileExtension, existingTargetFile,
  } = input;

  if (activeFileName?.endsWith(activeFileExtension)) {
    return 'sync-from-active';
  }

  // Otherwise — a non-matching file is focused (e.g. a README/JSON tab), or the options webview
  // holds focus so there is no active editor at all — reuse the target captured earlier (the .py
  // selected on a previous run) instead of blocking the flow. Only ask for a .py when nothing was
  // ever captured. A focused matching file above always wins, so this never targets a stale file
  // when the user actually has a different .py open.
  return existingTargetFile?.trim() ? 'use-existing' : 'no-target';
}

/**
 * When a Python operator requires an active file, point sanitizer config `target_file`
 * at the open `.py` (same pattern as build/run for PyAsc/Triton).
 *
 * @returns false if validation failed (caller should abort the flow).
 */
export async function syncSanitizerPythonTargetFromActiveEditor(
  sanitizerConfigId: number,
  activeFileExtension: string,
): Promise<boolean> {
  const activeEditor = vscode.window.activeTextEditor;
  const activeFileName = activeEditor?.document.fileName;

  const projectIdStr = ProjectManager.getInstance().projectId;

  if (!projectIdStr) {
    return false;
  }

  const projectId = Number(projectIdStr);
  const configs = await getConfig(projectId, 'sanitizer');
  const sanitizerConfig = configs.find((c) => c.config_id === sanitizerConfigId);
  const existingTargetFile = (sanitizerConfig?.user_options as Record<string, unknown> | undefined)
    ?.target_file as string | undefined;

  const action = decidePythonTargetAction({
    activeFileName,
    activeFileExtension,
    existingTargetFile,
  });

  // No active editor (e.g. Start was clicked inside the settings webview, which holds
  // focus): proceed with the target captured earlier — it is already in config and is
  // what buildSanitizerCommand reads.
  if (action === 'use-existing') {
    return true;
  }

  if (action === 'no-target') {
    vscode.window.showWarningMessage(t('task.openPyFirst'));

    return false;
  }

  // action === 'sync-from-active': (re)point the sanitizer target at the focused file.
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders?.length) {
    vscode.window.showWarningMessage(t('task.workspacePathNotFound'));

    return false;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const filePath = activeEditor!.document.uri.fsPath;
  const relativePath = path.relative(workspacePath, filePath)
    .replace(/\\/g, '/');

  // Reject files outside the workspace (path.relative yields `../…` or, across drives, an
  // absolute path) so we never point the sanitizer target outside the project.
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    vscode.window.showWarningMessage(t('task.fileOutsideWorkspace'));

    return false;
  }

  if (!sanitizerConfig) {
    return false;
  }

  await postConfig('sanitizer', [
    {
      config_id: sanitizerConfigId,
      config_type: 'sanitizer',
      user_options: {
        ...sanitizerConfig.user_options,
        // Quote the path token (no-op for clean paths) so an in-workspace path with a space or
        // shell metacharacter stays a single, injection-safe argument under `shell: true`.
        target_file: `python3 ${quoteShellTokenIfNeeded(relativePath)}`,
      },
    },
  ]);

  return true;
}
