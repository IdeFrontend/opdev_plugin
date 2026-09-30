/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type {
  QuestionType,
  Result,
} from './exception-parser';

// npu-check reports do not map to dedicated question categories yet
const QUESTION_TYPE: QuestionType = 'other';

/**
 * Logger tag prefix of newer npu-check releases (CANN 9.2.0 aclsan), e.g.
 * "npu_check: DIAGNOSTIC" or "npu_check: SUMMARY". The tag prefixes the "="
 * decoration on the first line of every logger message; continuation lines
 * keep the plain "=========" decoration.
 */
const NPU_CHECK_TAG_PATTERN = /^\s*npu[-_]?check:(?:\s*[\w-]+)?\s*/i;

/**
 * A single call-stack frame of an npu-check "Device Frame(s)" section.
 */
export interface NpuCheckStackFrame {
  // Stack frame number (the digits after '#')
  index: number;
  // File path, undefined when the frame carries no recognizable path
  filePath?: string;
  // Line number, undefined when missing or invalid (non-numeric or < 1)
  row?: number;
  // Column number, undefined when missing
  col?: number;
  // Raw frame text (equals prefix and '#N' prefix removed)
  raw: string;
}

/**
 * Find the last whitespace-separated token that looks like a file path
 * (contains a "/" or a "\").
 */
function findPathToken(content: string): string | undefined {
  const tokens = content.split(/\s+/);

  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].includes('/') || tokens[i].includes('\\')) {
      return tokens[i];
    }
  }

  return undefined;
}

/**
 * Parse one cleaned npu-check stack frame line.
 * Frame shapes vary between releases ("#N func in path:line",
 * "#N Device Frame:func in path:line", "#N path:line:col", "#N path:line"),
 * so the parsing never relies on the "in" keyword: row/col are taken from the
 * trailing ":<digits>[:<digits>]" and the path from the last path-like token
 * of the remaining prefix.
 * @param line cleaned frame line (equals prefix and whitespace already stripped)
 * @returns the parsed frame, or null when the line is not a frame
 */
export function parseNpuCheckStackFrame(line: string): NpuCheckStackFrame | null {
  const frameMatch = line.match(/^#(\d+)\s+(.+)$/);

  if (!frameMatch) {
    return null;
  }

  const index = parseInt(frameMatch[1], 10);
  const raw = frameMatch[2].trim();
  let filePath: string | undefined;
  let row: number | undefined;
  let col: number | undefined;

  // Try to extract the trailing ":<row>[:<col>]" first.
  const tailMatch = raw.match(/:(\d+)(?::(\d+))?\s*$/);

  if (tailMatch) {
    const prefix = raw.slice(0, raw.length - tailMatch[0].length);
    const parsedRow = parseInt(tailMatch[1], 10);

    if (!Number.isNaN(parsedRow) && parsedRow >= 1) {
      row = parsedRow;

      if (tailMatch[2] !== undefined) {
        col = parseInt(tailMatch[2], 10);
      }
    }

    filePath = findPathToken(prefix);
  }
  else {
    // No trailing row number: fall back to the last path-like token and cut it
    // at its first colon (tolerates entries such as "path/file.cu:abc").
    const token = findPathToken(raw);

    if (token !== undefined) {
      const colonIndex = token.indexOf(':');

      filePath = colonIndex >= 0 ? token.slice(0, colonIndex) : token;
    }
  }

  return {
    index,
    filePath,
    row,
    col,
    raw,
  };
}

/**
 * True when `filePath` is located inside `projectRoot` (both may use either
 * separator style; Windows paths compare case-insensitively).
 */
function isPathInsideProject(filePath: string, projectRoot: string): boolean {
  const normFile = filePath.replace(/\\/g, '/')
    .replace(/\/+$/, '');
  const normRoot = projectRoot.replace(/\\/g, '/')
    .replace(/\/+$/, '');
  const isWindowsPath = /^[A-Za-z]:\//.test(normFile) || /^[A-Za-z]:\//.test(normRoot);
  const file = isWindowsPath ? normFile.toLowerCase() : normFile;
  const root = isWindowsPath ? normRoot.toLowerCase() : normRoot;

  return file === root || file.startsWith(`${root}/`);
}

/**
 * Internal state of the exception block currently being collected.
 */
interface CurrentBlock {
  type: 'error' | 'warning';
  exceptionName: string;
  // Bracketed group tag after ERROR:/WARNING: (e.g. "[MEMCHECK]"), when present
  groupName?: string;
  rawLines: string[];
  frames: NpuCheckStackFrame[];
  stackStarted: boolean;
}

/**
 * Anomaly detection result parser for npu-check logs.
 * npu-check decorates every line with a variable-length "=" prefix and reports
 * issues as "ERROR:"/"WARNING:" blocks, optionally followed by a
 * "Device Frame(s):" call-stack section whose "#N" frames count up from the
 * stack top. Newer releases (CANN 9.2.0 aclsan) additionally prefix the first
 * line of every logger message with a "npu_check: <LEVEL>" tag; metadata
 * messages such as "npu_check: SUMMARY" carry no diagnostic content. A
 * bracketed tag right after the severity prefix ("ERROR:[MEMCHECK] ...")
 * carries the problem group and is parsed into `groupName`. The jump target is
 * the first frame (smallest index) whose file is located inside the configured
 * project directory (`matchPath`); when no frame matches (or no matchPath is
 * given) it falls back to the first frame that resolves a file path, unlike
 * the mssanitizer parser which prefers the deepest frame.
 */
export class NpuCheckParser {
  private results: Result[] = [];
  private currentResult: CurrentBlock | null = null;
  private matchPath = '';

  constructor(config?: Record<string, string>) {
    if (config?.matchPath) {
      this.matchPath = config.matchPath;
    }
  }

  /**
   * Parse a complete npu-check log and return all detected issues.
   * The parser state is reset on every call, so the instance is reusable.
   * @param content full log content, lines separated by newlines
   * @returns parsed result list
   */
  public parseAll(content: string): Result[] {
    this.reset();

    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      this.processLine(line);
    }

    this.finalizeCurrentResult();

    return this.results;
  }

  /**
   * Reset parser state
   */
  public reset(): void {
    this.results = [];
    this.currentResult = null;
  }

  /**
   * Process a single raw log line
   * @param line one line of npu-check console output (may contain the "=" prefix)
   */
  private processLine(line: string): void {
    const cleaned = this.cleanLine(line);

    // Blank lines (and pure "=" decoration lines) end the current block and
    // never become part of a result.
    if (!cleaned) {
      this.finalizeCurrentResult();

      return;
    }

    // A new exception block starts with "ERROR:" or "WARNING:", optionally
    // followed by a bracketed group tag: "ERROR:[MEMCHECK] <message>".
    const blockStart = cleaned.match(/^(ERROR|WARNING):\s*(.*)$/i);

    if (blockStart) {
      this.finalizeCurrentResult();

      const rest = blockStart[2].trim();
      const groupMatch = rest.match(/^\[([^\]]+)\]\s*(.*)$/);
      const groupName = groupMatch && groupMatch[1].trim() !== '' ? groupMatch[1] : undefined;

      this.currentResult = {
        type: blockStart[1].toUpperCase() === 'WARNING' ? 'warning' : 'error',
        exceptionName: (groupName !== undefined ? groupMatch![2] : rest).trim(),
        groupName,
        rawLines: [line],
        frames: [],
        stackStarted: false,
      };

      return;
    }

    // Logger metadata lines ("npu_check: SUMMARY ...", "npu_check:
    // SESSION_END ...") carry no diagnostic content: they end the current
    // block instead of being collected as description lines.
    if (NPU_CHECK_TAG_PATTERN.test(line)) {
      this.finalizeCurrentResult();

      return;
    }

    const block = this.currentResult;

    // Lines outside any block (tool headers such as "NPU CHECK"/"NPUSAN")
    // produce no result and are not collected.
    if (!block) {
      return;
    }

    // "Device Frame:"/"Device Frames:" starts the call-stack section.
    if (this.isDeviceFrameHeader(cleaned)) {
      block.stackStarted = true;
      block.rawLines.push(line);

      return;
    }

    // After the stack header, "#N" lines are call-stack frames.
    if (block.stackStarted && cleaned.startsWith('#')) {
      const frame = parseNpuCheckStackFrame(cleaned);

      if (frame) {
        block.frames.push(frame);
      }

      block.rawLines.push(line);

      return;
    }

    // Everything else is a description line, kept verbatim in originData.
    block.rawLines.push(line);
  }

  /**
   * Clean line contents: remove the optional "npu_check: <LEVEL>" logger tag,
   * then the leading "=" decoration and surrounding whitespace. The tag shape
   * and the number of "=" signs and spaces vary between releases, so all of
   * them are matched flexibly.
   */
  private cleanLine(line: string): string {
    return line
      .replace(NPU_CHECK_TAG_PATTERN, '')
      .replace(/^\s*=+\s*/, '')
      .trim();
  }

  /**
   * Detect the "Device Frame(s):" header that starts the call-stack section.
   * Both the singular and plural spellings are accepted, case-insensitively.
   */
  private isDeviceFrameHeader(cleanedLine: string): boolean {
    return /^device\s+frames?\s*:\s*$/i.test(cleanedLine);
  }

  /**
   * Complete collection of the current block and push it onto the result list
   */
  private finalizeCurrentResult(): void {
    if (!this.currentResult) {
      return;
    }

    const block = this.currentResult;

    // Drop trailing blank lines from the raw block content.
    while (
      block.rawLines.length > 0
      && block.rawLines[block.rawLines.length - 1].trim() === ''
    ) {
      block.rawLines.pop();
    }

    // Jump target: starting from #0, the first frame whose file is located
    // inside the project directory (matchPath); frames without a path are
    // skipped in index order. When no frame is inside the project (remote
    // paths, or no matchPath configured), fall back to the first frame that
    // resolves any file path.
    const sortedFrames = [...block.frames].sort((a, b) => a.index - b.index);
    const target = (
      this.matchPath
        ? sortedFrames.find((frame) => frame.filePath !== undefined && isPathInsideProject(frame.filePath, this.matchPath))
        : undefined
    ) ?? sortedFrames.find((frame) => frame.filePath !== undefined);

    const result: Result = {
      title: block.exceptionName,
      exceptionName: block.exceptionName,
      type: block.type,
      questionType: QUESTION_TYPE,
      question: block.exceptionName,
      groupName: block.groupName,
      originData: block.rawLines.join('\n'),
      fileLink: target ? target.filePath : undefined,
      row: target ? target.row : undefined,
      col: target ? target.col : undefined,
      sourceTool: 'npu-check',
    };

    this.results.push(result);
    this.currentResult = null;
  }
}
