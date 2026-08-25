import * as path from 'path';

import {
  getProjectByPath,
  normalizeProjectPath,
} from '@plugin/domain/models/project-model';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { viewIdToProjectType } from '@plugin/domain/utils/project-utils';
import { isStandardCustomProjectType } from '@shared/project-type-view-id';
import { readWorkspaceCache } from '@plugin/helpers/workspace-cache';

export type OpRecord = {
  op_name: string;
  op_type: string;
  op_path: string;
};

/**
 * Resolve the operator record for `opName` under `projectPath` from the
 * workspace cache:
 *   1. STANDARD-CUSTOM collections resolve to a single ROOT record
 *      (op_name = project name, op_path = the project root, op_type = 'ascend'):
 *      one root row serves the whole collection and concrete operators are
 *      selected only through the `--ops={operatorNames}` placeholder. A scanned
 *      sub-operator never drives command paths.
 *   2. scan-state entry in `cache.folders[normalizeProjectPath(path)].opsList` /
 *      `.experimentalOpsList`, matched by operator name,
 *   3. root-operator fallback — the project itself acts as its own operator
 *      (the `getConfigSeedOps` root seed shape) — when the project is
 *      recognized but the operator is not a scanned child.
 * Returns `undefined` for paths without any project markers.
 */
export function resolveOpRecord(projectPath: string, opName: string): OpRecord | undefined {
  const cache = readWorkspaceCache(projectPath);
  const folder = cache.folders?.[normalizeProjectPath(projectPath)];
  const project = getProjectByPath(projectPath);
  const scanned = [
    ...(folder?.opsList ?? []),
    ...(folder?.experimentalOpsList ?? []),
  ].find((op) => op.name === opName);

  if (isStandardCustomProjectType(project?.project_type)) {
    return {
      op_name: path.basename(projectPath),
      op_type: 'ascend',
      op_path: projectPath,
    };
  }

  if (scanned) {
    return {
      op_name: scanned.name,
      // The op_type comes from the persisted ops.json row attached to the cache
      // entry — 'cann' for imported rows, 'ascend' for plugin-created ones.
      op_type: scanned.opType ?? synthesizeOpType(project?.project_type),
      op_path: scanned.path,
    };
  }

  if (!project) {
    return undefined;
  }

  return {
    op_name: path.basename(projectPath),
    op_type: synthesizeOpType(project.project_type),
    op_path: projectPath,
  };
}

/**
 * Fallback operator name for `getProfilerTargetFile` / `getRunTargetFile`
 * default-path resolution — the name the target is built for, in priority
 * order (ascend-strategy.ts:320-333, cann / pyasc / triton twins):
 *   1. the explicit `op` (the sidebar selection; a multi-op selection names
 *      ONE binary, so only the first name),
 *   2. the first scanned operator of the record's own path (the build_example
 *      row order),
 *   3. the record's own name.
 * Never the project directory basename: a root-synthesized record's op_name
 * is the basename of the project path — a folder, not an operator — so it
 * counts as absent ('' — the base analog: no target argument at all).
 */
export function resolveFallbackOperatorName(
  operator: OpRecord | null | undefined,
  op: string | null | undefined,
): string {
  const selection = (op || '').split(',')[0]?.trim();

  if (selection) {
    return selection;
  }

  const opPath = operator?.op_path;

  if (opPath) {
    const firstScanned = readWorkspaceCache(opPath)
      .folders?.[normalizeProjectPath(opPath)]?.opsList?.[0]?.name;

    if (firstScanned) {
      return firstScanned;
    }
  }

  const recordName = operator?.op_name ?? '';

  return recordName && recordName !== path.basename(opPath || '')
    ? recordName
    : '';
}

/**
 * Default-path op type for the `getDefaultPaths` fallbacks — the seeded
 * artifact layout of the project (mirrors the seed-time mapping in
 * config-service.ts `ensureOpDevtoolsSettingsSeeded`): standard-custom
 * collections (and the 'ascend-c' view) build via the ascend toolchain
 * and package `build_out/*.run` / `build/test_aclnn_*`, so their default paths
 * resolve through the ascend plugin; everything else resolves through its own
 * plugin.
 */
export function resolveDefaultPathOpType(
  projectType: string | null | undefined,
  opType: string,
): string {
  return isStandardCustomProjectType(projectType)
    || projectType === OperatorProjectType.ASCEND_C
    ? 'ascend'
    : opType;
}

/**
 * Canonical key for `cache.sanitizerPythonTarget` lookups:
 * the operator name — the explicit `op` when given, otherwise the root
 * operator name of `projectPath` (synthesized record), falling back to the
 * directory basename (the creation-side convention, mirroring the
 * `deriveSanitizerPythonTarget` keying by `row.user_options.op`).
 *
 * Every reader AND writer uses this single key resolver so a fresh creation
 * seed (`'python3 ./<name>.py'` for pyasc/triton) and a runtime read with an
 * empty op always hit the same cache entry.
 */
export function sanitizerTargetKeyForOp(projectPath: string, op: string): string {
  if (op) {
    return op;
  }

  return resolveOpRecord(projectPath, '')?.op_name || path.basename(projectPath);
}

/**
 * Map the canonical project type to the plugin-registry op type
 * ('ascend' / 'cann' / 'pyasc' / 'triton') for the root-operator synthesis.
 * Standard-custom collections (the canonical type and the 'ascend' view id)
 * map to 'ascend' — falling back to `project.project_type || 'ascend'`, so a
 * collection whose scan state has no matching entry builds with the ascend
 * command forms. A SCANNED sub-operator never reaches this mapping:
 * `resolveOpRecord` assigns it the row op_type 'cann'. Unknown types fall
 * back to 'ascend'.
 */
function synthesizeOpType(projectType: string | null | undefined): string {
  if (isStandardCustomProjectType(projectType)) {
    return 'ascend';
  }

  return projectType ? viewIdToProjectType(projectType) : 'ascend';
}
