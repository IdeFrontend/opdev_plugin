import child_process from 'child_process';
import fs from 'fs';

import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import { getConfiguredEnvironmentScriptPath } from '@plugin/helpers/operator-project-workspace-config';
import { appendLog } from '@plugin/helpers/output-channel';

const ASCEND_ENV_LOG_SCOPE = 'op-devtools/ascend-env';

export type SetEnvScriptSource =
  | 'workspace-setting'
  | 'global-env'
  | 'find';

export interface ResolvedSetEnvScript {
  path: string;
  source: SetEnvScriptSource;
}

function logDetectionEnv(message: string): void {
  appendLog(ASCEND_ENV_LOG_SCOPE, message);
}

function isUsableSetEnvScript(path: string): boolean {
  const trimmed = path.trim();

  if (!trimmed) {
    return false;
  }

  try {
    return fs.existsSync(trimmed);
  }
  catch {
    return false;
  }
}

function tryFindCannSetEnvShViaFind(): string | undefined {
  try {
    const findCmd = 'find / -path "*/cann*/set_env.sh" 2>/dev/null | head -1';
    const found = child_process
      .execSync(findCmd, {
        encoding: 'utf8',
        shell: '/bin/bash',
        timeout: 30000,
      })
      .trim();

    return found && isUsableSetEnvScript(found) ? found : undefined;
  }
  catch {
    return undefined;
  }
}

/**
 * CANN `set_env.sh` for host-side `asys` / `npu-smi` detection. Does not mutate
 * `process.env` — the path is only passed into a one-off bash command.
 *
 * Precedence: explicit `environment.environmentScript` → `ASCEND_ENV_SCRIPT`
 * snapshot (launch env) → `find / … set_env.sh`. Project `ascend_env_script` is
 * not read here; it is mirrored into workspace settings via sync.
 */
function resolveFromPath(
  path: string | undefined,
  source: SetEnvScriptSource,
): ResolvedSetEnvScript | undefined {
  if (!path || !isUsableSetEnvScript(path)) {
    return undefined;
  }

  const resolved = {
    path: path.trim(),
    source,
  };

  logDetectionEnv(`SOC detection will source set_env.sh (${source}): ${resolved.path}`);

  return resolved;
}

export function resolveCannSetEnvScriptForDetection(): ResolvedSetEnvScript | undefined {
  const fromWorkspace = resolveFromPath(
    getConfiguredEnvironmentScriptPath(),
    'workspace-setting',
  );

  if (fromWorkspace) {
    return fromWorkspace;
  }

  const fromLaunchEnv = resolveFromPath(
    getGlobalEnvSnapshot().ascendEnvScript,
    'global-env',
  );

  if (fromLaunchEnv) {
    return fromLaunchEnv;
  }

  const found = tryFindCannSetEnvShViaFind();

  if (found) {
    logDetectionEnv(`SOC detection will source set_env.sh (find): ${found}`);

    return {
      path: found,
      source: 'find',
    };
  }

  logDetectionEnv(
    'SOC detection: no usable set_env.sh (workspace, ASCEND_ENV_SCRIPT, or find)',
  );

  return undefined;
}

/** Bash prefix that sources CANN env for a single `execSync` invocation. */
export function shellSourcePrefix(setEnvScriptPath: string): string {
  const escaped = setEnvScriptPath.replace(/'/g, `'\"'\"'`);

  return `source '${escaped}' && `;
}

export function execBashWithCannEnv(
  setEnv: ResolvedSetEnvScript | undefined,
  innerCommand: string,
  timeoutMs: number,
): string {
  const cmd = setEnv
    ? `${shellSourcePrefix(setEnv.path)}${innerCommand}`
    : innerCommand;

  return child_process.execSync(cmd, {
    encoding: 'utf8',
    shell: '/bin/bash',
    timeout: timeoutMs,
  });
}
