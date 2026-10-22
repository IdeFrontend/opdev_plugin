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
 * Performance hints from an `npu-rep` container (pure TS — no `fs` / `vscode`).
 *
 * Ports the hint join from the profiling-report library
 * (`src/adapters/adaptEmulate.ts` → `idNameMap` / `performanceHintsFromPayloads`)
 * and adds leaf selection for multi-operator packs: an outer pack embeds one
 * nested `.npu.rep` archive per operator, and the caller picks one by
 * `operatorId` (defaulting to the first archive, like the library's default
 * selected operator).
 */

import { parseCsv } from './parse-csv';
import {
  isNestedNpuArchive,
  isNpuRep,
  npuArchiveStem,
  parseNpuRep,
} from './parse-npu-rep';
import {
  isNestedNpuArchive160,
  isNpuRep160,
  parseNpuRep160,
} from './parse-npu-rep-160';
import type {
  NpuRepHintParseResult,
  PerformanceHintItem,
  SourceLineInfo,
} from './types';

/** 160-byte product layout vs the interim 164-byte sample layout. */
type NpuRepFormat = '160' | '164';

/** Accepted payload spellings; lookup is case-insensitive for any other casing. */
const HINT_MESSAGES_NAMES = [
  'HintMessages.csv',
  'hintmessages.csv',
];
const HINT_TYPES_NAMES = [
  'HintTypes.csv',
  'hinttypes.csv',
];
const INSTRUCTION_HINTS_NAMES = [
  'InstructionHints.csv',
  'instructionhints.csv',
];
const SOURCE_LINE_HINTS_NAMES = [
  'SourceLineHints.csv',
  'sourcelinehints.csv',
];
const KERNEL_HINTS_NAMES = [
  'KernelHints.csv',
  'kernelhints.csv',
];
const SOURCE_LINES_NAMES = [
  'SourceLines.csv',
  'sourcelines.csv',
];
const DEBUG_INFO_NAMES = [
  'DebugInfo.csv',
  'debuginfo.csv',
];
const SOURCE_FILES_NAMES = [
  'SourceFiles.csv',
  'sourcefiles.csv',
];

/** Guard against a pathological pack nesting archives without end. */
const MAX_NESTING_DEPTH = 32;

const ERROR_PREFIX = '[opdevtools profiling]';

interface NpuRepLikeFileEntry {
  name: string;
  type: number;
  offset: number;
  length: number;
}

interface NpuRepLikeContainer {
  files: NpuRepLikeFileEntry[];
  payloads: Record<string, Uint8Array>;
}

function emptyHintParseResult(): NpuRepHintParseResult {
  return {
    hints: [],
    sourceLines: new Map(),
  };
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8')
    .decode(bytes);
}

/** Case-insensitive payload lookup, mirroring the library's `payloadEntry`. */
function payloadEntry(
  payloads: Record<string, Uint8Array>,
  names: string[],
): Uint8Array | undefined {
  for (const name of names) {
    if (payloads[name]) {
      return payloads[name];
    }

    const found = Object.keys(payloads)
      .find((k) => k.toLowerCase() === name.toLowerCase());

    if (found) {
      return payloads[found];
    }
  }

  return undefined;
}

function payloadByName(
  payloads: Record<string, Uint8Array>,
  names: string[],
): Uint8Array | undefined {
  return payloadEntry(payloads, names);
}

/** Build id→name map from a two-column dictionary CSV. */
function idNameMap(
  payload: Uint8Array | undefined,
  idCol: string,
  nameCol: string,
): Map<string, string> {
  const out = new Map<string, string>();

  if (!payload) {
    return out;
  }

  const { rows } = parseCsv(decodeUtf8(payload));

  for (const row of rows) {
    const id = (row[idCol] ?? Object.values(row)[0] ?? '').trim();
    const name = (row[nameCol] ?? Object.values(row)[1] ?? '').trim();

    if (id && name) {
      out.set(id, name);
    }
  }

  return out;
}

/**
 * Join the five performance-hint CSVs into `PerformanceHintItem[]`. Rows whose
 * `HintMsgId` does not resolve to a message are skipped; `HintPassed` is
 * ignored. Row order is preserved per table (instruction → source-line →
 * kernel), so the joined list follows the pack layout.
 */
function performanceHintsFromPayloads(payloads: Record<string, Uint8Array>): PerformanceHintItem[] {
  const messages = idNameMap(
    payloadByName(payloads, HINT_MESSAGES_NAMES),
    'HintMsgId',
    'HintMsgText',
  );
  const types = idNameMap(
    payloadByName(payloads, HINT_TYPES_NAMES),
    'HintTypeId',
    'HintTypeName',
  );

  const hints: PerformanceHintItem[] = [];
  const pushRows = (
    payload: Uint8Array | undefined,
    origin: PerformanceHintItem['origin'],
  ): void => {
    if (!payload) {
      return;
    }

    const { rows } = parseCsv(decodeUtf8(payload));

    for (const row of rows) {
      const msgId = (row.HintMsgId ?? '').trim();
      const message = messages.get(msgId);

      if (!message) {
        continue;
      }

      const item: PerformanceHintItem = {
        message,
        origin,
      };
      const typeName = types.get((row.HintTypeId ?? '').trim());

      if (typeName) {
        item.typeName = typeName;
      }

      if (origin === 'instruction') {
        const pc = (row.PC ?? '').trim();

        if (pc) {
          item.pc = pc;
        }
      }
      else if (origin === 'sourceLine') {
        const sourceLineId = (row.SourceLineId ?? '').trim();

        if (sourceLineId) {
          item.sourceLineId = sourceLineId;
        }
      }

      hints.push(item);
    }
  };

  pushRows(payloadByName(payloads, INSTRUCTION_HINTS_NAMES), 'instruction');
  pushRows(payloadByName(payloads, SOURCE_LINE_HINTS_NAMES), 'sourceLine');
  pushRows(payloadByName(payloads, KERNEL_HINTS_NAMES), 'kernel');

  return hints;
}

/**
 * Best-effort `sourceLineId` → `{ line, file }` resolution for the source-line
 * hints actually referenced (`line` from `SourceLines.csv`; `file` from
 * `DebugInfo.csv` + `SourceFiles.csv` when both are packed). A malformed
 * auxiliary CSV must never fail the parse — the hints still come back, only the
 * source-line map degrades to empty.
 */
function buildSourceLines(
  payloads: Record<string, Uint8Array>,
  hints: PerformanceHintItem[],
): Map<string, SourceLineInfo> {
  const out = new Map<string, SourceLineInfo>();

  try {
    const referenced = new Set<string>();

    for (const hint of hints) {
      if (hint.sourceLineId) {
        referenced.add(hint.sourceLineId);
      }
    }

    if (referenced.size === 0) {
      return out;
    }

    const lineById = new Map<string, number>();
    const linesPayload = payloadEntry(payloads, SOURCE_LINES_NAMES);

    if (linesPayload) {
      const { rows } = parseCsv(decodeUtf8(linesPayload));

      for (const row of rows) {
        const id = (row.SourceLineId ?? '').trim();

        if (!id) {
          continue;
        }

        const line = Number((row.SourceLine ?? '').trim());

        if (Number.isFinite(line) && line > 0) {
          lineById.set(id, line);
        }
      }
    }

    const fileIdByLineId = idNameMap(
      payloadEntry(payloads, DEBUG_INFO_NAMES),
      'SourceLineId',
      'SourceFileId',
    );
    const pathByFileId = idNameMap(
      payloadEntry(payloads, SOURCE_FILES_NAMES),
      'SourceFileId',
      'SourceFilePath',
    );

    for (const id of referenced) {
      const info: SourceLineInfo = {};
      const line = lineById.get(id);

      if (line != null) {
        info.line = line;
      }

      const fileId = fileIdByLineId.get(id);
      const file = fileId ? pathByFileId.get(fileId) : undefined;

      if (file) {
        info.file = file;
      }

      if (info.line != null || info.file != null) {
        out.set(id, info);
      }
    }
  }
  catch {
    // Auxiliary tables are optional metadata: degrade, never throw.
    return new Map();
  }

  return out;
}

function parseContainer(bytes: Uint8Array, format: NpuRepFormat): NpuRepLikeContainer {
  if (format === '160') {
    const parsed = parseNpuRep160(bytes);

    return {
      files: parsed.files,
      payloads: parsed.payloads,
    };
  }

  const parsed = parseNpuRep(bytes);

  return {
    files: parsed.files,
    payloads: parsed.payloads,
  };
}

function isNestedEntry(
  format: NpuRepFormat,
  entry: NpuRepLikeFileEntry,
  payload: Uint8Array,
): boolean {
  return format === '160'
    ? isNestedNpuArchive160(entry, payload)
    : isNestedNpuArchive(entry, payload);
}

/**
 * Pick the nested operator archive matching `operatorId` — either the FileInfo
 * name (`op2.npu.rep`) or its archive stem (`op2`). An unmatched id resolves to
 * nothing, and the caller reports an empty parse.
 *
 * A stem shared by two archives (`op1.npu.rep` + `op1.rep`, as the library's
 * duplicate-stem guard also rejects) is ambiguous: picking the first one would
 * silently show another operator's hints, so the parse fails instead.
 */
function findNestedArchive(
  nested: NpuRepLikeFileEntry[],
  operatorId: string,
): NpuRepLikeFileEntry | undefined {
  const exact = nested.find((entry) => entry.name === operatorId);

  if (exact) {
    return exact;
  }

  const byStem = nested.filter((entry) => npuArchiveStem(entry.name) === operatorId);

  if (byStem.length > 1) {
    const names = byStem.map((entry) => JSON.stringify(entry.name))
      .join(' and ');

    throw new Error(`${ERROR_PREFIX} parsePerformanceHints: operator ${JSON.stringify(operatorId)} matches duplicate archives ${names}`);
  }

  return byStem[0];
}

/**
 * Walk nested operator archives down to the flat leaf payload set. A container
 * without nested archives is itself the leaf (all payloads join); an unknown
 * `operatorId` yields `null` (empty result).
 */
function resolveLeafPayloads(
  bytes: Uint8Array,
  format: NpuRepFormat,
  operatorId: string | undefined,
): Record<string, Uint8Array> | null {
  let current = bytes;

  for (let depth = 0; depth < MAX_NESTING_DEPTH; depth++) {
    const parsed = parseContainer(current, format);
    const nested = parsed.files.filter((entry) =>
      isNestedEntry(format, entry, parsed.payloads[entry.name]));

    if (nested.length === 0) {
      return parsed.payloads;
    }

    const picked = operatorId == null
      ? nested[0]
      : findNestedArchive(nested, operatorId);

    if (!picked) {
      return null;
    }

    current = parsed.payloads[picked.name];
  }

  throw new Error(`${ERROR_PREFIX} parsePerformanceHints: nested archives exceed ${MAX_NESTING_DEPTH} levels`);
}

/**
 * Parse the performance hints (plus best-effort source-line resolution) from
 * `.npu-rep` bytes: a flat leaf pack, or an outer pack of nested per-operator
 * archives (`operatorId` picks one; unknown ids yield an empty result, no
 * `operatorId` picks the first archive in file order).
 *
 * Throws when `bytes` is not an `npu-rep` container at all, and when
 * `operatorId` resolves to two archives sharing a stem; a container without
 * hint tables yields `{ hints: [], sourceLines: new Map() }`.
 */
export function parsePerformanceHints(
  bytes: Uint8Array,
  options: { operatorId?: string } = {},
): NpuRepHintParseResult {
  if (!isNpuRep(bytes)) {
    throw new Error(`${ERROR_PREFIX} parsePerformanceHints: input is not an npu-rep container`);
  }

  const format: NpuRepFormat = isNpuRep160(bytes) ? '160' : '164';
  const payloads = resolveLeafPayloads(bytes, format, options.operatorId);

  if (!payloads) {
    return emptyHintParseResult();
  }

  const hints = performanceHintsFromPayloads(payloads);

  return {
    hints,
    sourceLines: buildSourceLines(payloads, hints),
  };
}
