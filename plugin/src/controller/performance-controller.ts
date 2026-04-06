import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';

import {
  DownloadDataParams,
  DeleteNodeParams,
  SelectFolderParams,
  SelectFolderResult,
  SelectFileParams,
  SelectFileResult,
  JumpToFileParams,
} from '@shared/api-types';

export const performanceDataMethods = {
  /**
   * Download data
   * @param params download parameters
   */
  async downloadData(params: DownloadDataParams): Promise<void> {
    // Use filePath first, if not then use nodeKey
    const remoteFilePath = params.filePath || params.nodeKey;

    if (!remoteFilePath) {
      throw new Error(t('performance.filePathEmpty'));
    }

    // Show download progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('performance.downloadingFile'),
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          increment: 0,
          message: t('performance.readingRemoteFile'),
        });

        // Create a remote file URI
        const remoteFileUri = vscode.Uri.file(remoteFilePath);

        // Check if remote file exists
        try {
          const stat = await vscode.workspace.fs.stat(remoteFileUri);

          progress.report({
            increment: 30,
            message: t('performance.fileSizeKb', {
              size: (stat.size / 1024).toFixed(2),
            }),
          });
        }
        catch {
          throw new Error(t('performance.remoteFileNotExist', { path: remoteFilePath }));
        }

        // Read remote file contents
        progress.report({
          increment: 40,
          message: t('performance.readingFileContent'),
        });
        const fileData = await vscode.workspace.fs.readFile(remoteFileUri);

        // Get file name
        const fileName = path.basename(remoteFilePath);

        progress.report({
          increment: 60,
          message: t('common.selectSaveLocation'),
        });

        // Let users choose a local save location
        const localFileUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(fileName),
          saveLabel: t('common.save'),
          filters: { [t('common.allFiles')]: ['*'] },
        });

        if (!localFileUri) {
          // User canceled save dialog
          return;
        }

        // Write file contents locally
        progress.report({
          increment: 80,
          message: t('common.savingFile'),
        });
        await vscode.workspace.fs.writeFile(localFileUri, fileData);

        progress.report({
          increment: 100,
          message: t('common.downloadComplete'),
        });
        vscode.window.showInformationMessage(t('performance.fileDownloadedTo', { path: localFileUri.fsPath }));
      },
    );
  },

  /**
   * Delete node
   * @param params delete parameters
   */
  async deleteNode(params: DeleteNodeParams): Promise<void> {
    if (!params.nodeKey) {
      throw new Error(t('performance.nodeKeyRequired'));
    }

    // Confirm deletion
    const confirmBtn = t('common.confirm');
    const cancelBtn = t('common.cancel');
    const result = await vscode.window.showWarningMessage(
      t('performance.confirmDelete', { key: params.nodeKey }),
      confirmBtn,
      cancelBtn,
    );

    if (result === confirmBtn) {
      console.log('Delete node:', params.nodeKey, params.filePath);
      vscode.window.showInformationMessage(t('performance.deleted', { key: params.nodeKey }));
    }
  },

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
    } else {
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

      // Build error message display text
      let errorDisplayText = '';

      if (errorTitle || errorMessage) {
        if (errorTitle && errorMessage) {
          errorDisplayText = `${errorTitle}: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`;
        }
        else {
          errorDisplayText = errorTitle || errorMessage || '';
        }
      }

      // Create highlight decorations
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 200, 0, 0.3)', // Yellow translucent background
        border: '1px solid rgba(255, 200, 0, 0.8)', // yellow border
        isWholeLine: true, // Highlight entire line
      });

      // If there is an error message, create an end-of-line decoration to display the error message
      let afterDecorationType: vscode.TextEditorDecorationType | undefined;

      if (errorDisplayText) {
        afterDecorationType = vscode.window.createTextEditorDecorationType({
          after: {
            contentText: `  ⚠ ${errorDisplayText}`,
            color: 'rgba(255, 200, 0, 0.9)',
            fontWeight: 'normal',
            fontStyle: 'italic',
          },
        });
      }

      // Apply highlighting to target row
      const lineRange = new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line, document.lineAt(line).text.length),
      );

      editor.setDecorations(decorationType, [lineRange]);

      // If there is an error message, it is displayed at the end of the line
      if (afterDecorationType && errorDisplayText) {
        const endPos = new vscode.Position(line, document.lineAt(line).text.length);

        editor.setDecorations(afterDecorationType, [{ range: new vscode.Range(endPos, endPos) }]);
      }

      // If there is an error message, display a notification
      if (errorTitle || errorMessage) {
        const notificationMessage = errorTitle || errorMessage || t('performance.errorDetected');

        vscode.window.showInformationMessage(
          notificationMessage,
          { modal: false },
        );
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

        if (afterDecorationType) {
          afterDecorationType.dispose();
        }

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
