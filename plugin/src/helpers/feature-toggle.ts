import { ConfigHelper } from '@plugin/helpers/ConfigHelper';

const OPERATOR_SUPPORT_KEYS: Record<string, string> = {
  triton: 'operatorSupport.triton',
};

export function isOperatorSupportEnabled(operatorType: string): boolean {
  const normalized = (operatorType || '').trim().toLowerCase();
  const key = OPERATOR_SUPPORT_KEYS[normalized];

  // If no explicit toggle exists for this operator type, treat it as enabled.
  if (!key) {
    return true;
  }

  return ConfigHelper.get<boolean>(key, true);
}
