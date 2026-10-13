/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Types for the profiling domain helpers (`npu-rep` parsing + hint join).
 *
 * `PerformanceHintItem` mirrors the profiling-report library shape
 * (`profiling-report/src/domain/types.ts`).
 */

/** One joined performance-hint row; CSV order within each origin is preserved. */
export interface PerformanceHintItem {
  /** `HintMessages.HintMsgText` (RFC-4180 quoted fields decoded by `parseCsv`). */
  message: string;
  /** `HintTypes.HintTypeName` via `HintTypeId`; omitted when unresolved. */
  typeName?: string;
  /** `SourceLineHints.SourceLineId` — raw id string. */
  sourceLineId?: string;
  /** `InstructionHints.PC` — exact decimal digits, never a JS number. */
  pc?: string;
  origin: 'instruction' | 'sourceLine' | 'kernel';
}

/** Best-effort resolution of one `SourceLines`/`DebugInfo`/`SourceFiles` row. */
export interface SourceLineInfo {
  line?: number;
  file?: string;
}

/** Result of `parsePerformanceHints`. */
export interface NpuRepHintParseResult {
  hints: PerformanceHintItem[];
  sourceLines: Map<string, SourceLineInfo>;
}
