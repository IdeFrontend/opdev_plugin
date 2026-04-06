import * as fs from 'fs';
import * as path from 'path';

/**
 * Checks whether build.sh at the given root directory contains the --bisheng_flags flag.
 * Used to determine whether bisheng-specific compile options should be applied.
 *
 * This is the canonical, path-parameterised version used by plugins and services.
 * It replaces the two previously divergent copies:
 *   - model.ts: no-arg version reading from vscode.workspace.workspaceFolders
 *   - home-controller.ts: path-arg version
 */
export function checkBuildShHasBishengConfig(rootPath: string): boolean {
  const buildShPath = path.join(rootPath, 'build.sh');

  if (!fs.existsSync(buildShPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(buildShPath, 'utf-8');

    return content.includes('--bisheng_flags');
  }
  catch {
    return false;
  }
}
