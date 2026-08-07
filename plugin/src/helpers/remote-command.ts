import * as path from 'path';
import * as vscode from 'vscode';

import { t } from 'i18next';
import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';
import { startNpuHardwareProbe } from '@plugin/domain/utils/npu-hardware-probe';
import { promisify } from 'util';
import {
  exec, execSync,
} from 'child_process';

const execAsync = promisify(exec);
const REMOTE_TOOL_COMMAND = 'remote_tool.sh';
const REMOTE_TOOL_CONFIG_TIMEOUT_MS = 5000;

export class RemoteToolUnavailableError extends Error {
  public constructor() {
    super(`${REMOTE_TOOL_COMMAND} is not available`);
    this.name = 'RemoteToolUnavailableError';
  }
}

export async function ensureRemoteToolAvailable(): Promise<boolean> {
  try {
    await execAsync(`command -v ${REMOTE_TOOL_COMMAND}`, { shell: '/bin/bash' });

    return true;
  }
  catch {
    await vscode.window.showInformationMessage(
      t('extension.remoteToolRequired'),
      { modal: true },
    );

    return false;
  }
}

export type RemoteToolSeries = 'a2' | 'a3' | 'a5';

export type RemoteToolConfig = {
  host?: string;
  series?: RemoteToolSeries;
};

export function parseRemoteToolConfigOutput(output: string): RemoteToolConfig {
  const seriesMatch = output.match(/SERIES=([^\s]+)/i);
  const hostMatch = output.match(/HOST=([^\s]+)/i);
  const config: RemoteToolConfig = {};

  if (hostMatch) {
    config.host = hostMatch[1];
  }

  if (seriesMatch) {
    const series = seriesMatch[1].toLowerCase();

    if (series === 'a2' || series === 'a3' || series === 'a5') {
      config.series = series;
    }
  }

  return config;
}

export function parseSeriesFromConfigOutput(output: string): RemoteToolSeries | undefined {
  return parseRemoteToolConfigOutput(output).series;
}

export async function getRemoteToolConfig(): Promise<RemoteToolConfig | undefined> {
  try {
    const { stdout } = await execAsync(`${REMOTE_TOOL_COMMAND} config`, {
      encoding: 'utf8',
      shell: '/bin/bash',
      timeout: REMOTE_TOOL_CONFIG_TIMEOUT_MS,
    });

    return parseRemoteToolConfigOutput(stdout);
  }
  catch (error) {
    console.warn('Failed to get remote tool config:', error);
  }

  return undefined;
}

export async function getRemoteToolSeries(): Promise<RemoteToolSeries | undefined> {
  return (await getRemoteToolConfig())?.series;
}

export function getRemoteToolSeriesSync(): RemoteToolSeries | undefined {
  try {
    const stdout = execSync(`${REMOTE_TOOL_COMMAND} config`, {
      encoding: 'utf8',
      shell: '/bin/bash',
      timeout: REMOTE_TOOL_CONFIG_TIMEOUT_MS,
    });

    return parseSeriesFromConfigOutput(stdout);
  }
  catch {
    return undefined;
  }
}

export async function getRemoteToolHost(): Promise<string | undefined> {
  return (await getRemoteToolConfig())?.host;
}

export type OperatorCommandTransformer = (command: string)=> Promise<string>;

export function buildRemoteExecCommand(
  remoteCommand: string,
  pullDir?: string,
): string {
  const args = [
    REMOTE_TOOL_COMMAND,
    'exec',
    // Target remote_tool.sh versions used by all remote OP flows require
    // --progress for verbose progress streaming; do not fall back to -v here.
    '--progress',
    '--command',
    shellQuoteBash(remoteCommand),
  ];

  if (pullDir?.trim()) {
    args.push('--pull-dir', shellQuoteBash(pullDir.trim()));
  }

  return args.join(' ');
}

export function buildRemoteUtCommand(remoteCommand: string): string {
  return buildRemoteExecCommand(remoteCommand);
}

export function buildRemoteBuildExampleCommand(
  remoteCommand: string,
  projectRoot: string | undefined,
): string {
  if (!projectRoot) {
    throw new Error('Project root path not found for remote build artifact retrieval');
  }

  const pullDir = [
    'build',
    'build_out',
  ]
    .map((outputDir) => `${path.resolve(projectRoot, outputDir)
      .replace(/\\/g, '/')}/`)
    .join(',');

  return buildRemoteExecCommand(remoteCommand, pullDir);
}

export function buildRemoteOnBoardCommand(
  remoteCommand: string,
  pullDir: string,
): string {
  return buildRemoteExecCommand(remoteCommand, pullDir);
}

export function buildRemoteDumpTensorCommand(
  remoteCommand: string,
  pullDir: string,
): string {
  return buildRemoteExecCommand(remoteCommand, pullDir);
}

export function buildRemoteStTestCommand(
  remoteCommand: string,
  pullDir: string,
): string {
  return buildRemoteExecCommand(remoteCommand, pullDir);
}

/**
 * Creates a command transformer for flows that can fall back to remote execution.
 * execution.  The caller chooses both the command builder and, when needed,
 * the command predicate; this keeps the shared command executor independent
 * of UT, on-board, and DumpTensor command semantics.
 */
export function createRemoteCommandWhenNoNpuTransformer(
  buildRemoteCommand: (command: string)=> string,
  shouldRunRemotely: (command: string)=> boolean = ()=> true,
): OperatorCommandTransformer {
  return async (command: string): Promise<string> => {
    if (!shouldRunRemotely(command)) {
      return command;
    }

    try {
      if (await startNpuHardwareProbe()) {
        return command;
      }
    }
    catch {
      // A failed probe is treated as no local NPU, consistent with the
      // previous remote-execution fallback.
    }

    if (!await ensureRemoteToolAvailable()) {
      throw new RemoteToolUnavailableError();
    }

    return buildRemoteCommand(command);
  };
}
