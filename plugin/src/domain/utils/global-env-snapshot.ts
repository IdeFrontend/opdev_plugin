/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { appendLog } from '@plugin/helpers/output-channel';

/**
 * Read-once, frozen snapshot of the OS-level environment variables the plugin
 * cares about for Ascend / CANN operator commands.
 *
 * Captured at module load time so it cannot be polluted by later detection,
 * by sourcing of `ASCEND_ENV_SCRIPT`, or by per-command spawn env that the
 * plugin itself injects. The snapshot is the **only** "global env" the
 * resolver in `ascend-util.ts` considers; anything that mutates `process.env`
 * after import will not affect resolution.
 *
 * The plugin never writes back to `process.env.{SOC_VERSION, SIMULATOR_TYPE,
 * NPU_ARCH}`; operator commands forward resolved values as `export … &&`
 * prefixes in the shell command string (see `operator-command-executor.ts`).
 */

function readOptional(name: string): string | undefined {
  const raw = process.env[name];

  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

export interface GlobalEnvSnapshot {
  readonly socVersion: string | undefined;
  readonly simulatorType: string | undefined;
  readonly npuArch: string | undefined;
  readonly ascendEnvScript: string | undefined;
}

const SNAPSHOT: GlobalEnvSnapshot = Object.freeze({
  socVersion: readOptional('SOC_VERSION'),
  simulatorType: readOptional('SIMULATOR_TYPE'),
  npuArch: readOptional('NPU_ARCH'),
  ascendEnvScript: readOptional('ASCEND_ENV_SCRIPT'),
});

export function getGlobalEnvSnapshot(): GlobalEnvSnapshot {
  return SNAPSHOT;
}

/**
 * Emit a single structured log so reported mismatches between user OS env
 * and resolved values can be debugged from the extension output channel.
 */
export function logGlobalEnvSnapshot(): void {
  const fmt = (value: string | undefined) => (value === undefined ? '<unset>' : value);

  appendLog(
    'op-devtools/ascend-env',
    `global env snapshot: SOC_VERSION=${fmt(SNAPSHOT.socVersion)}`
    + `, SIMULATOR_TYPE=${fmt(SNAPSHOT.simulatorType)}`
    + `, NPU_ARCH=${fmt(SNAPSHOT.npuArch)}`
    + `, ASCEND_ENV_SCRIPT=${fmt(SNAPSHOT.ascendEnvScript)}`,
  );
}
