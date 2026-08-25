import * as path from 'path';
import { isStandardCustomProjectType } from '@shared/project-type-view-id';

/**
 * Decide whether a "create operator" request targets a sub-operator inside an existing
 * standard-custom collection (as opposed to creating a brand-new standalone project).
 *
 * Pure and side-effect free so it can be unit-tested without the filesystem or VS Code:
 * callers pass the current workspace root/type and the requested output directory.
 */
export function isSubOperatorCreation(params: {
  /** Absolute path of the operator directory being created. */
  subOpDir: string;
  /** Current workspace root. The new operator must be created under this root. */
  workspaceRoot?: string | null;
  /** True when the requested project view id is the standard-custom one. */
  isStandardCustomViewId: boolean;
  /** Current opened project type. Standard-custom roots created earlier may be stored as "ascend". */
  currentProjectType?: string | null;
}): boolean {
  return params.isStandardCustomViewId
    && isStandardCustomProjectType(params.currentProjectType)
    && isInsideOrEqual(params.subOpDir, params.workspaceRoot);
}

function normalizePathForCompare(value: string): string {
  return path.normalize(value)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function isInsideOrEqual(childPath: string, maybeParentPath?: string | null): boolean {
  if (!childPath || !maybeParentPath) {
    return false;
  }

  const child = normalizePathForCompare(childPath);
  const parent = normalizePathForCompare(maybeParentPath);

  return child === parent || child.startsWith(`${parent}/`);
}
