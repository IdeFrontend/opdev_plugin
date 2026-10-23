/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { exec } from 'child_process';
import { promisify } from 'util';

import {
  resolveCannSetEnvScriptForDetection,
  shellSourcePrefix,
  type ResolvedSetEnvScript,
} from '@plugin/domain/utils/ascend-detection-env';
import { getRemoteToolSeries } from '@plugin/helpers/remote-command';

const ASYS_TIMEOUT_MS = 8000;
const NPU_SMI_TIMEOUT_MS = 8000;
const WHICH_TIMEOUT_MS = 2000;
const REMOTE_PROBE_MAX_ATTEMPTS = 3;

const execAsync = promisify(exec);

export type NpuHardwareProbeState =
  | { kind: 'pending' }
  | { kind: 'resolved';
    available: boolean };

let probeState: NpuHardwareProbeState = { kind: 'pending' };
let inFlightProbe: Promise<boolean> | undefined;

let remoteProbeState: NpuHardwareProbeState = { kind: 'pending' };
let inFlightRemoteProbe: Promise<boolean> | undefined;

type ShellExecResult = {
  stdout: string;
  stderr: string;
};

function isShellCommandMissing(output: string, commandName: string): boolean {
  const text = output.toLowerCase();
  const command = commandName.toLowerCase();

  return text.includes('command not found')
    || text.includes(`${command}: not found`)
    || text.includes('no such file or directory')
    || text.includes('is not recognized as the name of a cmdlet')
    || text.includes('is not recognized as the name of a function, script file, or operable program')
    || (text.includes('is not recognized') && text.includes(command));
}

/**
 * A probe command is "available" when it ran and produced a non-empty response
 * (stdout or stderr). Driver/tool errors such as a busy NPU still count as
 * available — only a missing binary or empty output means unavailable.
 */
export function probeCommandResponded(
  result: ShellExecResult,
  commandName: string,
): boolean {
  const combined = `${result.stdout}\n${result.stderr}`.trim();

  if (!combined) {
    return false;
  }

  if (isShellCommandMissing(combined, commandName)) {
    return false;
  }

  return true;
}

async function execBashWithCannEnvAsync(
  setEnv: ResolvedSetEnvScript | undefined,
  innerCommand: string,
  timeoutMs?: number,
): Promise<ShellExecResult> {
  const cmd = setEnv
    ? `${shellSourcePrefix(setEnv.path)}${innerCommand}`
    : innerCommand;

  try {
    const {
      stdout, stderr,
    } = await execAsync(cmd, {
      encoding: 'utf8',
      shell: '/bin/bash',
      timeout: timeoutMs,
    });

    return {
      stdout: stdout ?? '',
      stderr: stderr ?? '',
    };
  }
  catch (error) {
    const err = error as { stdout?: string;
      stderr?: string };

    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

async function tryProbeViaAsys(setEnv: ResolvedSetEnvScript | undefined): Promise<boolean> {
  const quickWhich = await execBashWithCannEnvAsync(setEnv, 'which asys', WHICH_TIMEOUT_MS);

  if (!quickWhich.stdout.trim()) {
    return false;
  }

  const quickResult = await execBashWithCannEnvAsync(setEnv, 'asys info -r=status', ASYS_TIMEOUT_MS);

  return probeCommandResponded(quickResult, 'asys');
}

async function tryProbeViaNpuSmi(setEnv: ResolvedSetEnvScript | undefined): Promise<boolean> {
  const quickWhich = await execBashWithCannEnvAsync(setEnv, 'which npu-smi', WHICH_TIMEOUT_MS);

  if (!quickWhich.stdout.trim()) {
    return false;
  }

  const quickResult = await execBashWithCannEnvAsync(setEnv, 'npu-smi info', NPU_SMI_TIMEOUT_MS);

  return probeCommandResponded(quickResult, 'npu-smi');
}

// Slow machines may still be loading the environment (PATH etc.) when the first
// attempt runs, so retry on any "unavailable" result before giving up.
async function tryProbeViaRemoteToolConfig(): Promise<boolean> {
  for (let attempt = 1; attempt <= REMOTE_PROBE_MAX_ATTEMPTS; attempt++) {
    const series = await getRemoteToolSeries();

    if (series !== undefined) {
      return true;
    }

    if (attempt < REMOTE_PROBE_MAX_ATTEMPTS) {
      console.warn(`[npu-hardware-probe] remote tool probe attempt ${attempt}/${REMOTE_PROBE_MAX_ATTEMPTS} failed, retrying`);
    }
  }

  return false;
}

async function runNpuHardwareProbe(): Promise<boolean> {
  const setEnv = resolveCannSetEnvScriptForDetection();

  const [
    asysAvailable,
    npuSmiAvailable,
  ] = await Promise.all([
    tryProbeViaAsys(setEnv),
    tryProbeViaNpuSmi(setEnv),
  ]);

  return asysAvailable || npuSmiAvailable;
}

async function runRemoteNpuHardwareProbe(): Promise<boolean> {
  return tryProbeViaRemoteToolConfig();
}

/** True while probe has not finished, or when hardware was detected. */
export function isNpuHardwareProbeAvailable(): boolean {
  if (probeState.kind === 'pending') {
    return true;
  }

  return probeState.available;
}

/** Whether the async probe has completed (available or unavailable). */
export function isNpuHardwareProbeResolved(): boolean {
  return probeState.kind === 'resolved';
}

/**
 * Start (or await) the session NPU hardware probe. Safe to call multiple times;
 * concurrent callers share the same in-flight promise.
 */
export function startNpuHardwareProbe(): Promise<boolean> {
  if (probeState.kind === 'resolved') {
    return Promise.resolve(probeState.available);
  }

  if (inFlightProbe) {
    return inFlightProbe;
  }

  inFlightProbe = runNpuHardwareProbe()
    .then((available) => {
      probeState = {
        kind: 'resolved',
        available,
      };

      return available;
    })
    .finally(() => {
      inFlightProbe = undefined;
    });

  return inFlightProbe;
}

export function isRemoteNpuHardwareProbeAvailable(): boolean {
  if (remoteProbeState.kind === 'pending') {
    return true;
  }

  return remoteProbeState.available;
}

export function isRemoteNpuHardwareProbeResolved(): boolean {
  return remoteProbeState.kind === 'resolved';
}

export function startRemoteNpuHardwareProbe(): Promise<boolean> {
  if (remoteProbeState.kind === 'resolved') {
    return Promise.resolve(remoteProbeState.available);
  }

  if (inFlightRemoteProbe) {
    return inFlightRemoteProbe;
  }

  inFlightRemoteProbe = runRemoteNpuHardwareProbe()
    .then((available) => {
      remoteProbeState = {
        kind: 'resolved',
        available,
      };

      return available;
    })
    .finally(() => {
      inFlightRemoteProbe = undefined;
    });

  return inFlightRemoteProbe;
}

/** @internal */
export function _resetNpuHardwareProbeForTest(): void {
  probeState = { kind: 'pending' };
  inFlightProbe = undefined;
}

/** @internal */
export function _primeNpuHardwareProbeForTest(available: boolean): void {
  probeState = {
    kind: 'resolved',
    available,
  };
  inFlightProbe = undefined;
}

/** @internal */
export function _resetRemoteNpuHardwareProbeForTest(): void {
  remoteProbeState = { kind: 'pending' };
  inFlightRemoteProbe = undefined;
}

/** @internal */
export function _primeRemoteNpuHardwareProbeForTest(available: boolean): void {
  remoteProbeState = {
    kind: 'resolved',
    available,
  };
  inFlightRemoteProbe = undefined;
}

/** @internal */
export function _probeNpuHardwareFromCommandOutputsForTest(outputs: {
  asys?: ShellExecResult;
  npuSmi?: ShellExecResult;
}): boolean {
  const asysAvailable = outputs.asys
    ? probeCommandResponded(outputs.asys, 'asys')
    : false;
  const npuSmiAvailable = outputs.npuSmi
    ? probeCommandResponded(outputs.npuSmi, 'npu-smi')
    : false;

  return asysAvailable || npuSmiAvailable;
}
