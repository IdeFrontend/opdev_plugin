/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { joinCommands } from '@plugin/domain/utils/command-utils';
import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';
import {
  cloneDefaultStTestArguments,
  validateStTestArgumentTokens,
} from '@shared/st-test-options';
import type { StTestMode } from '@shared/st-test-results';

export type { StTestMode } from '@shared/st-test-results';

export const ST_TEST_MODES = [
  'kernel',
  'aclnn',
  'e2e',
] as const satisfies readonly StTestMode[];

export function normalizeStTestModes(values: readonly string[]): StTestMode[] {
  const normalized = values.map((value) => value.trim()
    .toLowerCase());
  const unknown = [...new Set(normalized.filter((value) => !ST_TEST_MODES.includes(value as StTestMode)))];

  if (unknown.length > 0) {
    throw new Error(`Unsupported ST test mode(s): ${unknown.join(', ')}`);
  }

  const requested = new Set(normalized);

  return ST_TEST_MODES.filter((mode) => requested.has(mode));
}

export function buildPythonPathExport(entries: readonly string[]): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const value = entries.join(':');

  return `export PYTHONDONTWRITEBYTECODE=1 && export PYTHONPATH=${shellQuoteBash(value)}\${PYTHONPATH:+:$PYTHONPATH}`;
}

export function buildSourcedPythonCommand(params: {
  interpreter: string;
  environmentScriptPath?: string;
  pythonPathEntries?: readonly string[];
  args: readonly string[];
}): string {
  const source = params.environmentScriptPath
    ? `. ${shellQuoteBash(params.environmentScriptPath)}`
    : undefined;
  const pythonPath = buildPythonPathExport(params.pythonPathEntries ?? []);
  const invocation = [
    shellQuoteBash(params.interpreter),
    ...params.args.map((arg) => shellQuoteBash(arg)),
  ].join(' ');

  return joinCommands(source, pythonPath, invocation);
}

export function buildStTestCommand(params: {
  interpreter: string;
  environmentScriptPath?: string;
  pythonPathEntries?: readonly string[];
  mode: StTestMode;
  inputCsvPath: string;
  outputCsvPath: string;
  pluginPath: string;
  argumentTokens?: readonly string[];
}): string {
  const rawArgumentTokens = params.argumentTokens
    ?? cloneDefaultStTestArguments(params.mode);
  const validation = validateStTestArgumentTokens(rawArgumentTokens);

  if (!validation.valid) {
    throw new Error(`Invalid ST test argument token (${validation.code})`);
  }

  return buildSourcedPythonCommand({
    interpreter: params.interpreter,
    environmentScriptPath: params.environmentScriptPath,
    pythonPathEntries: params.pythonPathEntries,
    args: [
      '-m',
      'ttk',
      params.mode,
      '-i',
      params.inputCsvPath,
      '-o',
      params.outputCsvPath,
      '--plugin',
      params.pluginPath,
      ...validation.tokens,
    ],
  });
}
