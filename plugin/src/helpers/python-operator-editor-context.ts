import * as vscode from 'vscode';
import { listRootPythonEntryFiles } from '@plugin/domain/plugins/detection-utils';
import { toWorkspaceRelativePosixPath } from '@plugin/domain/utils/path-utils';

function uriMatchesExtension(uri: vscode.Uri, ext: string): boolean {
  const e = ext.toLowerCase();

  return uri.fsPath.toLowerCase()
    .endsWith(e);
}

/**
 * Resolve a resource URI from a workbench tab (plain text or diff’s modified side).
 */
export function tabUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
  const { input } = tab;

  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }

  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }

  return undefined;
}

/** True when the workbench has more than one editor column (split view). */
export function isSplitEditorView(): boolean {
  return vscode.window.tabGroups.all.length > 1;
}

/**
 * All filesystem URIs from each editor group’s active tab that match `ext`, deduped by path.
 */
export function listDedupedActiveTabUrisForExtension(ext: string): vscode.Uri[] {
  const seen = new Set<string>();
  const out: vscode.Uri[] = [];

  for (const group of vscode.window.tabGroups.all) {
    const tab = group.activeTab;

    if (!tab) {
      continue;
    }

    const uri = tabUriFromTab(tab);

    if (!uri || !uriMatchesExtension(uri, ext)) {
      continue;
    }

    const key = uri.fsPath.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(uri);
  }

  return out;
}

function activeEditorUriForExtension(ext: string): vscode.Uri | undefined {
  const activeDoc = vscode.window.activeTextEditor?.document;

  if (!activeDoc || !activeDoc.fileName.toLowerCase()
    .endsWith(ext.toLowerCase())) {
    return undefined;
  }

  return activeDoc.uri;
}

/** When editor context is empty, use the sole root-level operator `.py` if unambiguous. */
export function resolveUniqueRootPythonUri(rootPath: string): vscode.Uri | undefined {
  const files = listRootPythonEntryFiles(rootPath);

  if (files.length !== 1) {
    return undefined;
  }

  return vscode.Uri.file(files[0]);
}

export type ResolvePythonOperatorContextResult =
  | { kind: 'uri';
    uri: vscode.Uri }
    | { kind: 'none' }
    | { kind: 'ambiguous';
      candidates: vscode.Uri[] };

/**
 * Editor-only URI for run/simulate/debug `target_file`.
 *
 * Split view: focused tab group's active tab only.
 * Single group: active tab if `.py`, or `activeTextEditor` when focus left the editor.
 */
export function resolvePythonOperatorContextUri(ext: string): ResolvePythonOperatorContextResult {
  const { activeTabGroup } = vscode.window.tabGroups;
  const focusedGroupTab = activeTabGroup.activeTab;
  const focusedGroupUri = focusedGroupTab ? tabUriFromTab(focusedGroupTab) : undefined;

  if (focusedGroupUri && uriMatchesExtension(focusedGroupUri, ext)) {
    return {
      kind: 'uri',
      uri: focusedGroupUri,
    };
  }

  if (focusedGroupUri) {
    return { kind: 'none' };
  }

  if (!isSplitEditorView()) {
    const editorUri = activeEditorUriForExtension(ext);

    if (editorUri) {
      return {
        kind: 'uri',
        uri: editorUri,
      };
    }
  }

  return { kind: 'none' };
}

/**
 * True when editor context or a unique root-level `.py` would resolve for `ext`.
 */
export function hasAnyPythonOperatorActiveContext(
  ext: string,
  workspacePath?: string,
): boolean {
  if (resolvePythonOperatorContextUri(ext).kind === 'uri') {
    return true;
  }

  if (workspacePath && resolveUniqueRootPythonUri(workspacePath)) {
    return true;
  }

  return false;
}

export async function pickPythonOperatorUri(
  candidates: vscode.Uri[],
  workspacePath: string | undefined,
): Promise<vscode.Uri | undefined> {
  const items = candidates.map((uri) => {
    const label = workspacePath
      ? toWorkspaceRelativePosixPath(workspacePath, uri.fsPath)
      : uri.fsPath;

    return {
      label,
      uri,
    };
  });

  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select which Python file to use' });

  return picked?.uri;
}

/**
 * Resolve `.py` from editor context, else the sole root-level entry file on disk.
 */
export async function resolveOrPickPythonOperatorUri(
  ext: string,
  workspacePath: string | undefined,
): Promise<vscode.Uri | undefined> {
  const resolved = resolvePythonOperatorContextUri(ext);

  if (resolved.kind === 'uri') {
    return resolved.uri;
  }

  if (resolved.kind === 'ambiguous') {
    return pickPythonOperatorUri(resolved.candidates, workspacePath);
  }

  if (workspacePath) {
    return resolveUniqueRootPythonUri(workspacePath);
  }

  return undefined;
}
