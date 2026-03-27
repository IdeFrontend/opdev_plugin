/**
 * Operator project type enum.
 * Extracted here (from operator-project-detector.ts) so that plugin files
 * can import it without creating circular dependencies.
 */
export enum OperatorProjectType {
  STANDARD_CUSTOM = 'standard-custom',
  ASCEND_C = 'ascend-c',
  TORCH_LIBRARY = 'torch-library',
  PYASC = 'pyasc',
  /** Reserved — set by higher-level scan logic, never emitted by detectOperatorProject(). */
  MULTI_PROJECT = 'multi-project',
}
