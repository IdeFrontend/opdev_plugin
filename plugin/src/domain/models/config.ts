import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import * as vscode from 'vscode';

/**
 * 通过命令获取环境变量 WORKSPACE_FOLDER 的值
 * @returns WORKSPACE_FOLDER 的值，如果获取失败或未设置则返回 undefined
 */
export function getWorkspaceFolder(): string | undefined {
  try {
    const platform = os.platform();
    let cmd: string;

    if (platform === 'win32') {
      // Windows: 使用 PowerShell 获取环境变量
      cmd = 'powershell -Command "echo $env:WORKSPACE_FOLDER"';
    }
    else {
      // Linux/Mac: 使用 echo 获取环境变量
      cmd = 'echo $WORKSPACE_FOLDER';
    }

    const result = execSync(cmd, { encoding: 'utf8' });

    const workspaceFolder = result.trim();

    // 如果结果为空或只包含空白字符，视为未设置
    if (!workspaceFolder || workspaceFolder.length === 0) {
      console.log('[getWorkspaceFolder] WORKSPACE_FOLDER 未设置或为空');

      return undefined;
    }

    console.log('[getWorkspaceFolder] 通过命令获取 WORKSPACE_FOLDER:', workspaceFolder);

    return workspaceFolder;
  }
  catch (error) {
    console.warn('[getWorkspaceFolder] 获取 WORKSPACE_FOLDER 失败:', error);

    return undefined;
  }
}

function getUserDataDir(): string {
  // 通过封装的函数获取环境变量 WORKSPACE_FOLDER 的值
  const workspaceFolder = getWorkspaceFolder();

  if (workspaceFolder) {
    // 直接使用环境变量指定的路径，不添加额外子目录
    fs.ensureDirSync(workspaceFolder);
    console.log('[getUserDataDir] 使用环境变量 WORKSPACE_FOLDER:', workspaceFolder);

    return workspaceFolder;
  }

  // 如果环境变量不存在，回退到原来的逻辑
  const home = os.homedir();
  const dataDir = path.join(home, '.vscode-server', 'data', 'ms-op-suite');

  fs.ensureDirSync(dataDir);
  console.log('[getUserDataDir] 使用默认路径:', dataDir);

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
