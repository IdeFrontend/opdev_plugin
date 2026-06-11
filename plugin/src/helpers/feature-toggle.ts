import { ConfigHelper } from '@plugin/helpers/ConfigHelper';
import {
  getFlavorDefault, isFlavorGated,
} from '@shared/flavor';

const OPERATOR_SUPPORT_KEYS: Record<string, string> = { triton: 'operatorSupport.triton' };

export function isOperatorSupportEnabled(operatorType: string): boolean {
  const normalized = (operatorType || '').trim()
    .toLowerCase();
  const key = OPERATOR_SUPPORT_KEYS[normalized];

  // If no explicit toggle exists for this operator type, treat it as enabled.
  if (!key) {
    return true;
  }

  if (!isFlavorGated('operatorSupport.triton')) {
    return false;
  }

  const configured = ConfigHelper.getOptional<boolean>(key);

  if (configured !== undefined) {
    return configured;
  }

  return getFlavorDefault('operatorSupport.triton') ?? true;
}

export function isSanitizerEnabled(): boolean {
  return true;
}

export function isPerformanceTuningEnabled(): boolean {
  return true;
}

export function isNpuDebugEnabled(): boolean {
  return true;
}

export function isDumpTensorEnabled(): boolean {
  return true;
}

export function isMsAgentAiFixEnabled(): boolean {
  const configured = ConfigHelper.getOptional<boolean>('sanitizer.enableMsAgentAiFix');

  if (configured !== undefined) {
    return configured;
  }

  return false;
}
