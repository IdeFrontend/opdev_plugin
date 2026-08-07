import * as vscode from 'vscode';

import { BRANDING } from '@shared/flavor';

/** @deprecated Use {@link BRANDING.productName} — kept for callers that imported this constant. */
export const OP_DEVTOOLS_TOOL_CHANNEL_PREFIX = BRANDING.productName;

export type OperatorToolOutputLabel =
  | 'compile'
  | 'run'
  | 'simulate'
  | 'sanitizer'
  | 'test'
  | 'debug'
  | 'tool';

let sharedChannel: vscode.OutputChannel | undefined;

const toolChannelsByLabel = new Map<string, vscode.OutputChannel>();

export function getHuaweiOpDevtoolsOutputChannel(): vscode.OutputChannel {
  if (!sharedChannel) {
    sharedChannel = vscode.window.createOutputChannel(BRANDING.productName);
  }

  return sharedChannel;
}

/** One persistent output channel per operation label; cleared when reused for a new run by default. */
export function getOperatorToolOutputChannel(
  label: OperatorToolOutputLabel | string,
  options: { clear?: boolean } = {},
): vscode.OutputChannel {
  const existing = toolChannelsByLabel.get(label);

  if (existing) {
    if (options.clear !== false) {
      existing.clear();
    }

    return existing;
  }

  const channel = vscode.window.createOutputChannel(`${BRANDING.productName}: ${label}`);

  toolChannelsByLabel.set(label, channel);

  return channel;
}

/** Fallback label from operator config type when call sites do not pass an override. */
export function deriveOperatorToolOutputLabel(ctx: {
  configType?: string | null;
}): OperatorToolOutputLabel {
  switch (ctx.configType) {
    case 'build_op':
    case 'build_example':
      return 'compile';
    case 'simulate':
      return 'simulate';
    case 'on_board':
      return 'run';
    case 'ut_test':
      return 'test';
    case 'sanitizer':
      return 'sanitizer';
    default:
      return 'tool';
  }
}

export function appendLog(
  scope: string,
  message: string,
  payload?: unknown,
): void {
  const channel = getHuaweiOpDevtoolsOutputChannel();
  const timestamp = new Date()
    .toISOString();
  const base = `[${scope}] ${timestamp} ${message}`;

  if (payload === undefined) {
    channel.appendLine(base);

    return;
  }

  try {
    channel.appendLine(`${base} ${JSON.stringify(payload)}`);
  }
  catch {
    channel.appendLine(`${base} ${String(payload)}`);
  }
}
