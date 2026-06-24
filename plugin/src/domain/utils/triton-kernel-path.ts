import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

const LEGACY_KERNEL_OBJECT_NAMES = new Set([
  'kernel.o',
  'kernel_reloc.o',
]);

/** Written by Triton `npu_debug_script` after compile; read before launch.json patch. */
export const TRITON_LAUNCH_KERNEL_PATH_SIDECAR = '.triton_launch_kernel_path';

/** True for msdebug LAUNCH_KERNEL_PATH candidates under ~/.triton/cache (not *.mlirbc). */
export function isTritonKernelArtifact(fileName: string): boolean {
  if (LEGACY_KERNEL_OBJECT_NAMES.has(fileName)) {
    return true;
  }

  return fileName.endsWith('.npubin');
}

/** Derive operator stem from `./add_kernel.py` style script arg. */
export function tritonOperatorStemFromScriptArg(scriptArg: string): string | undefined {
  const base = path.basename(scriptArg);

  if (!base.endsWith('.py') || base === '.py') {
    return undefined;
  }

  return base.slice(0, -3);
}

function matchesOperatorStem(fileName: string, operatorStem: string): boolean {
  if (fileName === `${operatorStem}.npubin`) {
    return true;
  }

  if (fileName.startsWith(`${operatorStem}.`) || fileName.startsWith(`${operatorStem}_`)) {
    return isTritonKernelArtifact(fileName);
  }

  return false;
}

function pickNewest(candidates: Array<{ filePath: string;
  mtimeMs: number }>): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.reduce((best, current) =>
    current.mtimeMs > best.mtimeMs ? current : best).filePath;
}

/**
 * Heuristic: newest kernel artifact under the Triton cache directory.
 * Prefers files matching operatorStem when provided; falls back to global newest.
 */
export function findNewestTritonKernelObject(
  cacheRoot?: string,
  operatorStem?: string,
): string | undefined {
  const root = cacheRoot ?? path.join(os.homedir(), '.triton', 'cache');

  if (!fs.existsSync(root)) {
    return undefined;
  }

  const all: Array<{ filePath: string;
    mtimeMs: number }> = [];

  const visit = (dir: string): void => {
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (!entry.isFile() || !isTritonKernelArtifact(entry.name)) {
        continue;
      }

      let mtimeMs: number;

      try {
        mtimeMs = fs.statSync(fullPath).mtimeMs;
      }
      catch {
        continue;
      }

      all.push({
        filePath: fullPath,
        mtimeMs,
      });
    }
  };

  visit(root);

  if (all.length === 0) {
    return undefined;
  }

  if (operatorStem) {
    const scoped = all.filter((item) => matchesOperatorStem(path.basename(item.filePath), operatorStem));
    const scopedPick = pickNewest(scoped);

    if (scopedPick) {
      return scopedPick;
    }
  }

  return pickNewest(all);
}

/** Read kernel path recorded by the debug pre-build script in `<ide>/.triton_launch_kernel_path`. */
export function readTritonKernelPathSidecar(workspaceRoot: string): string | undefined {
  const sidecarPath = joinIdeConfigPath(workspaceRoot, TRITON_LAUNCH_KERNEL_PATH_SIDECAR);

  if (!fs.existsSync(sidecarPath)) {
    return undefined;
  }

  const raw = fs.readFileSync(sidecarPath, 'utf-8')
    .trim();

  if (!raw || !fs.existsSync(raw)) {
    return undefined;
  }

  return raw;
}

/**
 * Resolve `LAUNCH_KERNEL_PATH` for msdebug: sidecar first, then cache heuristic.
 */
export function resolveTritonLaunchKernelPath(
  workspaceRoot: string,
  operatorStem?: string,
): string | undefined {
  return readTritonKernelPathSidecar(workspaceRoot)
    ?? findNewestTritonKernelObject(undefined, operatorStem);
}

export async function writeTritonKernelPathSidecar(
  workspaceRoot: string,
  kernelPath: string,
): Promise<void> {
  const sidecarPath = joinIdeConfigPath(workspaceRoot, TRITON_LAUNCH_KERNEL_PATH_SIDECAR);

  await fs.ensureDir(path.dirname(sidecarPath));
  await fs.writeFile(sidecarPath, `${kernelPath}\n`, 'utf-8');
}
