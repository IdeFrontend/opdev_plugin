/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Command generation for the A5 replacement prototype profiler tools driven by
 * the "数据采集配置" dialog:
 *   - on-board  → `npu-compute`  (see npu-compute使用文档.md)
 *   - simulation → `npu-emulate` (see NPUSim_使用文档.md; renamed from `npusim`)
 *
 * The dialog's `common.commandLine` textarea is the source of truth for the
 * tool argument body (user-editable). These builders only *augment* that text
 * with the pieces the report link relies on — a stable output location and the
 * compiled target — and never overwrite an option the user already typed.
 */

import type { DataCollectionConfig } from '@shared/data-collection-config';
import {
  NEW_TOOL_REPORT_FILENAME,
  buildNpuComputeSectionFlags,
} from '@shared/data-collection-config';

/** SoC `-s` value NPU-Emulate accepts for the A5 class (see NPUSim doc §5). */
export const NPU_EMULATE_SOC_VERSION = 'Ascend950' as const;

/** Inputs shared by both new-tool command builders. */
export interface NewProfilerCommandParams {
  /** Parsed dialog config; `common.commandLine` is authoritative for tool args. */
  config: DataCollectionConfig;
  /** Compiled executable / run target to profile (from the strategy). */
  targetFile: string;
  /** Absolute per-run opprof directory (`<root>/<ideDir>/opprof/<runId>`) reports land in. */
  opprofRunDir: string;
  /**
   * On-board only: the resolved npu-compute section names (the 8 per-section
   * booleans are the single source of truth). npu-compute's `--section` flags
   * are built from these; ignored by the simulation builder.
   */
  sections?: readonly string[];
}

/** True when the free-text tool args already carry one of the given long/short options. */
function commandLineHasOption(commandLine: string, ...options: string[]): boolean {
  const tokens = (commandLine || '').split(/\s+/)
    .filter(Boolean);

  return tokens.some((token) => options.some((option) => token === option || token.startsWith(`${option}=`)));
}

/**
 * Build the `npu-compute` collection command.
 *
 * Shape (npu-compute doc §4/§5): `npu-compute [options] <target> [target args]`.
 * The `--section <id>` flags are derived from the 8 per-section booleans (the
 * single source of truth, passed as `params.sections`); the user no longer
 * hand-edits them via `commandLine`. We append `--export
 * <opprofRunDir>/result.npu-rep` (always — the section flags carry no output)
 * then the compiled `targetFile`.
 */
export function buildNpuComputeCommand(params: NewProfilerCommandParams): string {
  const {
    targetFile, opprofRunDir, sections = [],
  } = params;

  const sectionFlags = buildNpuComputeSectionFlags(sections);

  const parts = ['npu-compute'];

  if (sectionFlags) {
    parts.push(sectionFlags);
  }

  // Report link relies on a deterministic .npu-rep path. Section flags never
  // carry an output option, so the default export is always appended.
  if (!commandLineHasOption(sectionFlags, '--export', '-o')) {
    parts.push(`--export ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME}`);
  }

  // Target program must come after npu-compute options (doc §5/§8).
  if (targetFile) {
    parts.push(targetFile);
  }

  return parts.join(' ');
}

/**
 * Build the `npu-emulate record` command (auto-generates the report with `-g`).
 *
 * Shape (NPUSim doc §5): `npu-emulate record <user_app> -s Ascend950 -o <output> -g`.
 * The user's `commandLine` text is passed through as extra record options; we
 * append `-s`, `-o <opprofRunDir>` and `-g` only when not already present so the
 * report link finds the artifacts under the shared opprof run directory.
 */
export function buildNpuEmulateCommand(params: NewProfilerCommandParams): string {
  const {
    config, targetFile, opprofRunDir,
  } = params;
  const userArgs = (config.common.commandLine || '').trim();

  const parts = [
    'npu-emulate',
    'record',
  ];

  // user_app is the first positional after `record` (doc §5).
  if (targetFile) {
    parts.push(targetFile);
  }

  if (userArgs) {
    parts.push(userArgs);
  }

  if (!commandLineHasOption(userArgs, '-s', '--soc-version')) {
    parts.push(`-s ${NPU_EMULATE_SOC_VERSION}`);
  }

  if (!commandLineHasOption(userArgs, '-o', '--output')) {
    parts.push(`-o ${opprofRunDir}`);
  }

  // Auto-generate the report right after the simulation (doc §5 `-g`).
  if (!commandLineHasOption(userArgs, '-g', '--gen-report')) {
    parts.push('-g');
  }

  return parts.join(' ');
}
