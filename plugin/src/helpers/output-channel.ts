import * as vscode from 'vscode';

const CHANNEL_NAME = 'Huawei Op Devtools';

let sharedChannel: vscode.OutputChannel | undefined;

export function getHuaweiOpDevtoolsOutputChannel(): vscode.OutputChannel {
  if (!sharedChannel) {
    sharedChannel = vscode.window.createOutputChannel(CHANNEL_NAME);
  }
  return sharedChannel;
}

export function appendLog(
  scope: string,
  message: string,
  payload?: unknown,
): void {
  const channel = getHuaweiOpDevtoolsOutputChannel();
  const timestamp = new Date().toISOString();
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

