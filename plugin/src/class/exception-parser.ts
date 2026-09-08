import { t } from 'i18next';

export interface Result {
  // Question name
  title: string;
  // Exception name (original exception name, such as "illegal read of size 224")
  exceptionName: string;
  //Error type
  type: string; // error warning prompt
  //Question type
  questionType: QuestionType;
  // Problem description
  question: string;
  // Problem details (complete error block)
  originData: string;
  // Source code files
  fileLink?: string;
  // Number of lines
  row?: number;
  // Number of columns
  col?: number;
  // Which sanitizer tool produced this result (npu-check reports carry the marker)
  sourceTool?: 'mssanitizer' | 'npu-check';
  // Problem group parsed from the bracketed tag after ERROR:/WARNING:
  // (e.g. "[MEMCHECK]" in "ERROR:[MEMCHECK] Invalid GM read..."); npu-check only
  groupName?: string;
}

// Question categories
export type QuestionType =
  | 'memory'
  | 'memoryContention'
  | 'uninitialized'
  | 'synchronize'
  | 'other';

export const exceptionTpyeMap = new Map<string, string>([
  // Note: Order is important, more specific matches should come first
  [
    'Potential RAW hazard detected',
    'memoryContention',
  ],
  [
    'Potential WAR hazard detected',
    'memoryContention',
  ],
  [
    'Potential WAW hazard detected',
    'memoryContention',
  ],
  [
    'LeakCheck: detected memory leaks',
    'memory',
  ],
  [
    'illegal free()',
    'memory',
  ],
  [
    'illegal read of size',
    'memory',
  ],
  [
    'illegal write of size',
    'memory',
  ],
  [
    'out of bounds of size',
    'memory',
  ],
  [
    'Unused memory',
    'memory',
  ],
  [
    'misaligned access of size',
    'memory',
  ],
  [
    'uninitialized read of size',
    'uninitialized',
  ],
  [
    'Unpaired set_flag insetructions detected',
    'synchronize',
  ],
]);

export const exceptionMap = new Map<string, string>([
  [
    'memory',
    'exceptionParser.memory',
  ],
  [
    'memoryContention',
    'exceptionParser.race',
  ],
  [
    'uninitialized',
    'exceptionParser.uninitialized',
  ],
  [
    'synchronize',
    'exceptionParser.sync',
  ],
  [
    'other',
    'exceptionParser.other',
  ],
]);

/**
 * Mapping table from exception names to Chinese
 * key: exception name keyword (supports partial matching)
 * value: Chinese exception name
 */
export const exceptionNameMap = new Map<string, string>([
  [
    'Potential RAW hazard detected',
    'exceptionParser.rawHazard',
  ],
  [
    'Potential WAR hazard detected',
    'exceptionParser.warHazard',
  ],
  [
    'Potential WAW hazard detected',
    'exceptionParser.wawHazard',
  ],
  [
    'LeakCheck: detected memory leaks',
    'exceptionParser.memoryLeak',
  ],
  [
    'illegal free()',
    'exceptionParser.illegalFree',
  ],
  [
    'illegal read of size',
    'exceptionParser.illegalRead',
  ],
  [
    'illegal write of size',
    'exceptionParser.illegalWrite',
  ],
  [
    'out of bounds of size',
    'exceptionParser.multiCoreStomp',
  ],
  [
    'Unused memory',
    'exceptionParser.allocUnused',
  ],
  [
    'uninitialized read of size',
    'exceptionParser.uninitException',
  ],
  [
    'Unpaired set_flag insetructions detected',
    'exceptionParser.syncException',
  ],
  [
    'misaligned access of size',
    'exceptionParser.unalignedAccess',
  ],
]);

/**
 * Get the problem type based on the exception name
 * @param exceptionName original exception name
 * @returns question type, or null if there is no match
 */
export function getQuestionTypeByExceptionName(exceptionName: string): string | null {
  if (!exceptionName || exceptionName.trim() === '') {
    return null;
  }

  const trimmedName = exceptionName.trim();
  const lowerTrimmedName = trimmedName.toLowerCase();

  // The length of the keys is sorted from longest to short, and more specific keys are matched first.
  const sortedEntries = Array.from(exceptionTpyeMap.entries())
    .sort((a, b) => b[0].length - a[0].length);

  // Partial match: if the exception name contains a map key, use that map (case sensitive)
  for (const [
    key,
    value,
  ] of sortedEntries) {
    if (trimmedName.includes(key)) {
      return value;
    }
  }

  // Case-insensitive matching: if the exception name contains a map key (ignoring case), use that map
  for (const [
    key,
    value,
  ] of sortedEntries) {
    const lowerKey = key.toLowerCase();

    if (lowerTrimmedName.includes(lowerKey)) {
      return value;
    }
  }

  return null;
}

/**
 * Get Chinese based on question type
 * @param questionType question type
 * @returns Chinese question type, if there is no match, return the original question type
 */
export function getChineseQuestionType(questionType: string): string {
  if (!questionType || questionType.trim() === '') {
    return questionType;
  }

  const key = exceptionMap.get(questionType);

  return key ? t(key) : questionType;
}

/**
 * Get Chinese mapping based on exception name
 * @param exceptionName original exception name
 * @returns Chinese exception name, if there is no match, return the original exception name
 */
export function getChineseExceptionName(exceptionName: string): string {
  if (!exceptionName || exceptionName.trim() === '') {
    return exceptionName;
  }

  const trimmedName = exceptionName.trim();
  const lowerTrimmedName = trimmedName.toLowerCase();

  // 1. Try an exact match first (case sensitive)
  if (exceptionNameMap.has(trimmedName)) {
    return t(exceptionNameMap.get(trimmedName)!);
  }

  // 2. Sort the key lengths from long to short, giving priority to matching more specific keys.
  const sortedEntries = Array.from(exceptionNameMap.entries())
    .sort((a, b) => b[0].length - a[0].length);

  // 3. Partial match: If the exception name contains a mapping key, use that mapping (case sensitive)
  for (const [
    key,
    value,
  ] of sortedEntries) {
    if (trimmedName.includes(key)) {
      return t(value);
    }
  }

  // 4. Case-insensitive matching: If the exception name contains a mapping key (ignoring case), use that mapping
  for (const [
    key,
    value,
  ] of sortedEntries) {
    const lowerKey = key.toLowerCase();

    if (lowerTrimmedName.includes(lowerKey)) {
      return t(value);
    }
  }

  // 5. If no match is found, return the original exception name
  return trimmedName;
}

/**
 * List of exception types that need to be handled (corresponding to the keys of ignoredKeys in result.ts)
 * Only handle these types of exceptions
 */
const SUPPORTED_EXCEPTION_PATTERNS = [
  {
    pattern: 'Potential RAW hazard detected',
    type: 'memoryContention',
    errorType: 'error',
  },
  {
    pattern: 'Potential WAR hazard detected',
    type: 'memoryContention',
    errorType: 'error',
  },
  {
    pattern: 'Potential WAW hazard detected',
    type: 'memoryContention',
    errorType: 'error',
  },
  {
    pattern: 'LeakCheck: detected memory leaks',
    type: 'memory',
    errorType: 'error',
  },
  {
    pattern: 'illegal free()',
    type: 'memory',
    errorType: 'error',
  },
  {
    pattern: 'illegal read of size',
    type: 'memory',
    errorType: 'error',
  },
  {
    pattern: 'illegal write of size',
    type: 'memory',
    errorType: 'error',
  },
  {
    pattern: 'out of bounds of size',
    type: 'memory',
    errorType: 'warning',
  },
  {
    pattern: 'Unused memory',
    type: 'memory',
    errorType: 'warning',
  },
  {
    pattern: 'uninitialized read of size',
    type: 'uninitialized',
    errorType: 'error',
  },
  {
    pattern: 'Unpaired set_flag insetructions detected',
    type: 'synchronize',
    errorType: 'warning',
  },
  {
    pattern: 'misaligned access of size',
    type: 'memory',
    errorType: 'error',
  },
] as const;

/**
 * Anomaly detection result parser V2
 * Specifically handles command line output formats starting with ======
 * Supports streaming input and parses the output of anomaly detection tools line by line.
 * Only handle exception types listed in ignoredKeys in result.ts
 */
export class ExceptionParser {
  private results: Result[] = [];
  private currentResult: Partial<Result> | null = null;
  private rawBuffer: string[] = []; // Original line (retain ====== prefix for question details)
  private currentStackLevel: number = -1; // The maximum call stack level of the current result

  private matchPath = '';
  constructor(config: Record<string, string>) {
    this.matchPath = config.matchPath;
  }

  /**
   * Process a line of input
   * @param line A line of text output by the console (may contain ====== prefix)
   */
  public processLine(line: string): void {
    // Save original row (for issue details)
    const originalLine = line.trim();

    // Check if it is an empty line (no content at all, including no ====== prefix)
    if (!originalLine) {
      // Empty line: If there is currently an exception being handled, end it
      if (this.currentResult) {
        this.finalizeCurrentResult();
      }

      return;
    }

    // Remove the ====== prefix and leading and trailing whitespace at the beginning of the line
    const cleanedLine = this.cleanLine(line);

    // Check if it is a SUMMARY line (the end marker of the exception block)
    if (cleanedLine && cleanedLine.startsWith('SUMMARY:')) {
      // SUMMARY line: ends the current exception (but does not include the SUMMARY line)
      if (this.currentResult) {
        this.finalizeCurrentResult();
      }

      return;
    }

    if (!cleanedLine) {
      // If it is empty after cleaning, but the original row is not empty (for example, only ======), it is still collected
      if (this.currentResult) {
        this.collectExceptionInfo('', originalLine);
      }

      return;
    }

    // Detect exception types and start tags
    // Save the previous abnormal results first (if any)
    const previousResult = this.currentResult;
    // Detect new exception (this sets new currentResult)
    const isNewException = this.detectExceptionStart(cleanedLine);

    if (isNewException) {
      // Save the result of the new exception (detectExceptionStart has been set)
      const newResult = this.currentResult;

      // Restore the previous exception result and save it
      this.currentResult = previousResult;
      this.finalizeCurrentResult();
      // Restore the results of a new exception
      this.currentResult = newResult;
      // initialize buffer
      this.startNewResult(originalLine);
    }
    else if (this.currentResult) {
      // Collect exception details (while saving the original row)
      this.collectExceptionInfo(cleanedLine, originalLine);
    }
  }

  /**
   * Clean line contents: remove ====== prefix and leading and trailing whitespace
   */
  private cleanLine(line: string): string {
    let cleaned = line.trim();

    // Remove the ====== prefix from the beginning of the line
    if (cleaned.startsWith('======')) {
      cleaned = cleaned.substring(6)
        .trim();
    }

    return cleaned;
  }

  /**
   * Extract the exception name (from after ERROR: or WARNING:)
   */
  private extractExceptionName(line: string): string {
    // Matches the content following ERROR: or WARNING:
    const match = line.match(/^(?:ERROR|WARNING):\s*(.+?)(?:\s+at\s|$)/);

    if (match && match[1]) {
      return match[1].trim();
    }

    // If no match is found, try to extract everything following ERROR: or WARNING:
    const simpleMatch = line.match(/^(?:ERROR|WARNING):\s*(.+)/);

    if (simpleMatch && simpleMatch[1]) {
      return simpleMatch[1].trim();
    }

    return '';
  }

  /**
   * Detect abnormal start markers
   * Only handle exception types defined in SUPPORTED_EXCEPTION_PATTERNS (corresponding to the keys of ignoredKeys in result.ts)
   */
  private detectExceptionStart(line: string): boolean {
    const trimmed = line.trim();

    // MemorySanitizer leak summary lines use no ERROR:/WARNING: prefix (align with ms-agent LEAK_HEADER_RE).
    if (/^direct leak of\b/i.test(trimmed)) {
      const questionType =
        getQuestionTypeByExceptionName(trimmed) || 'memory';
      const title = getChineseQuestionType(questionType);

      this.currentResult = {
        type: 'error',
        questionType: questionType as QuestionType,
        title,
        exceptionName: trimmed,
        question: trimmed,
      };

      return true;
    }

    // Extract exception name
    const exceptionName = this.extractExceptionName(line);

    const hasErrorPrefix = line.includes('ERROR:');
    const hasWarningPrefix = line.includes('WARNING:');

    // Traverse the supported exception patterns, matching them in order (more specific patterns should be placed first)
    for (const pattern of SUPPORTED_EXCEPTION_PATTERNS) {
      // Check if the pattern is contained in the line
      // Accept both ERROR/WARNING prefixes and infer severity from actual prefix.
      const hasCorrectPrefix = hasErrorPrefix || hasWarningPrefix;

      // If the line contains the pattern string (case-insensitive) and has the correct prefix, the match succeeds
      const lineLower = line.toLowerCase();
      const patternLower = pattern.pattern.toLowerCase();

      if (lineLower.includes(patternLower) && hasCorrectPrefix) {
        // Get the problem type based on the exception name
        const questionType =
          getQuestionTypeByExceptionName(exceptionName) || pattern.type;

        // Get Chinese based on question type
        const title = getChineseQuestionType(questionType);

        this.currentResult = {
          type: hasWarningPrefix ? 'warning' : 'error',
          questionType: questionType as QuestionType,
          title: title,
          exceptionName: exceptionName,
          question: exceptionName, // The problem description takes the entire content after ERROR or WARNING.
        };

        return true;
      }
    }

    // Generic fallback: support unknown sanitizer messages under "other".
    if ((hasErrorPrefix || hasWarningPrefix) && exceptionName) {
      this.currentResult = {
        type: hasWarningPrefix ? 'warning' : 'error',
        questionType: 'other',
        title: getChineseQuestionType('other'),
        exceptionName,
        question: exceptionName,
      };

      return true;
    }

    return false;
  }
  /**
   * Collect exception details
   */
  private collectExceptionInfo(line: string, originalLine: string): void {
    if (!this.currentResult) {
      return;
    }

    const trimmedLine = line.trim();

    // Collect raw rows (for issue details)
    this.rawBuffer.push(originalLine);

    // Parse call stack information (format: #3 file/path.cpp:21:5)
    // Format description: #3 is the call stack level, file/path.cpp is the file path, 21 is the line number, 5 is the column number
    // Only save user code files that do not contain environment variables (such as ${ASCEND_HOME_PATH})
    if (trimmedLine.startsWith('#')) {
      const stackMatch = line.match(/^\s*#(\d+)\s+(.+):(\d+):(\d+)\s*$/);

      if (stackMatch) {
        const stackLevel = parseInt(stackMatch[1], 10); // Call stack level (0, 1, 2, 3...)
        const filePath = stackMatch[2].trim();
        const row = parseInt(stackMatch[3], 10);
        const col = parseInt(stackMatch[4], 10);

        // Save only user code files (excluding system paths containing environment variables)
        // Containing ${ASCEND_HOME_PATH} is the system call stack, not user code
        const isSystem = this.isSystemPath(filePath);

        if (!isSystem) {
          // Prioritize the user code file with the highest number in the call stack (usually #3)
          // If the file information has not been set, or the current call stack level is higher, update
          const prefersWorkspacePath = !!this.matchPath && filePath.includes(this.matchPath);
          const hasAbsolutePath = /^(?:[A-Za-z]:[\\/]|\/)/.test(filePath);

          if (!this.currentResult.fileLink) {
            if (prefersWorkspacePath || hasAbsolutePath) {
              this.currentResult.fileLink = filePath;
              this.currentResult.row = row;
              this.currentResult.col = col;
              // Update the current maximum call stack level
              this.currentStackLevel = stackLevel;
            }
          }
        }
      }
      else {
        // If a line starts with # but no pattern is matched, try a looser match
        // For example: #3 file.cpp:21 or #3 file.cpp:21:5
        const looseMatch = line.match(/^\s*#(\d+)\s+(.+):(\d+)(?::(\d+))?\s*$/);

        if (looseMatch) {
          const stackLevel = parseInt(looseMatch[1], 10);
          const filePath = looseMatch[2].trim();
          const row = parseInt(looseMatch[3], 10);
          const col = looseMatch[4] ? parseInt(looseMatch[4], 10) : 0;

          if (!this.isSystemPath(filePath)) {
            const fileName = this.extractFileName(filePath);

            if (
              !this.currentResult.fileLink
              || stackLevel > this.currentStackLevel
            ) {
              this.currentResult.fileLink = fileName;
              this.currentResult.row = row;
              this.currentResult.col = col;
              this.currentStackLevel = stackLevel;
            }
          }
        }
      }
    }

    // Note: The problem description (question) has been set to everything after ERROR or WARNING in detectExceptionStart
    // The following code no longer covers question, but is only used to extract other information (such as file path, line number, etc.)

    // Parse code positioning information (format: code in file.cpp:84)
    if (line.includes('code in') && line.includes('.cpp:')) {
      const codeMatch = line.match(/code\s+in\s+(.+?):(\d+)/);

      if (codeMatch && !this.currentResult.fileLink) {
        this.currentResult.fileLink = codeMatch[1].trim();
        this.currentResult.row = parseInt(codeMatch[2], 10);
      }
    }

    // Leak blocks: "allocated in main.cpp:55" (ms-agent FILELINE_RE)
    if (line.includes('allocated in') && !this.currentResult.fileLink) {
      const allocMatch = line.match(/allocated\s+in\s+([^:(\s]+):(\d+)/);

      if (allocMatch) {
        this.currentResult.fileLink = allocMatch[1].trim();
        this.currentResult.row = parseInt(allocMatch[2], 10);
      }
    }
  }

  /**
   * Determine whether it is a system path
   * The path containing the ${ASCEND_HOME_PATH} environment variable is the system call stack, not user code
   */
  private isSystemPath(filePath: string): boolean {
    // Paths containing environment variables are system paths
    const hasEnvVar = filePath.includes('${ASCEND_HOME_PATH}');

    if (hasEnvVar) {
      return true;
    }

    // Other system path characteristics
    return (
      filePath.includes('/compiler/')
      || filePath.includes('/tikcpp/')
      || filePath.includes('kernel_operator_data_copy_impl.h')
      || filePath.includes('inner_kernel_operator_data_copy_intf.cppm')
      || filePath.includes('kernel_event.h')
      || filePath.includes('kernel_common.h')
    );
  }

  /**
   * Extract file name from file path
   * For example: illegal_read_and_write/add_custom.cpp -> add_custom.cpp
   *      out_of_bound/add_custom.cpp -> add_custom.cpp
   */
  private extractFileName(filePath: string): string {
    // Use / or \ to split the path and take the last part as the file name
    const parts = filePath.split(/[/\\]/);

    return parts[parts.length - 1] || filePath;
  }

  /**
   * Start new results collection
   */
  private startNewResult(originalLine: string): void {
    this.rawBuffer = [originalLine];
    this.currentStackLevel = -1; // Reset call stack level
  }

  /**
   * Complete collection of current results
   */
  private finalizeCurrentResult(): void {
    if (!this.currentResult) {
      return;
    }

    // If no problem description is extracted, use the exception name (all the content after ERROR or WARNING)
    if (!this.currentResult.question) {
      this.currentResult.question = this.currentResult.exceptionName || '';
    }

    // Get the original exception name and convert it to Chinese
    const originalExceptionName = this.currentResult.exceptionName || '';
    const chineseExceptionName = getChineseExceptionName(originalExceptionName);

    // Save full issue details (original error content block)
    const originData =
      this.rawBuffer.length > 0 ? this.rawBuffer.join('\n') : '';

    // Make sure all required fields have values
    const result: Result = {
      title: this.currentResult.question,
      exceptionName: chineseExceptionName, // Use Chinese exception names
      type: this.currentResult.type || 'error',
      questionType: this.currentResult.questionType!,
      question: this.formatQuestionName(this.currentResult.question),
      originData: originData,
      fileLink: this.currentResult.fileLink,
      row: this.currentResult.row,
      col: this.currentResult.col,
    };

    this.results.push(result);
    this.currentResult = null;
    this.rawBuffer = [];
    this.currentStackLevel = -1; // Reset call stack level
  }

  /**
   * Complete all parsing and return the result list
   * This method is called when console output ends
   */
  public finalize(): Result[] {
    this.finalizeCurrentResult();

    return this.results;
  }

  /**
   * Parse the entire content at once and return the results
   * Applicable to situations where the complete content has been obtained and no line-by-line processing is required.
   * @param content Multi-line string content will be separated by newlines and processed line by line.
   * @returns parsed result list
   */
  public parseAll(content: string): Result[] {
    // Reset parser state to ensure a clean state
    this.reset();

    // Split content by newlines
    const lines = content.split(/\r?\n/);

    // Line by line processing
    for (const line of lines) {
      this.processLine(line);
    }

    // Complete parsing and return results
    return this.finalize();
  }

  /**
   * Reset parser state
   */
  public reset(): void {
    this.results = [];
    this.currentResult = null;
    this.rawBuffer = [];
    this.currentStackLevel = -1;
  }

  private formatQuestionName(name: string) {
    const keys = [...exceptionTpyeMap.keys()];

    for (let i = 0; i < keys.length; i++) {
      if (name.startsWith(keys[i])) {
        return keys[i];
      }
    }

    return name;
  }
}
