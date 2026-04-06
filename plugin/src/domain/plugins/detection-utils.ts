import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared filesystem detection helpers for operator project type detection.
 * Extracted from OperatorProjectDetector's private static methods.
 */

export function hasPyFilesInRoot(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    return entries.some((e) => e.isFile() && e.name.endsWith('.py'));
  }
  catch {
    return false;
  }
}

export function hasAscFiles(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.asc')) {
        return true;
      }

      if (entry.isDirectory() && hasAscFilesRecursive(path.join(dirPath, entry.name), 2)) {
        return true;
      }
    }
  }
  catch {
    // ignore
  }

  return false;
}

export function hasAscFilesRecursive(dirPath: string, maxDepth: number): boolean {
  if (maxDepth <= 0) {
    return false;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.asc')) {
        return true;
      }

      if (entry.isDirectory() && maxDepth > 1) {
        if (hasAscFilesRecursive(path.join(dirPath, entry.name), maxDepth - 1)) {
          return true;
        }
      }
    }
  }
  catch {
    // ignore
  }

  return false;
}

/**
 * Walk up at most 3 ancestor directories looking for a build.sh that contains --genop.
 * Mirrors the ancestor-detection logic in OperatorProjectDetector.detectOperatorProject() Path 2.
 */
export function hasAncestorBuildShWithGenop(dirPath: string): boolean {
  try {
    let current = path.dirname(dirPath);

    for (let i = 0; i < 3; i++) {
      const buildSh = path.join(current, 'build.sh');

      if (fs.existsSync(buildSh)) {
        try {
          const content = fs.readFileSync(buildSh, 'utf-8');

          if (content.includes('--genop')) {
            return true;
          }
        }
        catch {
          // ignore read error
        }
      }

      const parent = path.dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }
  }
  catch {
    // ignore
  }

  return false;
}
