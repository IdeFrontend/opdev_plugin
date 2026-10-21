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

import { SettingsLoader } from '@plugin/service/settings-loader';

/** Companion extension providing the `cannwork.invokeAgent` AI analysis entry. */
export const CANNWORK_EXTENSION_ID = 'cann-pub.cannbot-toolkit';

/** Oldest CANNWork version the profiling-report agent integration works against. */
export const CANNWORK_MIN_VERSION = '2.0.0';

function toVersionTuple(version: string): [number, number, number] {
  const parts = version.split('.')
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);

  return [
    parts[0] ?? 0,
    parts[1] ?? 0,
    parts[2] ?? 0,
  ];
}

export function isCannworkVersionSatisfied(version: string): boolean {
  const [
    a1,
    a2,
    a3,
  ] = toVersionTuple(version);
  const [
    b1,
    b2,
    b3,
  ] = toVersionTuple(CANNWORK_MIN_VERSION);

  return a1 > b1
    || (a1 === b1 && a2 > b2)
    || (a1 === b1 && a2 === b2 && a3 >= b3);
}

function getInstalledCannworkVersion(): string | undefined {
  const existing = vscode.extensions.getExtension(CANNWORK_EXTENSION_ID);

  return existing ? String((existing.packageJSON as { version?: unknown } | undefined)?.version ?? '') : undefined;
}

/**
 * Silently ensures the CANNWork companion extension is usable: installs the
 * marketplace's latest stable release when it is missing or older than
 * {@link CANNWORK_MIN_VERSION}. Users are never prompted, notified or blocked —
 * a failed install is logged only and retried on the next activation; the
 * profiling-report entry keeps its own manual-install error as the fallback.
 */
export async function ensureCannworkExtension(logDebug: (message: string, payload?: unknown)=> void): Promise<void> {
  if (!SettingsLoader.isCannworkAutoInstallEnabled()) {
    logDebug('cannwork:ensure:skipped (setting off)');

    return;
  }

  const installed = getInstalledCannworkVersion();

  if (installed !== undefined && isCannworkVersionSatisfied(installed)) {
    return;
  }

  try {
    // Passing the extension id resolves the marketplace's latest stable
    // version; for an outdated install this acts as a silent upgrade.
    await vscode.commands.executeCommand('workbench.extensions.installExtension', CANNWORK_EXTENSION_ID);
    logDebug('cannwork:ensure:installed', { repairedOldVersion: installed !== undefined });
  }
  catch (error) {
    logDebug('cannwork:ensure:error (retry next activation)', error);
  }
}
