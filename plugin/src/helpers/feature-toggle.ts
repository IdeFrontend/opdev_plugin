import * as vscode from 'vscode';

const CONFIG_SECTION = 'op-devtools';
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

  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const nextValue = cfg.get<boolean>(key);

  if (typeof nextValue === 'boolean') {
    return nextValue;
  }

  return true;
}
