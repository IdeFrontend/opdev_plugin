import * as vscode from 'vscode';

const SECTION = 'op-devtools';
const DEFAULT_ENVIRONMENT_SCRIPT = '/etc/profile';
export const ENVIRONMENT_SCRIPT_SETTING = 'environment.environmentScript';

export function getFirstWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

export function getFirstWorkspaceFolderPath(): string | undefined {
  return getFirstWorkspaceFolder()?.uri.fsPath;
}

export function getOpDevtoolsWorkspaceConfiguration(
  scopeUri?: vscode.Uri,
): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SECTION, scopeUri ?? getFirstWorkspaceFolder()?.uri);
}

/** Workspace override only; `undefined` when the setting was never explicitly set. */
function getExplicitEnvironmentScript(): string | undefined {
  return getConfiguredValue<string>(getOpDevtoolsWorkspaceConfiguration(), [
    ENVIRONMENT_SCRIPT_SETTING,
  ]);
}

type InspectValue<T> =
  | {
    workspaceFolderValue?: T;
    workspaceValue?: T;
  }
  | undefined;

function pickFromInspect<T>(
  inspection: InspectValue<T>,
  fallback: T,
): T {
  if (!inspection) {
    return fallback;
  }
  if (inspection.workspaceFolderValue !== undefined) {
    return inspection.workspaceFolderValue;
  }
  if (inspection.workspaceValue !== undefined) {
    return inspection.workspaceValue;
  }
  return fallback;
}

function isExplicitlySet<T>(
  inspection: InspectValue<T>,
): boolean {
  if (!inspection) {
    return false;
  }
  return inspection.workspaceFolderValue !== undefined
    || inspection.workspaceValue !== undefined;
}

function getConfiguredValue<T>(
  cfg: vscode.WorkspaceConfiguration,
  settingRelativePaths: string[],
): T | undefined {
  for (const relativePath of settingRelativePaths) {
    const inspection = cfg.inspect<T>(relativePath);
    if (isExplicitlySet(inspection)) {
      return pickFromInspect<T>(inspection, undefined as unknown as T);
    }
  }
  return undefined;
}

export function mapSanitizerScopeToUseBlock(scope: string): boolean | undefined {
  if (scope === 'global' || scope === 'Global') {
    return false;
  }
  if (scope === 'singleBlock' || scope === 'Single block') {
    return true;
  }
  return undefined;
}

export function mapKeyValueObjectToAdvanceParams(
  value: unknown,
): Array<Record<string, unknown>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([name, rawValue]) => ({
      name,
      value: rawValue === undefined || rawValue === null ? '' : String(rawValue),
    }));
}

/**
 * Env script path only when the user explicitly set `environment.environmentScript`.
 * Does not return schema defaults such as `/etc/profile` — use for host-side CANN
 * tool discovery (`asys`, `npu-smi`).
 */
export function getConfiguredEnvironmentScriptPath(): string | undefined {
  const explicit = getExplicitEnvironmentScript();

  if (explicit === undefined) {
    return undefined;
  }

  const trimmed = String(explicit).trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Effective env script path from workspace `environment.environmentScript`.
 * Uses the first workspace folder scope when present so folder-level settings apply.
 */
export function getEnvironmentScriptPathFromWorkspace(): string {
  const explicit = getExplicitEnvironmentScript();

  if (explicit !== undefined && String(explicit).trim() !== '') {
    return String(explicit).trim();
  }

  const cfg = getOpDevtoolsWorkspaceConfiguration();
  const primary = cfg.get<string>(ENVIRONMENT_SCRIPT_SETTING, DEFAULT_ENVIRONMENT_SCRIPT)
    ?? DEFAULT_ENVIRONMENT_SCRIPT;

  if (typeof primary === 'string' && primary.trim()) {
    return primary.trim();
  }

  return DEFAULT_ENVIRONMENT_SCRIPT;
}

/** Workspace override for msprof / cann simulator directory name (e.g. Ascend910B3). */
export function getWorkspaceSimulatorType(): string {
  const cfg = getOpDevtoolsWorkspaceConfiguration();
  const explicit = getConfiguredValue<string>(cfg, [
    'performanceTuning.simulation.simulatorType',
  ]);
  if (explicit !== undefined && String(explicit).trim() !== '') {
    return String(explicit).trim();
  }
  return '';
}

export function getEnvironmentSocVersionFromWorkspace(): string {
  const cfg = getOpDevtoolsWorkspaceConfiguration();
  const explicit = getConfiguredValue<string>(cfg, [
    'environment.socVersion',
  ]);
  if (explicit !== undefined && String(explicit).trim() !== '') {
    return String(explicit).trim();
  }
  const primary = cfg.get<string>('environment.socVersion', '') ?? '';
  if (typeof primary === 'string' && primary.trim()) {
    return primary.trim();
  }
  return '';
}

export function getAscendEnvScriptWithWorkspaceOverride(
  storedScript: string | null | undefined,
): string {
  const explicit = getExplicitEnvironmentScript();

  return explicit !== undefined ? String(explicit).trim() : (storedScript || '');
}

export function getSocVersionWithWorkspaceOverride(
  storedSocVersion: string | null | undefined,
): string {
  const cfg = getOpDevtoolsWorkspaceConfiguration();
  const socVersion = getConfiguredValue<string>(cfg, [
    'environment.socVersion',
  ]);
  return socVersion !== undefined ? socVersion : (storedSocVersion || '');
}
