export const OperatorProjectViewId = {
  CANN: 1,
  STANDARD_CUSTOM: 2,
  PYASC: 3,
  TRITON: 4,
} as const;

export type OperatorProjectViewIdValue =
  (typeof OperatorProjectViewId)[keyof typeof OperatorProjectViewId];

const operatorProjectViewIdSet = new Set<number>(Object.values(OperatorProjectViewId));
const standardCustomProjectTypeSet = new Set<string>([
  'standard-custom',
  'ascend',
]);

export function isOperatorProjectViewId(value: number): value is OperatorProjectViewIdValue {
  return operatorProjectViewIdSet.has(value);
}

export function isStandardCustomProjectType(projectType?: string | null): boolean {
  const raw = projectType?.trim();

  return raw ? standardCustomProjectTypeSet.has(raw) : false;
}
