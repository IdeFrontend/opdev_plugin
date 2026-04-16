import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve a sanitizer stack/code path to an absolute fs path under the workspace when possible.
 * Used for Problems, jump-to-file, and msAgent index alignment.
 */
export function resolveSanitizerSourceFsPath(
  workspaceRoot: string,
  fileLink?: string,
): string | undefined {
  if (!fileLink || fileLink.trim() === '') {
    return undefined;
  }

  const normalized = path.normalize(fileLink.trim());

  if (path.isAbsolute(normalized) && fs.existsSync(normalized)) {
    return normalized;
  }

  const joined = path.join(workspaceRoot, normalized);
  if (fs.existsSync(joined)) {
    return path.normalize(joined);
  }

  const base = path.basename(normalized);
  const byName = path.join(workspaceRoot, base);
  if (fs.existsSync(byName)) {
    return path.normalize(byName);
  }

  return undefined;
}
