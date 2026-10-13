/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { t } from 'i18next';

import { quoteShellTokenIfNeeded } from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import { toWorkspaceRelativePosixPath } from '@plugin/domain/utils/path-utils';
import {
  readWorkspaceCache,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';

export type PythonTargetAction = 'sync-from-active' | 'use-existing' | 'no-target';

/**
 * Decides how to resolve the python target for an active-file flow (sanitizer / simulate /
 * on-board).
 *
 * The settings webview opens in `ViewColumn.Active` and displaces the `.py`, so at run
 * time (Start clicked inside the webview) there is no active text editor. When a matching
 * file is focused we (re)sync from it; when nothing is focused we trust the target already
 * captured in the workspace cache (e.g. at panel open); a focused non-matching file still
 * warns.
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
 * When a Python operator requires an active file, point the sanitizer Python target
 * (`cache.sanitizerPythonTarget[op]`) at the open `.py` (same pattern as build/run
 * for PyAsc/Triton).
 *
 * The cache key is the operator name. The active-file project types
 * (pyasc/triton) are single-operator, so the root operator name — equal to the
 * workspace root basename, per the synthesized root record — is the key, matching
 * the hydrate convention (`deriveSanitizerPythonTarget` keyed by
 * `row.user_options.op`).
 *
 * @returns false if validation failed (caller should abort the flow).
 */
export async function syncSanitizerPythonTargetFromActiveEditor(activeFileExtension: string): Promise<boolean> {
  const activeEditor = vscode.window.activeTextEditor;
  const activeFileName = activeEditor?.document.fileName;

  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(t('task.workspacePathNotFound'));

    return false;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;
  const opName = path.basename(workspacePath);
  const existingTargetFile = readWorkspaceCache(workspacePath).sanitizerPythonTarget?.[opName];

  const action = decidePythonTargetAction({
    activeFileName,
    activeFileExtension,
    existingTargetFile,
  });

  // No active editor (e.g. Start was clicked inside the settings webview, which holds
  // focus): proceed with the target captured earlier (already in the workspace cache).
  if (action === 'use-existing') {
    return true;
  }

  if (action === 'no-target') {
    vscode.window.showWarningMessage(t('task.openPyFirst'));

    return false;
  }

  // action === 'sync-from-active': (re)point the sanitizer target at the focused file.
  const filePath = activeEditor!.document.uri.fsPath;
  const relativePath = toWorkspaceRelativePosixPath(workspacePath, filePath);

  // Reject files outside the workspace (path.relative yields `../…` or, across drives, an
  // absolute path) so we never point the sanitizer target outside the project.
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    vscode.window.showWarningMessage(t('task.fileOutsideWorkspace'));

    return false;
  }

  await updateWorkspaceCache(workspacePath, (cache) => {
    cache.sanitizerPythonTarget = {
      ...(cache.sanitizerPythonTarget ?? {}),
      // Quote the path token (no-op for clean paths) so an in-workspace path with a space or
      // shell metacharacter stays a single, injection-safe argument under `shell: true`.
      [opName]: `python3 ${quoteShellTokenIfNeeded(relativePath)}`,
    };
  });

  return true;
}
