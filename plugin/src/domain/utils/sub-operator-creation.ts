/**
 * Decide whether a "create operator" request targets a sub-operator inside an existing
 * standard-custom collection (as opposed to creating a brand-new standalone project).
 *
 * Pure and side-effect free so it can be unit-tested without the filesystem or VS Code.
 * The caller injects the filesystem signal via `hasAncestorGenop`.
 */
export function isSubOperatorCreation(params: {
  /** Absolute path of the operator directory being created. */
  subOpDir: string;
  /** True when the requested project view id is the standard-custom one. */
  isStandardCustomViewId: boolean;
  /** True when an ancestor of subOpDir has build.sh containing --genop. */
  hasAncestorGenop: (dir: string)=> boolean;
}): boolean {
  return params.isStandardCustomViewId && params.hasAncestorGenop(params.subOpDir);
}
