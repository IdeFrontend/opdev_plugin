import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import * as vscode from 'vscode';

function getUserDataDir(): string {
  const home = os.homedir();
  const dataDir = path.join(home, '.vscode-server', 'data', 'ms-op-suite');
  fs.ensureDirSync(dataDir);
  return dataDir;
}

function getWorkspaceDataDir(): string {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const dataDir = path.join(workspacePath, '.vscode', 'op_devtools');
      fs.ensureDirSync(dataDir);
      return dataDir;
    }
  } catch (e) {
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
  }
};
