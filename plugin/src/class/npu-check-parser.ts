import type {
  QuestionType,
  Result,
} from './exception-parser';

// npu-check reports do not map to dedicated question categories yet
const QUESTION_TYPE: QuestionType = 'other';

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
 * Internal state of the exception block currently being collected.
 */
interface CurrentBlock {
  type: 'error' | 'warning';
  exceptionName: string;
  rawLines: string[];
  frames: NpuCheckStackFrame[];
  stackStarted: boolean;
}

/**
 * Anomaly detection result parser for npu-check logs.
 * npu-check decorates every line with a variable-length "=" prefix and reports
 * issues as "ERROR:"/"WARNING:" blocks, optionally followed by a
 * "Device Frame(s):" call-stack section whose "#N" frames count up from the
 * stack top. The jump target is therefore the frame with the smallest index
 * that resolves a file path, unlike the mssanitizer parser which prefers the
 * deepest frame.
 */
export class NpuCheckParser {
  private results: Result[] = [];
  private currentResult: CurrentBlock | null = null;

  constructor(config?: Record<string, string>) {
    // Signature parity with ExceptionParser; this parser does not filter
    // frames by matchPath, so the config is intentionally unused.
    void config;
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

    // A new exception block starts with "ERROR:" or "WARNING:".
    const blockStart = cleaned.match(/^(ERROR|WARNING):\s*(.*)$/i);

    if (blockStart) {
      this.finalizeCurrentResult();
      this.currentResult = {
        type: blockStart[1].toUpperCase() === 'WARNING' ? 'warning' : 'error',
        exceptionName: blockStart[2].trim(),
        rawLines: [line],
        frames: [],
        stackStarted: false,
      };

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
   * Clean line contents: remove the leading "=" decoration and surrounding
   * whitespace. The number of "=" signs and spaces varies between releases,
   * so both are matched flexibly.
   */
  private cleanLine(line: string): string {
    return line
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

    // Jump target: the frame with the smallest index that resolves a file
    // path (the stack top is the key point of the problem; frames without a
    // path are skipped in index order).
    const target = [...block.frames]
      .sort((a, b) => a.index - b.index)
      .find((frame) => frame.filePath !== undefined);

    const result: Result = {
      title: block.exceptionName,
      exceptionName: block.exceptionName,
      type: block.type,
      questionType: QUESTION_TYPE,
      question: block.exceptionName,
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
