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

export function hasPyFilesRecursive(dirPath: string, maxDepth: number): boolean {
  if (maxDepth < 0) {
    return false;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.py')) {
        return true;
      }

      if (entry.isDirectory() && maxDepth > 0) {
        if (hasPyFilesRecursive(fullPath, maxDepth - 1)) {
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
 * Detect whether Python files contain Triton-specific imports/usages.
 * Keeps scanning shallow and lightweight: recursive `.py` scan up to depth 2.
 */
export function hasTritonPythonIndicatorsInRoot(dirPath: string): boolean {
  function hasTritonMarkersRecursive(scanPath: string, depth: number): boolean {
    if (depth < 0) {
      return false;
    }

    let entries: fs.Dirent[] = [];

    try {
      entries = fs.readdirSync(scanPath, { withFileTypes: true });
    }
    catch {
      return false;
    }

    for (const entry of entries) {
      const fullPath = path.join(scanPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.py')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const hasIndicator =
            /\bimport\s+triton\b/.test(content)
            || /\bfrom\s+triton\b/.test(content)
            || /\btriton\.jit\b/.test(content)
            || /\btriton\.language\b/.test(content)
            || /\btriton\.cdiv\b/.test(content);

          if (hasIndicator) {
            return true;
          }
        }
        catch {
          // ignore single-file read errors
        }
      }

      if (entry.isDirectory() && depth > 0) {
        if (hasTritonMarkersRecursive(fullPath, depth - 1)) {
          return true;
        }
      }
    }

    return false;
  }

  try {
    return hasTritonMarkersRecursive(dirPath, 2);
  }
  catch {
    // ignore
  }

  return false;
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
 * Walk up at most 3 ancestor directories and return the first one whose build.sh
 * contains --genop (the standard-custom collection root), or undefined.
 */
export function findAncestorGenopCollectionRoot(dirPath: string): string | undefined {
  try {
    let current = path.dirname(dirPath);

    for (let i = 0; i < 3; i++) {
      const buildSh = path.join(current, 'build.sh');

      if (fs.existsSync(buildSh)) {
        try {
          const content = fs.readFileSync(buildSh, 'utf-8');

          if (content.includes('--genop')) {
            return current;
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

  return undefined;
}

/**
 * Walk up at most 3 ancestor directories looking for a build.sh that contains --genop.
 * Mirrors the ancestor-detection logic in OperatorProjectDetector.detectOperatorProject() Path 2.
 */
export function hasAncestorBuildShWithGenop(dirPath: string): boolean {
  return findAncestorGenopCollectionRoot(dirPath) !== undefined;
}
