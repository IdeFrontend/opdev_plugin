import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import * as vscode from 'vscode';

import { joinIdeConfigPath, joinIdeServerPath } from '@plugin/helpers/ide-config-dir';

/**
 * Get the value of the environment variable WORKSPACE_FOLDER through the command
 * @returns the value of WORKSPACE_FOLDER, if the acquisition fails or is not set, it returns undefined
 */
export function getWorkspaceFolder(): string | undefined {
  try {
    const platform = os.platform();
    let cmd: string;

    if (platform === 'win32') {
      // Windows: Using PowerShell to obtain environment variables
      cmd = 'powershell -Command "echo $env:WORKSPACE_FOLDER"';
    }
    else {
      // Linux/Mac: Use echo to obtain environment variables
      cmd = 'echo $WORKSPACE_FOLDER';
    }

    const result = execSync(cmd, { encoding: 'utf8' });

    const workspaceFolder = result.trim();

    // If the result is empty or contains only whitespace characters, it is considered unset
    if (!workspaceFolder || workspaceFolder.length === 0) {
      console.log('[getWorkspaceFolder] WORKSPACE_FOLDER is not set or empty');

      return undefined;
    }

    console.log('[getWorkspaceFolder] Obtained WORKSPACE_FOLDER via command:', workspaceFolder);

    return workspaceFolder;
  }
  catch (error) {
    console.warn('[getWorkspaceFolder] Failed to get WORKSPACE_FOLDER:', error);

    return undefined;
  }
}

function getUserDataDir(): string {
  // Obtain the value of the environment variable WORKSPACE_FOLDER through the encapsulated function
  const workspaceFolder = getWorkspaceFolder();

  if (workspaceFolder) {
    // Directly use the path specified by the environment variable without adding additional subdirectories
    fs.ensureDirSync(workspaceFolder);
    console.log('[getUserDataDir] Using WORKSPACE_FOLDER environment variable:', workspaceFolder);

    return workspaceFolder;
  }

  // If the environment variable does not exist, fall back to the original logic
  const home = os.homedir();
  const dataDir = joinIdeServerPath(home, 'data', 'ms-op-suite');

  fs.ensureDirSync(dataDir);
  console.log('[getUserDataDir] Using default path:', dataDir);

  return dataDir;
}

function getWorkspaceDataDir(): string {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const dataDir = joinIdeConfigPath(workspacePath, 'op_devtools');

      fs.ensureDirSync(dataDir);

      return dataDir;
    }
  }
  catch (e) {
    // vscode might not be available or initialized
    console.error('Failed to get workspace data dir:', e);
  }

  return getUserDataDir();
}

const user_data_dir = getUserDataDir();

export default {
  user_data_dir,
  get workspace_data_dir() {
    return getWorkspaceDataDir();
  },
};
