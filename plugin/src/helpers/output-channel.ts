/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as vscode from 'vscode';

import { BRANDING } from '@shared/flavor';

/** @deprecated Use {@link BRANDING.productName} — kept for callers that imported this constant. */
export const OP_DEVTOOLS_TOOL_CHANNEL_PREFIX = BRANDING.productName;

export type OperatorToolOutputLabel =
  | 'compile'
  | 'run'
  | 'simulate'
  | 'sanitizer'
  | 'onboard'
  | 'st test'
  | 'ut test'
  | 'dump tensor'
  | 'cpu debug'
  | 'npu debug'
  | 'tool';

let sharedChannel: vscode.OutputChannel | undefined;

const toolChannelsByLabel = new Map<string, vscode.OutputChannel>();

export function getHuaweiOpDevtoolsOutputChannel(): vscode.OutputChannel {
  if (!sharedChannel) {
    sharedChannel = vscode.window.createOutputChannel(BRANDING.productName);
  }

  return sharedChannel;
}

/**
 * One persistent output channel per operation label. A new run APPENDS to the
 * channel by default — repeated runs of the same operation (debug, compile, …)
 * accumulate their output instead of overwriting it (GC-73). Pass
 * `{ clear: true }` when a run must start from a clean channel.
 */
export function getOperatorToolOutputChannel(
  label: OperatorToolOutputLabel | string,
  options: { clear?: boolean } = {},
): vscode.OutputChannel {
  const existing = toolChannelsByLabel.get(label);

  if (existing) {
    if (options.clear === true) {
      existing.clear();
    }

    return existing;
  }

  const channel = vscode.window.createOutputChannel(`${BRANDING.productName}: ${label}`);

  toolChannelsByLabel.set(label, channel);

  return channel;
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
