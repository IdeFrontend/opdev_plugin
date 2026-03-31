import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import { runDataService } from '@plugin/service/run-data-service';
import { viewService } from '@plugin/service/view-service';
import { fileService } from '@plugin/service/file-service';

export const msSanitizerMethods = {
  /**
   * Get anomaly detection running data list
   * @returns {Promise<any[]>} running data list
   */
  async getRunData() {
    return await runDataService.getSanitizerRunData();
  },

  /**
   * Toggle mark status
   * @param params
   */
  async toggleMark(params: { id: string }) {
    return await runDataService.toggleSanitizerMark(params);
  },

  /**
   * Open the anomaly detection data panel
   * @param params - parameters
   */
  openPanel(params: unknown) {
    viewService.openMsSanitizerPanelView(params);
  },

  /**
   * Copy report content to clipboard
   * @param params - parameters, including file path
   */
  async copyReport(params: { path: string }): Promise<void> {
    const { path: filePath } = params;

    if (!filePath) {
      throw new Error(t('msSanitizer.filePathEmpty'));
    }

    try {
      // Create file URI
      const fileUri = vscode.Uri.file(filePath);

      // Check if the file exists
      try {
        await vscode.workspace.fs.stat(fileUri);
      }
      catch {
        throw new Error(t('link.fileNotExist', { path: filePath }));
      }

      // Read file contents
      const fileData = await vscode.workspace.fs.readFile(fileUri);
      const content = Buffer.from(fileData).toString('utf-8');

      // copy to clipboard
      await vscode.env.clipboard.writeText(content);
      vscode.window.showInformationMessage(t('msSanitizer.reportCopied'));
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t('msSanitizer.copyReportFailed', { error: errorMessage }));
      throw error;
    }
  },

  /**
   * Download report file
   * @param params - parameters, including file path
   */
  async downloadReport(params: { path: string }): Promise<void> {
    const { path: filePath } = params;

    if (!filePath) {
      throw new Error(t('msSanitizer.filePathEmpty'));
    }

    // Show download progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('msSanitizer.downloadingReport'),
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          increment: 0,
          message: t('msSanitizer.checkingFile'),
        });

        // Create file URI
        const fileUri = vscode.Uri.file(filePath);

        // Check if the file exists
        try {
          const stat = await vscode.workspace.fs.stat(fileUri);
          if (stat.type !== vscode.FileType.File && stat.type !== vscode.FileType.Directory) {
            throw new Error(t('msSanitizer.pathNotFileOrDir'));
          }
        }
        catch {
          throw new Error(t('link.fileNotExist', { path: filePath }));
        }

        // Get the file name (make sure it is a .zip extension)
        const fileName = path.basename(filePath);
        const zipFileName = fileName.endsWith('.zip')
          ? fileName
          : `${fileName}.zip`;

        progress.report({
          increment: 20,
          message: t('msSanitizer.preparingDownload'),
        });

        try {
          // Use the fileService.saveFileToLocal method, which automatically handles web and desktop versions
          // For individual files, they are automatically copied to a temporary folder and compressed into zip
          const result = await fileService.saveFileToLocal({
            sourcePath: filePath,
            filename: zipFileName,
            dialogTitle: t('msSanitizer.saveFile'),
            allowedTypes: ['zip'],
          });

          if (result) {
            progress.report({
              increment: 100,
              message: t('msSanitizer.downloadComplete'),
            });

            // If it is a desktop version (returns boolean), display a success message
            if (typeof result === 'boolean' && result) {
              vscode.window.showInformationMessage(t('msSanitizer.fileDownloaded'));
            }
            // The web version will be downloaded automatically through the browser without any additional prompts.
          }
          else {
            // User canceled save dialog
            vscode.window.showInformationMessage(t('msSanitizer.downloadCancelled'));
          }
        }
        catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(t('msSanitizer.downloadReportFailed', { error: errorMessage }));
          throw error;
        }
      },
    );
  },
};
