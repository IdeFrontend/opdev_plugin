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
 * Product `npu-rep` container parser — **160-byte** FileInfo layout.
 *
 * Ported 1:1 from `profiling-report/src/adapters/parseNpuRep160.ts`.
 *
 * This is the format produced by the current `npu-compute` tooling and described
 * by the packer/unpacker scripts. It differs from the interim sample format in
 * [parseNpuRep.ts](./parse-npu-rep.ts) (164-byte FileInfo, `type:u32`, nested
 * `type 6`):
 *
 *  - head is identical (36 bytes), but `fileInfoLength` (offset 20) is **160**
 *  - `type` is a **uint16** (`1` nested, `2` json, `3` jsonl, `4` csv,
 *    `5` sqlite3, `6` protobuf)
 *  - after `type`: `reserved:u16` + `reserved1:u32`
 *  - `fileLength:u64` at 144, `fileRepOffset:u64` at 152
 *
 * The two formats share the `npu-rep\0` magic and are disambiguated by
 * `isNpuRep160` (fileInfoLength === 160).
 */

import { isNpuRep } from './parse-npu-rep';

/** Brand string, without the trailing NUL (matches the 164-byte parser's `header.magic`). */
const MAGIC = 'npu-rep';
/** Exact 8-byte on-disk magic: `npu-rep` + NUL. */
const MAGIC_WITH_NUL = 'npu-rep\0';
const HEAD_SIZE = 36;
const FILEINFO_SIZE = 160;
const SUPPORTED_VERSION = 0x00010000;
const SUPPORTED_ORIGIN = 1;
const KNOWN_TYPES = new Set([
  1,
  2,
  3,
  4,
  5,
  6,
]);

/** `type` value marking a nested per-operator `.npu.rep` archive. */
export const NPU_REP_TYPE_NESTED = 1;

export interface NpuRep160Header {
  magic: string;
  version: number;
  origin: number;
  fileInfoCount: number;
  totalLength: number;
}

export interface NpuRep160FileEntry {
  name: string;
  type: number;
  offset: number;
  length: number;
}

export interface ParsedNpuRep160 {
  header: NpuRep160Header;
  files: NpuRep160FileEntry[];
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
  const end = slice.indexOf(0);

  if (end < 0) {
    throw new Error('[opdevtools profiling] parseNpuRep160: embed name is not null-terminated');
  }

  return new TextDecoder()
    .decode(slice.subarray(0, end));
}

function readSafeU64(view: DataView, offset: number, label: string): number {
  const value = view.getBigUint64(offset, true);

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`[opdevtools profiling] parseNpuRep160: ${label} exceeds Number.MAX_SAFE_INTEGER`);
  }

  return Number(value);
}

/** True when `source` is the 160-byte product layout (magic + `fileInfoLength === 160`). */
export function isNpuRep160(source: ArrayBuffer | Uint8Array): boolean {
  const { bytes } = toDataView(source);

  if (bytes.byteLength < HEAD_SIZE) {
    return false;
  }

  if (readAscii(bytes, 0, 8) !== MAGIC_WITH_NUL) {
    return false;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return view.getUint32(20, true) === FILEINFO_SIZE;
}

/** An embed is a nested operator archive when typed 1 or its payload re-starts an `npu-rep`. */
export function isNestedNpuArchive160(
  entry: NpuRep160FileEntry,
  payload: Uint8Array,
): boolean {
  return entry.type === NPU_REP_TYPE_NESTED || isNpuRep(payload);
}

/**
 * Parse the 160-byte `npu-rep` container. Validation mirrors the product
 * unpacker: head magic/version/origin/reserved, entry magic + safe
 * null-terminated name, known type, zero reserved fields, contiguous payload
 * offsets, and no unreferenced trailing bytes.
 */
export function parseNpuRep160(source: ArrayBuffer | Uint8Array): ParsedNpuRep160 {
  const {
    view, bytes,
  } = toDataView(source);

  if (bytes.byteLength < HEAD_SIZE) {
    throw new Error('[opdevtools profiling] parseNpuRep160: buffer too small for head');
  }

  const magicBytes = readAscii(bytes, 0, 8);

  if (magicBytes !== MAGIC_WITH_NUL) {
    throw new Error(`[opdevtools profiling] parseNpuRep160: bad head magic ${JSON.stringify(magicBytes)}`);
  }

  const version = view.getUint32(8, true);
  const origin = view.getUint16(12, true);
  const repHeadLength = view.getUint16(14, true);
  const fileInfoCount = view.getUint32(16, true);
  const fileInfoLength = view.getUint32(20, true);
  const reserved = view.getUint32(24, true);
  const totalLength = readSafeU64(view, 28, 'npuRepLength');

  if (version !== SUPPORTED_VERSION) {
    throw new Error(`[opdevtools profiling] parseNpuRep160: unsupported version 0x${version.toString(16)} (expected 0x${SUPPORTED_VERSION.toString(16)})`);
  }

  if (origin !== SUPPORTED_ORIGIN) {
    throw new Error(`[opdevtools profiling] parseNpuRep160: unsupported origin ${origin} (expected ${SUPPORTED_ORIGIN})`);
  }

  if (repHeadLength !== HEAD_SIZE) {
    throw new Error(`[opdevtools profiling] parseNpuRep160: unexpected head length ${repHeadLength}`);
  }

  if (fileInfoLength !== FILEINFO_SIZE) {
    throw new Error(`[opdevtools profiling] parseNpuRep160: unexpected file-info length ${fileInfoLength}`);
  }

  if (reserved !== 0) {
    throw new Error(`[opdevtools profiling] parseNpuRep160: head reserved field is not zero (${reserved})`);
  }

  if (totalLength !== bytes.byteLength) {
    throw new Error(`[opdevtools profiling] parseNpuRep160: npuRepLength ${totalLength} != actual size ${bytes.byteLength}`);
  }

  const dataStart = HEAD_SIZE + fileInfoCount * FILEINFO_SIZE;

  if (dataStart > bytes.byteLength) {
    throw new Error('[opdevtools profiling] parseNpuRep160: file info table exceeds input');
  }

  const files: NpuRep160FileEntry[] = [];
  const payloads: Record<string, Uint8Array> = {};
  const seenNames = new Set<string>();
  let expectedOffset = dataStart;

  for (let i = 0; i < fileInfoCount; i++) {
    const pos = HEAD_SIZE + i * FILEINFO_SIZE;
    const fileMagic = readAscii(bytes, pos, 8);

    if (fileMagic !== MAGIC_WITH_NUL) {
      throw new Error(`[opdevtools profiling] parseNpuRep160: bad file magic at index ${i}`);
    }

    const name = readCString(bytes, pos + 8, 128);

    if (!name || name === '.' || name === '..') {
      throw new Error(`[opdevtools profiling] parseNpuRep160: unsafe embed name at index ${i}`);
    }

    if (name.includes('/') || name.includes('\\')) {
      throw new Error(`[opdevtools profiling] parseNpuRep160: embed name contains a path separator: ${JSON.stringify(name)}`);
    }

    if (seenNames.has(name)) {
      throw new Error(`[opdevtools profiling] parseNpuRep160: duplicate embed name ${JSON.stringify(name)}`);
    }

    seenNames.add(name);

    const type = view.getUint16(pos + 136, true);
    const reserved16 = view.getUint16(pos + 138, true);
    const reserved32 = view.getUint32(pos + 140, true);
    const length = readSafeU64(view, pos + 144, `${name}.length`);
    const offset = readSafeU64(view, pos + 152, `${name}.offset`);

    if (!KNOWN_TYPES.has(type)) {
      throw new Error(`[opdevtools profiling] parseNpuRep160: unknown file type ${type} for ${name}`);
    }

    if (reserved16 !== 0 || reserved32 !== 0) {
      throw new Error(`[opdevtools profiling] parseNpuRep160: reserved fields not zero for ${name}`);
    }

    if (offset !== expectedOffset || offset > bytes.byteLength || length > bytes.byteLength - offset) {
      throw new Error(`[opdevtools profiling] parseNpuRep160: invalid payload range for ${name}`);
    }

    files.push({
      name,
      type,
      offset,
      length,
    });
    payloads[name] = bytes.subarray(offset, offset + length);
    expectedOffset += length;
  }

  if (expectedOffset !== bytes.byteLength) {
    throw new Error('[opdevtools profiling] parseNpuRep160: container contains unreferenced payload bytes');
  }

  return {
    header: {
      magic: MAGIC,
      version,
      origin,
      fileInfoCount,
      totalLength,
    },
    files,
    payloads,
  };
}
