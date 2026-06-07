import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export const IDE_CONFIG_DIR_VSCODE = '.vscode';
export const IDE_CONFIG_DIR_CODEARTS = '.arts';

/** True when running in CodeArts IDE (`vscode.env.uriScheme === 'codearts'`). */
export function isCodeArtsIde(): boolean {
  return (vscode.env.uriScheme || '').toLowerCase() === 'codearts';
}

/** Workspace-local IDE config directory name (`.arts` or `.vscode`). */
export function getIdeConfigDirName(): typeof IDE_CONFIG_DIR_CODEARTS | typeof IDE_CONFIG_DIR_VSCODE {
  return isCodeArtsIde() ? IDE_CONFIG_DIR_CODEARTS : IDE_CONFIG_DIR_VSCODE;
}

export function getIdeConfigDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, getIdeConfigDirName());
}

export function joinIdeConfigPath(workspaceRoot: string, ...segments: string[]): string {
  return path.join(getIdeConfigDir(workspaceRoot), ...segments);
}

/** Relative path under workspace root, e.g. `.arts/settings.json`. */
export function joinIdeConfigRelative(...segments: string[]): string {
  return path.join(getIdeConfigDirName(), ...segments);
}

export function getIdeSettingsFilePath(workspaceRoot: string): string {
  return joinIdeConfigPath(workspaceRoot, 'settings.json');
}

/** Missing, whitespace-only, invalid JSON, or `{}` workspace settings file. */
export function isIdeSettingsFileEmpty(workspaceRoot?: string): boolean {
  const root = workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return true;
  }
  const filePath = getIdeSettingsFilePath(root);
  if (!fs.existsSync(filePath)) {
    return true;
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return true;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(parsed).length === 0;
  }
  catch {
    return true;
  }
}

export function getDevtoolConfigPath(workspaceRoot: string): string {
  return joinIdeConfigPath(workspaceRoot, 'devtool_config.json');
}

/** Legacy workspace-local configs store: `.vscode|op_devtools/data/configs.json`. */
export function getLegacyWorkspaceConfigsFile(workspaceRoot: string): string {
  return path.join(joinIdeConfigPath(workspaceRoot, 'op_devtools'), 'data', 'configs.json');
}

/** Same path when `op_devtools` dir is already resolved (e.g. `config.workspace_data_dir`). */
export function getLegacyWorkspaceConfigsFileFromOpDevtoolsDir(opDevtoolsDir: string): string {
  return path.join(opDevtoolsDir, 'data', 'configs.json');
}

/** Remote/server directory name under the user home, e.g. `.vscode-server` when `uriScheme` is `vscode`. */
export function getIdeServerDirName(): string {
  const scheme = (vscode.env.uriScheme || 'vscode').toLowerCase();
  return `.${scheme}-server`;
}

export function getIdeServerHomeDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, getIdeServerDirName());
}

export function joinIdeServerPath(homeDir: string = os.homedir(), ...segments: string[]): string {
  return path.join(getIdeServerHomeDir(homeDir), ...segments);
}

/** Relative path from home, e.g. `.vscode-server/data/ms-op-suite`. */
export function joinIdeServerRelative(...segments: string[]): string {
  return path.join(getIdeServerDirName(), ...segments);
}
