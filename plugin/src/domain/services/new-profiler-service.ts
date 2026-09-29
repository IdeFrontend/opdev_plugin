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
 * The builders only *augment* the tool invocation with the pieces the report
 * link relies on — a stable output file location under the per-run opprof
 * directory and the compiled target — and never overwrite an option the user
 * already typed.
 */

import {
  NEW_TOOL_REPORT_FILENAME,
  buildNpuComputeSectionFlags,
} from '@shared/data-collection-config';
import type { DataCollectionConfig } from '@shared/data-collection-config';

/** Inputs shared by both new-tool command builders. */
export interface NewProfilerCommandParams {
  /** Parsed dialog config. */
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
 * Build the `npu-emulate collect` command.
 *
 * Shape: `npu-emulate collect --output <report> <target>`. `collect` runs the
 * compiled target on the SoC simulator and emits the report in one step; it
 * currently takes no metric/section options, so the deterministic report path
 * `<opprofRunDir>/result.npu-rep` is always passed via `--output` (the report
 * link scans that exact file).
 */
export function buildNpuEmulateCommand(params: NewProfilerCommandParams): string {
  const {
    targetFile, opprofRunDir,
  } = params;

  const parts = [
    'npu-emulate',
    'collect',
    `--output ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME}`,
  ];

  // The compiled target is the final positional (the app to simulate).
  if (targetFile) {
    parts.push(targetFile);
  }

  return parts.join(' ');
}
