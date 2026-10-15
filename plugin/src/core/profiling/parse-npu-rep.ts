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
 * Product `npu-rep` container parser.
 *
 * Ported 1:1 from `profiling-report/src/adapters/parseNpuRep.ts`.
 *
 * `npu-rep` differs from the local sample `cann-rep` packer:
 *  - magic `npu-rep` (7 chars + NUL) instead of `cann-rep`
 *  - head: 36 bytes, `fileInflLength` field (not `offset`) = FileInfo stride
 *  - FileInfo: 164 bytes, `type` is a uint32 (not uint16)
 *  - `type === 6` marks a nested operator archive (`.npu.rep`)
 *
 * A container is either a **flat leaf pack** (trace.json + metric CSVs) or an
 * **outer pack** whose embeds are nested per-operator archives.
 */

const MAGIC = 'npu-rep';
const HEAD_SIZE = 36;
const FILEINFO_SIZE = 164;
const SUPPORTED_VERSION = 0x00010000;

/** `type` value marking a nested per-operator `.npu.rep` archive. */
export const NPU_TYPE_NESTED_ARCHIVE = 6;

export interface NpuRepHeader {
  magic: string;
  version: number;
  fileInfoCount: number;
  totalLength: number;
}

export interface NpuRepFileEntry {
  name: string;
  type: number;
  offset: number;
  length: number;
}

export interface ParsedNpuRep {
  header: NpuRepHeader;
  files: NpuRepFileEntry[];
  /** Raw payloads keyed by basename. */
  payloads: Record<string, Uint8Array>;
}

function toDataView(source: ArrayBuffer | Uint8Array): { view: DataView;
  bytes: Uint8Array } {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);

  return {
    bytes,
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  };
}

function readAscii(bytes: Uint8Array, offset: number, len: number): string {
  return new TextDecoder()
    .decode(bytes.subarray(offset, offset + len));
}

function readCString(bytes: Uint8Array, offset: number, maxLen: number): string {
  const slice = bytes.subarray(offset, offset + maxLen);
  let end = slice.indexOf(0);

  if (end < 0) {
    end = maxLen;
  }

  return new TextDecoder()
    .decode(slice.subarray(0, end));
}

function readSafeU64(view: DataView, offset: number, label: string): number {
  const value = view.getBigUint64(offset, true);

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`[opdevtools profiling] parseNpuRep: ${label} exceeds Number.MAX_SAFE_INTEGER`);
  }

  return Number(value);
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** True when `source` starts with the `npu-rep` magic (distinct from `cann-rep`). */
export function isNpuRep(source: ArrayBuffer | Uint8Array): boolean {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);

  if (bytes.byteLength < MAGIC.length) {
    return false;
  }

  return readAscii(bytes, 0, MAGIC.length) === MAGIC;
}

/** Basename stem of an operator archive: `op1.npu.rep` → `op1`. */
export function npuArchiveStem(name: string): string {
  return name.replace(/\.(?:npu\.rep|rep|npu-rep)$/i, '') || name;
}

/** An embed is a nested operator archive when typed 6 or its payload re-starts an `npu-rep`. */
export function isNestedNpuArchive(entry: NpuRepFileEntry, payload: Uint8Array): boolean {
  return entry.type === NPU_TYPE_NESTED_ARCHIVE || isNpuRep(payload);
}

/** Parse `npu-rep` bytes into head + file entries + payloads. */
export function parseNpuRep(source: ArrayBuffer | Uint8Array): ParsedNpuRep {
  const {
    view, bytes,
  } = toDataView(source);

  if (bytes.byteLength < HEAD_SIZE) {
    throw new Error('[opdevtools profiling] parseNpuRep: buffer too small for head');
  }

  const magicBytes = readAscii(bytes, 0, 8);

  if (!magicBytes.startsWith(MAGIC)) {
    throw new Error(`[opdevtools profiling] parseNpuRep: bad head magic ${JSON.stringify(magicBytes)}`);
  }

  const magic = MAGIC;

  const version = view.getUint32(8, true);
  const repHeadLength = view.getUint16(14, true);
  const fileInfoCount = view.getUint32(16, true);
  const fileInflLength = view.getUint32(20, true);
  const totalLength = readSafeU64(view, 28, 'npuRepLength');

  if (version !== SUPPORTED_VERSION) {
    throw new Error(`[opdevtools profiling] parseNpuRep: unsupported version 0x${version.toString(16)} (expected 0x${SUPPORTED_VERSION.toString(16)})`);
  }

  if (repHeadLength !== HEAD_SIZE) {
    throw new Error(`[opdevtools profiling] parseNpuRep: unexpected head length ${repHeadLength}`);
  }

  if (fileInflLength !== FILEINFO_SIZE) {
    throw new Error(`[opdevtools profiling] parseNpuRep: unexpected file-info length ${fileInflLength}`);
  }

  if (totalLength !== bytes.byteLength) {
    throw new Error(`[opdevtools profiling] parseNpuRep: npuRepLength ${totalLength} != actual size ${bytes.byteLength}`);
  }

  const dataStart = HEAD_SIZE + fileInfoCount * FILEINFO_SIZE;
  const files: NpuRepFileEntry[] = [];
  const payloads: Record<string, Uint8Array> = {};
  const seenNames = new Set<string>();

  for (let i = 0; i < fileInfoCount; i++) {
    const pos = HEAD_SIZE + i * FILEINFO_SIZE;

    if (pos + FILEINFO_SIZE > bytes.byteLength) {
      throw new Error('[opdevtools profiling] parseNpuRep: truncated file info table');
    }

    const fileMagic = readAscii(bytes, pos, 8);

    if (!fileMagic.startsWith(MAGIC)) {
      throw new Error(`[opdevtools profiling] parseNpuRep: bad file magic at index ${i}`);
    }

    const name = readCString(bytes, pos + 8, 128);

    if (!name) {
      throw new Error(`[opdevtools profiling] parseNpuRep: empty embed name at index ${i}`);
    }

    if (seenNames.has(name)) {
      throw new Error(`[opdevtools profiling] parseNpuRep: duplicate embed name ${JSON.stringify(name)}`);
    }

    seenNames.add(name);

    const type = view.getUint32(pos + 136, true);
    const length = readSafeU64(view, pos + 148, `${name}.length`);
    const offset = readSafeU64(view, pos + 156, `${name}.offset`);

    if (offset < dataStart) {
      throw new Error(`[opdevtools profiling] parseNpuRep: ${name} offset ${offset} < data_start ${dataStart}`);
    }

    if (offset + length > bytes.byteLength) {
      throw new Error(`[opdevtools profiling] parseNpuRep: payload out of range for ${name}`);
    }

    for (const prev of files) {
      if (rangesOverlap(offset, offset + length, prev.offset, prev.offset + prev.length)) {
        throw new Error(`[opdevtools profiling] parseNpuRep: overlapping payloads ${JSON.stringify(prev.name)} and ${JSON.stringify(name)}`);
      }
    }

    files.push({
      name,
      type,
      offset,
      length,
    });
    payloads[name] = bytes.subarray(offset, offset + length);
  }

  return {
    header: {
      magic,
      version,
      fileInfoCount,
      totalLength,
    },
    files,
    payloads,
  };
}
