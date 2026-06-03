import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import {
  OPERATOR_OP_TYPE_VALUES,
  type OperatorOpType,
} from '@shared/operator-op-type';

/**
 * Map persisted `projects.json` `project_type` to {@link OperatorProjectType}.
 * Legacy collections use `ascend` for standard-custom roots.
 */
export function normalizeProjectTypeForSpawn(
  stored?: string | null,
): OperatorProjectType | null {
  const raw = stored?.trim();

  if (!raw) {
    return null;
  }

  if (raw === 'ascend') {
    return OperatorProjectType.STANDARD_CUSTOM;
  }

  if ((Object.values(OperatorProjectType) as string[]).includes(raw)) {
    return raw as OperatorProjectType;
  }

  return null;
}

/** Map persisted `ops` row `op_type` to {@link OperatorOpType}. */
export function normalizeOpTypeForSpawn(stored?: string | null): OperatorOpType | null {
  const raw = stored?.trim();

  if (!raw) {
    return null;
  }

  if ((OPERATOR_OP_TYPE_VALUES as readonly string[]).includes(raw)) {
    return raw as OperatorOpType;
  }

  return null;
}
