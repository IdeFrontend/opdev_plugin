/**
 * Runtime `OpRecord.op_type` / command-strategy key.
 * Previously inlined on `CreateOpsByPrototypeParams.opType` in `api-types/ops.d.ts`.
 */
export type OperatorOpType = 'ascend' | 'cann' | 'pyasc' | 'triton';

export const OPERATOR_OP_TYPE_VALUES: readonly OperatorOpType[] = [
  'ascend',
  'cann',
  'pyasc',
  'triton',
];
