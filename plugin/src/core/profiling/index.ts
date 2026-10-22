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
