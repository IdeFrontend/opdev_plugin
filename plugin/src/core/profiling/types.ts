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
