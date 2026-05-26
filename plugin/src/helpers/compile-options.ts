import { homeMethods } from '@plugin/controller/home-controller';

/**
 * Returns `--experimental` when any selected standard-custom operator is experimental.
 */
export async function getCompileOptionForSelectedOperators(): Promise<string | undefined> {
  const selectedIds = await homeMethods.getSelectedOperatorIds() || [];

  if (selectedIds.length === 0) {
    return undefined;
  }

  const multiple = await homeMethods.checkMultipleOperators();

  if (!multiple.isStandardCustom || !multiple.operators) {
    return undefined;
  }

  const selectedSet = new Set(selectedIds);
  const hasExperimental = multiple.operators.some(
    (op) => selectedSet.has(op.id) && op.isExperimental,
  );

  return hasExperimental ? '--experimental' : undefined;
}
