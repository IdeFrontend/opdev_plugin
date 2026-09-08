/**
 * Guards for the options handed to `mssanitizer`. mssanitizer validates every
 * flag and aborts the whole run (printing `[mssanitizer] ERROR: ...` and still
 * exiting 0) when a value is out of range, so a stale/invalid config value such
 * as `--max-debuglog-size=0` silently breaks detection. Each normalizer returns
 * `undefined` for an invalid value so the command builder simply omits the flag
 * and mssanitizer falls back to its own default.
 *
 * Ranges/enums mirror mssanitizer csrc/core/cli_parser.cpp.
 */

import { Command } from '@plugin/domain/utils/command-utils';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

const MAX_DEBUGLOG_SIZE_MIN = 1;
const MAX_DEBUGLOG_SIZE_MAX = 10240;
const BLOCK_ID_MIN = 0;
const BLOCK_ID_MAX = 200;
const VALID_LOG_LEVELS = [
  'info',
  'warn',
  'error',
] as const;
const VALID_TOOLS = [
  'memcheck',
  'racecheck',
  'initcheck',
  'synccheck',
] as const;
const VALID_NPU_TOOLS = [
  'memcheck',
  'synccheck',
  // 'racecheck', // npu-check 竞争检测暂未开发完毕，下个版本开放
  // 'initcheck', // npu-check 未初始化检测暂未开发完毕，下个版本开放
] as const;
const VALID_SANITIZER_COMMANDS = [
  'mssanitizer',
  'npu-check',
] as const;

function toIntInRange(value: unknown, min: number, max: number): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const num = Number(value);

  if (!Number.isFinite(num)) {
    return undefined;
  }

  const int = Math.trunc(num);

  if (int < min || int > max) {
    return undefined;
  }

  return int;
}

/** `--max-debuglog-size` accepts 1..10240 (MB); returns undefined to omit the flag. */
export function normalizeMaxDebuglogSize(value: unknown): number | undefined {
  return toIntInRange(value, MAX_DEBUGLOG_SIZE_MIN, MAX_DEBUGLOG_SIZE_MAX);
}

/** `--block-id` accepts 0..200; returns undefined to omit the flag. */
export function normalizeBlockId(value: unknown): number | undefined {
  return toIntInRange(value, BLOCK_ID_MIN, BLOCK_ID_MAX);
}

/** `--log-level` accepts info|warn|error; returns undefined to omit the flag. */
export function normalizeLogLevel(value: unknown): string | undefined {
  return VALID_LOG_LEVELS.includes(value as typeof VALID_LOG_LEVELS[number])
    ? (value as string)
    : undefined;
}

/** `--tool` accepts memcheck|racecheck|initcheck|synccheck; drops anything else. */
export function normalizeSanitizerTools(tools: string[]): string[] {
  return tools.filter((tool) => VALID_TOOLS.includes(tool as typeof VALID_TOOLS[number]));
}

export function normalizeNpuSanitizerTools(tools: string[]): string[] {
  return tools.filter((tool) => VALID_NPU_TOOLS.includes(tool as typeof VALID_NPU_TOOLS[number]));
}

export function normalizeSanitizerCommand(value: unknown): 'mssanitizer' | 'npu-check' {
  return VALID_SANITIZER_COMMANDS.includes(value as typeof VALID_SANITIZER_COMMANDS[number])
    ? (value as 'mssanitizer' | 'npu-check')
    : 'mssanitizer';
}

/**
 * Sanitizer report log file name: npu-check writes `npu-check_<timestamp>.log`,
 * mssanitizer keeps its own `mssanitizer_<timestamp>.log` name.
 */
export function buildSanitizerLogFileName(commandName: 'mssanitizer' | 'npu-check'): string {
  const timestamp = new Date()
    .valueOf();

  return commandName === 'npu-check' ? `npu-check_${timestamp}.log` : `mssanitizer_${timestamp}.log`;
}

/**
 * Sanitizer report directory name under the workspace IDE config dir: npu-check
 * writes its reports into `npu-check-log`, mssanitizer keeps its historical
 * `mindstudio_sanitizer_log` directory (both live side by side).
 */
export function getSanitizerLogDirName(commandName: 'mssanitizer' | 'npu-check'): string {
  return commandName === 'npu-check' ? 'npu-check-log' : 'mindstudio_sanitizer_log';
}

/** All sanitizer report directory names a reader must scan, in no particular order. */
export const SANITIZER_LOG_DIR_NAMES: readonly string[] = [
  'mindstudio_sanitizer_log',
  'npu-check-log',
];

/** Absolute `--log-file` path: `<ideConfig>/<tool log dir>/<tool>_<timestamp>.log`. */
export function buildSanitizerLogFilePath(workspaceRoot: string, commandName: 'mssanitizer' | 'npu-check'): string {
  return joinIdeConfigPath(
    workspaceRoot,
    getSanitizerLogDirName(commandName),
    buildSanitizerLogFileName(commandName),
  );
}

/**
 * Creates the sanitizer command with the flag style each CLI accepts:
 * npu-check parses `--key value` (space-separated) while mssanitizer uses the
 * `--key=value` form.
 */
export function createSanitizerCommand(commandName: 'mssanitizer' | 'npu-check'): Command {
  return new Command(commandName, commandName === 'npu-check' ? { spaceSeparated: true } : undefined);
}

/**
 * Creates the sanitizer command with the flag style each CLI accepts:
 * npu-check parses `--key value` (space-separated) while mssanitizer uses the
 * `--key=value` form.
 */
export function createSanitizerCommand(commandName: 'mssanitizer' | 'npu-check'): Command {
  return new Command(commandName, commandName === 'npu-check' ? { spaceSeparated: true } : undefined);
}

/**
 * Add `--tool=<value>` options to the command for the selected sanitizer tool.
 * Shared by all command strategies (triton / cann / ascend).
 */
export function addSanitizerToolOptions(
  command: Command,
  toolOptions: Record<string, unknown>,
  commandName: 'mssanitizer' | 'npu-check',
): void {
  const enabledTools = Object.keys(toolOptions)
    .filter((key) => toolOptions[key]);
  const tools = commandName === 'npu-check'
    ? normalizeNpuSanitizerTools(enabledTools)
    : normalizeSanitizerTools(enabledTools);

  if (tools.length > 0) {
    command.addOption('tool', tools);
  }
}
