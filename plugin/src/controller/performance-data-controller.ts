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
import AdmZip from 'adm-zip';
import {
  GetPerformanceRunDataParams,
  GetPerformanceRunDataResult,
  MarkRecordParams,
} from '@shared/api-types';
import { runDataService } from '@plugin/service/run-data-service';
import { fileService } from '@plugin/service/file-service';

/**
 * Recursively read the contents of all files in a directory
 */
async function readDirectoryFiles(dirPath: string, basePath: string = dirPath): Promise<string> {
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
  const contents: string[] = [];

  for (const [
    name,
    type,
  ] of entries) {
    const fullPath = path.join(dirPath, name);
    const relativePath = path.relative(basePath, fullPath);

    if (type === vscode.FileType.File) {
      try {
        const fileData = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
        const content = Buffer.from(fileData)
          .toString('utf-8');

        contents.push(`\n========== ${relativePath} ==========\n${content}\n`);
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        contents.push(`\n========== ${relativePath} ==========\n${t('performanceData.fileReadFailedLine', { error: errMsg })}\n`);
      }
    }
    else if (type === vscode.FileType.Directory) {
      const subContent = await readDirectoryFiles(fullPath, basePath);

      contents.push(subContent);
    }
  }

  return contents.join('');
}

/**
 * Recursively add files in a directory to zip
 */
async function addDirectoryToZip(
  zip: AdmZip,
  dirUri: vscode.Uri,
  basePath: string,
): Promise<void> {
  const entries = await vscode.workspace.fs.readDirectory(dirUri);

  for (const [
    name,
    type,
  ] of entries) {
    const entryUri = vscode.Uri.joinPath(dirUri, name);
    const relativePath = path.relative(basePath, entryUri.fsPath);

    if (type === vscode.FileType.File) {
      // Read file contents and add to zip
      const fileData = await vscode.workspace.fs.readFile(entryUri);

      zip.addFile(relativePath, Buffer.from(fileData));
    }
    else if (type === vscode.FileType.Directory) {
      // Process subdirectories recursively
      await addDirectoryToZip(zip, entryUri, basePath);
    }
  }
}

export const performanceMethods = {
  /**
   * Get performance operating data
   * @param params query parameters
   * @returns running data results
   */
  async getRunData(params: GetPerformanceRunDataParams): Promise<GetPerformanceRunDataResult> {
    return await runDataService.getPerformanceRunData(params);
  },

  /**
   * Toggle the marking status of a record
   * @param params mark parameters
   */
  toggleRecordMark(params: MarkRecordParams): void {
    runDataService.togglePerformanceRecordMark(params);
  },

  /**
   * Copy report content to clipboard
   * @param params - parameters, including directory path
   */
  async copyReport(params: { dirPath: string }): Promise<void> {
    const { dirPath } = params;

    if (!dirPath) {
      throw new Error(t('performanceData.dirPathEmpty'));
    }

    try {
      // Create directory URI
      const dirUri = vscode.Uri.file(dirPath);

      // Check if directory exists
      try {
        const stat = await vscode.workspace.fs.stat(dirUri);

        if (stat.type !== vscode.FileType.Directory) {
          throw new Error(t('performanceData.pathNotDir'));
        }
      }
      catch {
        throw new Error(t('performanceData.dirNotExist', { path: dirPath }));
      }

      // Read the contents of all files in the directory
      const content = await readDirectoryFiles(dirPath);

      if (!content.trim()) {
        vscode.window.showWarningMessage(t('performanceData.dirEmptyNoCopy'));

        return;
      }

      // copy to clipboard
      await vscode.env.clipboard.writeText(content);
      vscode.window.showInformationMessage(t('performanceData.reportCopied'));
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(t('performanceData.copyReportFailed', { error: errorMessage }));
      throw error;
    }
  },

  /**
   * Download report file (catalog)
   * @param params - parameters, including directory path
   */
  async downloadReport(params: { dirPath: string }): Promise<void> {
    const { dirPath } = params;

    if (!dirPath) {
      throw new Error(t('performanceData.dirPathEmpty'));
    }

    // Show download progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('performanceData.downloadingReport'),
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          increment: 0,
          message: t('performanceData.checkingDir'),
        });

        // Create directory URI
        const dirUri = vscode.Uri.file(dirPath);

        // Check if directory exists
        try {
          const stat = await vscode.workspace.fs.stat(dirUri);

          if (stat.type !== vscode.FileType.Directory) {
            throw new Error(t('performanceData.pathNotDir'));
          }
        }
        catch {
          throw new Error(t('performanceData.dirNotExist', { path: dirPath }));
        }

        // Get directory name
        const dirName = path.basename(dirPath);
        const zipFileName = `${dirName}.zip`;

        progress.report({
          increment: 20,
          message: t('performanceData.preparingDownload'),
        });

        try {
          // Use the fileService.saveFileToLocal method, which automatically handles web and desktop versions
          const result = await fileService.saveFileToLocal({
            sourcePath: dirPath,
            filename: zipFileName,
            dialogTitle: t('performanceData.saveReportFile'),
            allowedTypes: ['zip'],
          });

          if (result) {
            progress.report({
              increment: 100,
              message: t('performanceData.downloadComplete'),
            });

            // If it is a desktop version (returns boolean), display a success message
            if (typeof result === 'boolean' && result) {
              vscode.window.showInformationMessage(t('performanceData.fileDownloaded'));
            }
            // The web version will be downloaded automatically through the browser without any additional prompts.
          }
          else {
            // User canceled save dialog
            vscode.window.showInformationMessage(t('performanceData.downloadCancelled'));
          }
        }
        catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          vscode.window.showErrorMessage(t('performanceData.downloadReportFailed', { error: errorMessage }));
          throw error;
        }
      },
    );
  },
  async diffFiles(params: any)  {
    console.log('[diffFiles]: comparing file params', params);
    const {
      filePath1, filePath2,
    } = params;

    if (!filePath1 || !filePath2) {
      vscode.window.showErrorMessage(t('performanceData.missingFilePath'));

      return;
    }

    try {
      // Convert file path to VSCode URI
      const fileUri1 = vscode.Uri.file(filePath1);
      const fileUri2 = vscode.Uri.file(filePath2);

      // Use VSCode’s built-in file comparison function
      await vscode.commands.executeCommand(
        'vscode.diff',
        fileUri1,
        fileUri2,
        `对比: ${filePath1.split('/')
          .pop()} ↔ ${filePath2.split('/')
          .pop()}`,
      );

      console.log(`[diffFiles]: opened file diff successfully: ${filePath1} ↔ ${filePath2}`);
    }
    catch (error) {
      console.error('[diffFiles]: Failed to execute file diff command:', error);
      vscode.window.showErrorMessage(t('performanceData.fileCompareFailed', { error: (error as Error).message }));
    }
  },
};
