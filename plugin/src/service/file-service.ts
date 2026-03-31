import { t } from 'i18next';
import fs from 'node:fs';
import path from 'node:path';

import AdmZip from 'adm-zip';
import compressing from 'compressing';
import * as vscode from 'vscode';

import {
  CheckPathExistsParams, SaveFileParams, SaveFileResult,
} from '@shared/api-types';

export class FileService {
  /**
   * Check if the path exists
   */
  pathExists(params: CheckPathExistsParams): Promise<boolean> {
    return new Promise((resolve) => {
      fs.stat(params.path, (err, stats) => {
        if (params.mustFile) {
          resolve(!err && stats.isFile());
        }
        else {
          resolve(!err);
        }
      });
    });
  }

  /**
   * Save file locally
   * The web version returns file data, the desktop version returns boolean
   */
  async saveFileToLocal(params: SaveFileParams): Promise<SaveFileResult> {
    // Check if it is the web version
    const isWeb = vscode.env.uiKind === vscode.UIKind.Web;

    if (isWeb) {
      // Web version: Return file data for front-end downloading
      return await this.saveFileToLocalWeb(params);
    }
    else {
      // Desktop version: uses the original file system API
      return await this.saveFileToLocalDesktop(params);
    }
  }

  /**
   * Web version: Return file data (Base64 encoded) for front-end downloading
   */
  private async saveFileToLocalWeb(params: SaveFileParams): Promise<SaveFileResult> {
    // Also displays a save dialog in the web version, allowing the user to select a save location
    const savingUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.from({
        scheme: 'vscode-local',
        path: params.filename,
      }),
      filters: params.allowedTypes
        ? { default: params.allowedTypes }
        : undefined,
      title: params.dialogTitle ?? t('file.saveTo'),
    });

    if (!savingUri) {
      // User canceled save dialog
      return false;
    }

    // Extract filename from save path
    const selectedFilename = savingUri.path
      .split(/[/\\]/)
      .filter(Boolean)
      .pop() || params.filename;

    const sourceUri = vscode.Uri.file(params.sourcePath);
    let sourceStat: vscode.FileStat;

    try {
      sourceStat = await vscode.workspace.fs.stat(sourceUri);
    }
    catch {
      throw new Error(t('file.saveFailedSourceNotExist'));
    }

    // Try saving directly to a user-selected location (if VSCode Web supports it)
    try {
      if (sourceStat.type === vscode.FileType.File) {
        // Try copying the file directly to the location of the user's choice
        await vscode.workspace.fs.copy(sourceUri, savingUri, { overwrite: true });
        console.log('[FileService] File saved directly to:', savingUri.fsPath);

        return true;
      }
      else if (sourceStat.type === vscode.FileType.Directory) {
        // For directories, compress first, then save
        console.log('[FileService] Start zipping directory:', sourceUri.fsPath);
        const zipBuffer = await this.compressDirectoryWeb(sourceUri);

        console.log('[FileService] Zip completed, zip size:', zipBuffer.length, 'bytes');

        // Write compressed data to a location selected by the user
        await vscode.workspace.fs.writeFile(savingUri, zipBuffer);
        console.log('[FileService] File saved directly to:', savingUri.fsPath);

        return true;
      }
    }
    catch (directSaveError) {
      // If direct saving fails (perhaps due to limitations of the web environment), fall back to browser downloading.
      console.log('[FileService] Direct save failed, falling back to browser download:', directSaveError);

      if (sourceStat.type === vscode.FileType.File) {
        // Read file contents
        const fileData = await vscode.workspace.fs.readFile(sourceUri);

        // Convert Uint8Array to Base64
        const base64 = Buffer
          .from(fileData)
          .toString('base64');

        // Return file data for the front end to download, using the file name selected by the user
        return {
          data: base64,
          filename: selectedFilename,
        };
      }
      else if (sourceStat.type === vscode.FileType.Directory) {
        // Web version: recursively read directories and compress into zip
        const zipBuffer = await this.compressDirectoryWeb(sourceUri);
        const base64 = Buffer
          .from(zipBuffer)
          .toString('base64');

        const result = {
          data: base64,
          filename: selectedFilename,
        };

        console.log('[FileService] Returning result for browser download, filename:', result.filename);

        return result;
      }
    }

    return false;
  }

  /**
   * Web version: recursively read directories and compress into zip
   */
  private async compressDirectoryWeb(dirUri: vscode.Uri): Promise<Buffer> {
    const zip = new AdmZip();
    const basePath = dirUri.fsPath;

    // Read all files in a directory recursively
    await this.addDirectoryToZip(zip, dirUri, basePath);

    // Generate Buffer for zip file
    return zip.toBuffer();
  }

  /**
   * Recursively add files in a directory to zip
   */
  private async addDirectoryToZip(
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
        await this.addDirectoryToZip(zip, entryUri, basePath);
      }
    }
  }

  /**
   * Desktop version: save files locally (original logic)
   */
  private async saveFileToLocalDesktop(params: SaveFileParams): Promise<boolean> {
    const savingUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.from({
        scheme: 'vscode-local',
        path: params.filename,
      }),
      filters: params.allowedTypes
        ? { default: params.allowedTypes }
        : undefined,
      title: params.dialogTitle ?? t('file.saveTo'),
    });

    if (!savingUri) {
      return false;
    }

    const sourceUri = vscode.Uri.file(params.sourcePath);
    let sourceStat: vscode.FileStat;

    try {
      sourceStat = await vscode.workspace.fs.stat(sourceUri);
    }
    catch {
      throw new Error(t('file.saveFailedSourceNotExist'));
    }

    if (sourceStat.type === vscode.FileType.File) {
      await vscode.workspace.fs.copy(sourceUri, savingUri, { overwrite: true });
    }
    else if (sourceStat.type === vscode.FileType.Directory) {
      await compressing.zip.compressDir(
        sourceUri.fsPath,
        `${sourceUri.fsPath}.zip`,
      );
      const zipUri = vscode.Uri.file(`${sourceUri.fsPath}.zip`);

      await vscode.workspace.fs.copy(zipUri, savingUri, { overwrite: true });
      vscode.workspace.fs.delete(zipUri);
    }

    vscode.commands.executeCommand('revealFileInOS', savingUri);

    return true;
  }
}

export const fileService = new FileService();
