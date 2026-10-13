/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as path from 'path';

import { parse as parseJsonc } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';

/**
 * Serialized read-modify-write of workspace `<ide>/settings.json`.
 *
 * Both fs writers of settings.json (`ConfigService.writeOpDevtoolsDottedSettings`
 * and `ensureMsdebugBreakpointFileAssociations`) go through
 * {@link guardedPersistIdeSettingsFile}, which serializes per-path operations
 * (removing the interleaving "last writer wins" race), never throws (writers
 * recover instead of crashing) and skips the write when the serialized result
 * is byte-identical to the current file (content-diff guard — stops
 * `write → event → write` loops).
 *
 * The read is JSONC-tolerant via `jsonc-parser` (a BOM, `//` line and block
 * comments and trailing commas are legal in hand-edited settings files) and a
 * file with any parse error is never overwritten — rebuilding it from `{}`
 * would silently destroy the user's foreign keys.
 */

/** Tolerant read: missing/empty → `{}`; unparseable content → `{}` (never throws). */
export function readIdeSettingsJson(filePath: string): Record<string, unknown> {
  const outcome = readIdeSettingsFile(filePath);

  return outcome.kind === 'ok' ? outcome.value : {};
}

/** @internal Parsed content, or `corrupt` when the file exists but is not parseable JSON. */
type IdeSettingsRead =
  | {
    kind: 'ok';
    value: Record<string, unknown>;
  }
  | {
    kind: 'corrupt';
  };

function readIdeSettingsFile(filePath: string): IdeSettingsRead {
  if (!fs.existsSync(filePath)) {
    return {
      kind: 'ok',
      value: {},
    };
  }

  const raw = fs.readFileSync(filePath, 'utf8');

  if (!raw.trim()) {
    return {
      kind: 'ok',
      value: {},
    };
  }

  const parsed = tryParseSettingsJsonc(raw);

  if (parsed === undefined) {
    return { kind: 'corrupt' };
  }

  return {
    kind: 'ok',
    value: parsed,
  };
}

/**
 * JSONC-tolerant settings.json parse via `jsonc-parser` — the same parser
 * family VS Code itself uses for settings files. A BOM, `//` line and block
 * comments and trailing commas are tolerated, and string escapes
 * (backslash/quote runs, comment-like text inside values) follow JSON rules
 * exactly. Returns `undefined` when the content has any parse error or is not
 * a plain object — callers must NOT treat that as an empty file, because a
 * write would destroy the user's foreign keys.
 */
export function tryParseSettingsJsonc(raw: string): Record<string, unknown> | undefined {
  // A BOM is legal in settings.json but jsonc-parser reports it as an error;
  // strip it explicitly (Node also drops it on utf8 decode, belt and braces).
  const noBom = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const errors: ParseError[] = [];
  const parsed: unknown = parseJsonc(noBom, errors, { allowTrailingComma: true });

  if (errors.length > 0 || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }

  return parsed as Record<string, unknown>;
}

export type GuardedPersistOutcome =
  | {
    next: Record<string, unknown>;
    deleteFile?: never;
  }
  | {
    deleteFile: true;
    next?: never;
  };

/**
 * Read-modify-write inside a per-path promise chain.
 *
 * `buildNext(current)` returns `null` to skip (no write, result `false`),
 * `{ next }` to replace the file with the serialized next content, or
 * `{ deleteFile: true }` to remove the file. Serialization is unified for all
 * writers: `JSON.stringify(next, null, 2) + '\n'`.
 *
 * @returns true when the file was written/deleted, false on skip or error (never throws).
 */
export function guardedPersistIdeSettingsFile(
  filePath: string,
  buildNext: (current: Record<string, unknown>)=> GuardedPersistOutcome | null,
): Promise<boolean> {
  const previous = persistChains.get(filePath) ?? Promise.resolve(false);
  const run = previous.then(() => persistOnce(filePath, buildNext));

  persistChains.set(filePath, run);

  void run.finally(() => {
    if (persistChains.get(filePath) === run) {
      persistChains.delete(filePath);
    }
  });

  return run;
}

/** @internal — reset serialization chains between tests. */
export function resetGuardedPersistChainForTest(): void {
  persistChains.clear();
}

const persistChains = new Map<string, Promise<boolean>>();

async function persistOnce(
  filePath: string,
  buildNext: (current: Record<string, unknown>)=> GuardedPersistOutcome | null,
): Promise<boolean> {
  try {
    const current = readIdeSettingsFile(filePath);

    if (current.kind === 'corrupt') {
      // Never rebuild an unparseable settings.json from `{}` — that would
      // silently destroy the user's foreign keys. The writer backs off and
      // reports a no-op; recovery is a manual fix of the file.
      console.warn('[guardedPersistIdeSettingsFile] refusing to overwrite unparseable settings.json:', filePath);

      return false;
    }

    const outcome = buildNext(current.value);

    if (!outcome) {
      return false;
    }

    if (outcome.deleteFile) {
      await fs.promises.rm(filePath, { force: true });

      return true;
    }

    const serialized = `${JSON.stringify(outcome.next, null, 2)}\n`;

    // Content-diff guard: byte-identical write is a no-op.
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, 'utf8');

      if (existing === serialized) {
        return false;
      }
    }

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    // Atomic write: stage the new content in a sibling temp file and rename it
    // over the target — a crash (or a full disk) between truncate and write
    // can no longer leave the user with an empty or half-written settings.json.
    // rename() within the same directory is atomic on all supported platforms.
    const tempPath = `${filePath}.${process.pid}.tmp`;

    try {
      await fs.promises.writeFile(tempPath, serialized, 'utf8');
      await fs.promises.rename(tempPath, filePath);
    }
    catch (error) {
      await fs.promises.rm(tempPath, { force: true });

      throw error;
    }

    return true;
  }
  catch (error) {
    console.warn('[guardedPersistIdeSettingsFile] failed:', filePath, error);

    return false;
  }
}
