/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import child_process from 'child_process';
import fs from 'fs';
import path from 'path';

import { getGlobalEnvSnapshot } from '@plugin/domain/utils/global-env-snapshot';
import { getConfiguredEnvironmentScriptPath } from '@plugin/helpers/operator-project-workspace-config';

export type SetEnvScriptSource =
  | 'workspace-setting'
  | 'global-env'
  | 'find';

export interface ResolvedSetEnvScript {
  path: string;
  source: SetEnvScriptSource;
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

function tryFindCannSetEnvShViaCommonPaths(): string | undefined {
  const commonPaths = [
    process.env.ASCEND_HOME_PATH && path.join(process.env.ASCEND_HOME_PATH, 'set_env.sh'),
    '/usr/local/Ascend/ascend-toolkit/latest/set_env.sh',
    '/usr/local/Ascend/set_env.sh',
    '/opt/ascend/ascend-toolkit/latest/set_env.sh',
    '/opt/ascend/set_env.sh',
    '/usr/local/dcmi/set_env.sh',
  ].filter(Boolean) as string[];

  for (const candidatePath of commonPaths) {
    if (isUsableSetEnvScript(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
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

  return {
    path: path.trim(),
    source,
  };
}

/**
 * Same precedence as {@link resolveCannSetEnvScriptForDetection} minus the
 * `find /` fallback, which blocks the extension host for up to 30s through
 * `execSync`. Use it on any path that runs at startup.
 */
export function resolveCannSetEnvScriptWithoutScan(): ResolvedSetEnvScript | undefined {
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

  const fromCommonPaths = tryFindCannSetEnvShViaCommonPaths();

  if (fromCommonPaths) {
    return {
      path: fromCommonPaths,
      source: 'find',
    };
  }

  return undefined;
}

export function resolveCannSetEnvScriptForDetection(): ResolvedSetEnvScript | undefined {
  const withoutScan = resolveCannSetEnvScriptWithoutScan();

  if (withoutScan) {
    return withoutScan;
  }

  const found = tryFindCannSetEnvShViaFind();

  if (found) {
    return {
      path: found,
      source: 'find',
    };
  }

  return undefined;
}

/** Bash prefix that sources CANN env for a single `execSync` invocation. */
export function shellSourcePrefix(setEnvScriptPath: string): string {
  const escaped = setEnvScriptPath.replace(/'/g, '\'\"\'\"\'');

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
