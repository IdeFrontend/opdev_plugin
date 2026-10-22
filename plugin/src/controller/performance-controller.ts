/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';

import {
  SelectFolderParams,
  SelectFolderResult,
  SelectFileParams,
  SelectFileResult,
  JumpToFileParams,
} from '@shared/api-types';

import { jumpToFileDiagnosticCollectionId } from '@shared/flavor';

const jumpToFileDiagnosticCollection = vscode.languages.createDiagnosticCollection(jumpToFileDiagnosticCollectionId());

function toDiagnosticMessage(message: string): string {
  const lines = message.split(/\r?\n/);
  const kept: string[] = [];
  let inStackSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (/^\*\*.*stack.*\*\*:/i.test(line) || /^stack:/i.test(line)) {
      inStackSection = true;
      continue;
    }

    if (inStackSection) {
      // Skip stack list items and links under Stack section.
      if (/^[-*]\s+/.test(line) || /^\[.*\]\(.*\)$/.test(line)) {
        continue;
      }

      // If another field starts, leave stack section.
      if (/^\*\*.+\*\*:/.test(line) || /^[A-Za-z][^:]{1,40}:/.test(line)) {
        inStackSection = false;
      }
      else {
        continue;
      }
    }

    kept.push(line);
  }

  return kept
    .join('\n\n')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}

export const performanceDataMethods = {
  /**
   * Select folder
   * @param params selection parameters, including optional default path
   * @returns selected folder path
   */
  async selectFolder(params?: SelectFolderParams): Promise<SelectFolderResult | null> {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: t('common.selectFolder'),
    };

    // If a default path is provided, use it as the initial path
    if (params?.defaultPath) {
      try {
        const defaultUri = vscode.Uri.file(params.defaultPath);
        const stat = await vscode.workspace.fs.stat(defaultUri);

        // If the path is a directory, use it directly
        if (stat.type === vscode.FileType.Directory) {
          options.defaultUri = defaultUri;
        }
        // If the path is a file, use its parent directory
        else {
          options.defaultUri = vscode.Uri.file(path.dirname(params.defaultPath));
        }
      }
      catch {
        // If the path does not exist or is invalid, try using the parent directory
        try {
          const parentPath = path.dirname(params.defaultPath);

          if (parentPath && parentPath !== params.defaultPath) {
            options.defaultUri = vscode.Uri.file(parentPath);
          }
        }
        catch {
          // Ignore errors and use default behavior
        }
      }
    }

    // Call the VS Code native dialog box (supports directory selection)
    const uris = await vscode.window.showOpenDialog(options);

    if (uris && uris[0]) {
      return uris[0].fsPath;
    }

    return null;
  },

  /**
   * Select file
   * @param params selection parameters, including optional default path
   * @returns selected file path
   */
  async selectFile(params?: SelectFileParams): Promise<SelectFileResult | null> {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: t('common.selectFile'),
      filters: {
        [t('common.shellScript')]: ['sh'],
        [t('common.allFiles')]: ['*'],
      },
    };

    // If file types are provided, use them
    if (params?.fileTypes && params.fileTypes.length > 0) {
      params.fileTypes.forEach((fileType) => {
        options.filters![fileType.label] = fileType.extensions;
      });
    }
    else {
      // Default filters
      options.filters![t('common.shellScript')] = ['sh'];
      options.filters![t('common.allFiles')] = ['*'];
    }

    // If a default path is provided, use it as the initial path
    if (params?.defaultPath) {
      try {
        const defaultUri = vscode.Uri.file(params.defaultPath);
        const stat = await vscode.workspace.fs.stat(defaultUri);

        // If the path is a file, use it directly
        if (stat.type === vscode.FileType.File) {
          options.defaultUri = defaultUri;
        }
        // If the path is a directory, use that directory
        else {
          options.defaultUri = defaultUri;
        }
      }
      catch {
        // If the path does not exist, try using the parent directory
        try {
          const parentPath = path.dirname(params.defaultPath);

          if (parentPath && parentPath !== params.defaultPath) {
            options.defaultUri = vscode.Uri.file(parentPath);
          }
        }
        catch {
          // Ignore errors and use default behavior
        }
      }
    }

    // Call the VS Code native dialog box (supports file selection)
    const uris = await vscode.window.showOpenDialog(options);

    if (uris && uris[0]) {
      return uris[0].fsPath;
    }

    return null;
  },

  /**
   * jump to file
   * @param params jump parameters
   */
  async jumpToFile(params: JumpToFileParams): Promise<void> {
    try {
      console.log('jumpToFile', params);
      const {
        fileLink, row, col, errorMessage, errorTitle,
      } = params;
      const uri = vscode.Uri.file(fileLink);

      console.log('uri', uri);
      const document = await vscode.workspace.openTextDocument(uri);

      console.log('document', document);
      const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
      const line = Math.max(0, row - 1);
      const charactor = Math.max(0, col - 1);
      const pos = new vscode.Position(line, charactor);

      // Set cursor position
      editor.selection = new vscode.Selection(pos, pos);

      // Scroll to the target row and center it in the view
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter,
      );

      // Create highlight decorations
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 200, 0, 0.3)', // Yellow translucent background
        border: '1px solid rgba(255, 200, 0, 0.8)', // yellow border
        isWholeLine: true, // Highlight entire line
      });

      // Apply highlighting to target row
      const lineRange = new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line, document.lineAt(line).text.length),
      );

      editor.setDecorations(decorationType, [lineRange]);

      // Put issue details into VS Code's native diagnostics UI (Alt+F8 navigation).
      if (errorTitle || errorMessage) {
        const messageSource = errorMessage || errorTitle || t('performance.errorDetected');
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(pos, pos),
          toDiagnosticMessage(messageSource),
          vscode.DiagnosticSeverity.Warning,
        );

        diagnostic.source = 'Sanitizer';
        jumpToFileDiagnosticCollection.set(document.uri, [diagnostic]);
      }
      else {
        jumpToFileDiagnosticCollection.delete(document.uri);
      }

      // Monitor the change of cursor position and remove the highlight after the cursor "leave the current error position" in the same document
      const targetDocUri = document.uri.toString();
      const targetLine = line;
      const targetChar = charactor;

      const selectionDisposable = vscode.window.onDidChangeTextEditorSelection((e) => {
        // Only focus on the same document
        if (e.textEditor.document.uri.toString() !== targetDocUri) {
          return;
        }

        const selection = e.selections[0];

        if (!selection) {
          return;
        }

        const active = selection.active;

        // If the cursor remains at the current error position, the highlight will not be cleared
        if (active.line === targetLine && active.character === targetChar) {
          return;
        }

        // After the cursor actually moves to another position, remove the highlight
        decorationType.dispose();
        jumpToFileDiagnosticCollection.delete(document.uri);

        selectionDisposable.dispose();
      });
    }
    catch (error) {
      console.log('jumpToFile', error);
      vscode.window.showErrorMessage(t('performance.openFileFailed', { error: String(error) }));
      throw error;
    }
  },
};
