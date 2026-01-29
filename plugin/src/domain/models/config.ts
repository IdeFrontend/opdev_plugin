import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import * as vscode from 'vscode';

function getUserDataDir(): string {
  // 优先从环境变量 WORKSPACK_FLODER 读取路径
  const workspaceFolder = process.env.WORKSPACE_FOLDER;
  
  if (workspaceFolder) {
    const dataDir = path.join(workspaceFolder, 'data', 'ms-op-suite');
    fs.ensureDirSync(dataDir);
    console.log('[getUserDataDir] 使用环境变量 WORKSPACK_FLODER:', workspaceFolder);
    return dataDir;
  }
  
  // 如果环境变量不存在，回退到原来的逻辑
  const home = os.homedir();
  const dataDir = path.join(home, '.vscode-server', 'data', 'ms-op-suite');
  fs.ensureDirSync(dataDir);
  console.log('[getUserDataDir] 使用默认路径:', dataDir,'读取到的workspaceFolder=',workspaceFolder);
  
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
