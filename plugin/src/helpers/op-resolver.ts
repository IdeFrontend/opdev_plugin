import { resolveOpRecord } from '@plugin/domain/models/op-record';

/**
 * Resolved operator entry for a builder/spawn context: the operator path plus
 * the op type that routes the strategy. `undefined` means the operator is
 * unknown in the active source (cache folder state / synthesized root record).
 */
export type ResolvedOpEntry = {
  path?: string;
  opType?: string;
};

/**
 * Resolve the operator entry (path + op type) for a project/opName pair from
 * the synthesized op record: cache folder scan state for standard-custom
 * collections, the root-operator fallback for every other project type. The
 * lookup is path-keyed.
 */
export function resolveOpEntryForProject(
  projectPath: string,
  opName: string,
): ResolvedOpEntry | undefined {
  const op = resolveOpRecord(projectPath, opName);

  if (!op) {
    return undefined;
  }

  return {
    path: op.op_path,
    opType: op.op_type,
  };
}
