import { exec } from 'child_process';
import { promisify } from 'util';

import { appendLog } from '@plugin/helpers/output-channel';
import {
  resolveCannSetEnvScriptForDetection,
  shellSourcePrefix,
  type ResolvedSetEnvScript,
} from '@plugin/domain/utils/ascend-detection-env';

const LOG_SCOPE = 'op-devtools/npu-hardware';
const ASYS_TIMEOUT_MS = 30000;
const NPU_SMI_TIMEOUT_MS = 20000;

const execAsync = promisify(exec);

export type NpuHardwareProbeState =
  | { kind: 'pending' }
  | { kind: 'resolved';
    available: boolean };

let probeState: NpuHardwareProbeState = { kind: 'pending' };
let inFlightProbe: Promise<boolean> | undefined;

function logProbe(message: string): void {
  appendLog(LOG_SCOPE, message);
}

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
  timeoutMs: number,
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
  if (!setEnv) {
    return false;
  }

  const result = await execBashWithCannEnvAsync(setEnv, 'asys info -r=status', ASYS_TIMEOUT_MS);

  return probeCommandResponded(result, 'asys');
}

async function tryProbeViaNpuSmi(setEnv: ResolvedSetEnvScript | undefined): Promise<boolean> {
  const result = await execBashWithCannEnvAsync(setEnv, 'npu-smi info', NPU_SMI_TIMEOUT_MS);

  return probeCommandResponded(result, 'npu-smi');
}

async function runNpuHardwareProbe(): Promise<boolean> {
  const setEnv = resolveCannSetEnvScriptForDetection();
  const asysAvailable = await tryProbeViaAsys(setEnv);
  const npuSmiAvailable = await tryProbeViaNpuSmi(setEnv);

  if (asysAvailable || npuSmiAvailable) {
    const via = asysAvailable && npuSmiAvailable
      ? 'asys+npu-smi'
      : asysAvailable
        ? 'asys'
        : 'npu-smi';

    logProbe(`NPU hardware probe: available (via=${via})`);

    return true;
  }

  logProbe('NPU hardware probe: unavailable (asys and npu-smi both unavailable)');

  return false;
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
