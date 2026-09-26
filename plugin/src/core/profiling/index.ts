/**
 * Profiling domain helpers: minimal pure-TS `npu-rep` parsing + the
 * performance-hints join. No `fs` / `vscode` imports — callers own byte I/O.
 */

export { parseCsv } from './parse-csv';

export {
  NPU_TYPE_NESTED_ARCHIVE,
  isNestedNpuArchive,
  isNpuRep,
  npuArchiveStem,
  parseNpuRep,
} from './parse-npu-rep';

export type {
  NpuRepFileEntry, NpuRepHeader, ParsedNpuRep,
} from './parse-npu-rep';

export {
  NPU_REP_TYPE_NESTED,
  isNestedNpuArchive160,
  isNpuRep160,
  parseNpuRep160,
} from './parse-npu-rep-160';

export type {
  NpuRep160FileEntry,
  NpuRep160Header,
  ParsedNpuRep160,
} from './parse-npu-rep-160';

export { parsePerformanceHints } from './npu-rep-hints';

export type {
  NpuRepHintParseResult, PerformanceHintItem, SourceLineInfo,
} from './types';
