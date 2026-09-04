import * as path from 'path';

/** Relative path after stripping a normalized root prefix ('' for the root itself). */
export function stripRootPrefix(normalizedPath: string, normalizedRoot: string): string {
  return normalizedPath.replace(normalizedRoot, '')
    .replace(/^[/\\]/, '');
}

/** True when the normalized path sits under the root's `experimental/` dir. */
export function isUnderExperimentalDir(normalizedPath: string, normalizedRoot: string): boolean {
  return stripRootPrefix(normalizedPath, normalizedRoot)
    .toLowerCase()
    .startsWith('experimental/');
}

/** POSIX-separated path relative to the workspace root. */
export function toWorkspaceRelativePosixPath(workspacePath: string, filePath: string): string {
  return path.relative(workspacePath, filePath)
    .replace(/\\/g, '/');
}
