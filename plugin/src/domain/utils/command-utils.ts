import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import {
  cannSocToSeries, type AscendSeries,
} from '@shared/ascend-series-registry';

/**
 * Command generation configuration options
 */
export interface CommandStringConfig {
  /**
   * Specifies what delimiter should be used to concatenate array values ​​for certain keys.
   * By default, arrays generate multiple --key=val.
   * Generates --key=val1,val2 if delimiter is specified (assuming delimiter is ,)
   */
  separators?: Record<string, string>;
}

/**
 * Convert object to command line argument string
 *
 * Example:
 * { pkg: true, soc: 'Ascend310' } -> "--pkg --soc=Ascend310"
 * { tool: ['memcheck', 'leak'] } -> "--tool=memcheck --tool=leak"
 * { metrics: ['A', 'B'] }, { separators: { metrics: ',' } } -> "--metrics=A,B"
 *
 * rule:
 * - value === true: --key
 * - value === false | undefined | null: ignore
 * - value is an array:
 * - If separators are specified in config.separators: --key=item1,item2
 * - Otherwise: --key=item1 --key=item2 ...
 * - Others: --key=value
 */
export function objectToCommandString(
  options: Record<
    string,
    string | number | boolean | undefined | null | (string | number)[]
  >,
  config?: CommandStringConfig,
): string {
  return Object.entries(options)
    .filter(([
      _,
      value,
    ]) => value !== undefined && value !== null && value !== false)
    .map(([
      key,
      value,
    ]) => {
      if (value === true) {
        return `--${key}`;
      }

      if (Array.isArray(value)) {
        const separator = config?.separators?.[key];

        if (separator) {
          return `--${key}=${value.join(separator)}`;
        }

        return value.map((v) => `--${key}=${v}`)
          .join(' ');
      }

      return `--${key}=${value}`;
    })
    .join(' ');
}

/**
 * Concatenate multiple commands and filter out empty commands
 * @param commands command list
 * @returns command string after connection
 */
export function joinCommands(...commands: (string | undefined | null)[]): string {
  return commands.filter(Boolean)
    .join(' && ');
}

export interface PermissionConfig {
  read?: boolean;
  write?: boolean;
  execute?: boolean;
}

/** Whether getExecutableCommand treats target_file as a .run deploy or a generic run. */
export type ExecutableCommandMode = 'run' | 'deploy';

export interface GetExecutableCommandOptions extends PermissionConfig {
  /** Default `run`. Use `deploy` for .run package install after build. */
  mode?: ExecutableCommandMode;
  /** When mode is `deploy` and target is a .run package, append `--force` on A2/A5 SOCs unless false. */
  deployForce?: boolean;
}

function normalizeExecutableOptions(options: GetExecutableCommandOptions | PermissionConfig = { execute: true }): GetExecutableCommandOptions {
  if ('mode' in options || 'deployForce' in options) {
    return {
      execute: true,
      ...options,
    };
  }

  return {
    ...options,
    mode: 'run',
  };
}

/** True when target_file refers to a .run installer (not a shell command string). */
export function isRunPackageDeployTarget(file: string): boolean {
  if (!file || isCommand(file)) {
    return false;
  }

  return file.includes('.run');
}

/**
 * Ascend series whose `.run` installer must be re-run with `--force` to
 * overwrite an already-installed custom operator package: A2 (Ascend910A/B,
 * 310P) and A5 (Ascend950). A3 (Ascend910_93xx) does not require it.
 */
const RUN_PACKAGE_FORCE_DEPLOY_SERIES: ReadonlySet<AscendSeries> = new Set([
  'a2',
  'a5',
]);

/** Whether a `.run` deploy on the given CANN SOC needs the `--force` flag. */
function cannSocNeedsRunPackageForce(cannSoc: string): boolean {
  const series = cannSocToSeries(cannSoc.trim()
    .toLowerCase());

  return series !== undefined && RUN_PACKAGE_FORCE_DEPLOY_SERIES.has(series);
}

function runPackageForceSuffix(options: GetExecutableCommandOptions): string {
  if (options.mode !== 'deploy' || options.deployForce === false) {
    return '';
  }

  if (!cannSocNeedsRunPackageForce(resolveEffectiveCannSoc())) {
    return '';
  }

  return ' --force';
}

/**
 * Generate chmod command
 *
 * @param file target file
 * @param mode permission configuration object, default { execute: true }
 * @returns chmod command string
 */
export function generateChmodCommand(
  file: string,
  mode: PermissionConfig = { execute: true },
): string {
  if (!file) {
    return '';
  }

  const parts: string[] = [];

  if (mode.read) {
    parts.push('r');
  }

  if (mode.write) {
    parts.push('w');
  }

  if (mode.execute) {
    parts.push('x');
  }

  if (parts.length === 0) {
    return '';
  }

  const modeStr = '+' + parts.join('');

  return `chmod ${modeStr} ${file}`;
}

/**
 * Check if a string is a command (not a file path)
 * @param str The string to check
 * @returns Returns true if it is a command, otherwise returns false
 */
function isCommand(str: string): boolean {
  if (!str) {
    return false;
  }

  // If it contains spaces, it is most likely the command
  if (str.includes(' ')) {
    return true;
  }

  // If it starts with a common command prefix, it is considered a command
  const commandPrefixes = [
    'python',
    'bash',
    'sh',
    'node',
    'npm',
    'yarn',
    'java',
    'perl',
    'ruby',
  ];
  const firstWord = str.split(' ')[0].split('/')
    .pop() || '';

  return commandPrefixes.some((prefix) => firstWord.startsWith(prefix));
}

/**
 * Generate run command with chmod
 * @param file executable file path or command
 * @param mode permission configuration object, default { execute: true }
 * @returns complete run command
 */
export function getExecutableCommand(
  file: string,
  options: GetExecutableCommandOptions | PermissionConfig = { execute: true },
): string {
  if (!file) {
    return '';
  }

  const opts = normalizeExecutableOptions(options);
  const forceSuffix = isRunPackageDeployTarget(file) ? runPackageForceSuffix(opts) : '';

  // Wildcards: resolve with find, then chmod + execute (path only — no flags in `file`)
  if (file.includes('*')) {
    return `RUN_FILE=$(find ${file}) && chmod +x "$RUN_FILE" && "$RUN_FILE"${forceSuffix}`;
  }

  // Commands (e.g. python ../run.py): return as-is without chmod
  if (isCommand(file)) {
    return file;
  }

  const chmodCmd = generateChmodCommand(file, opts);
  const runTarget = file.endsWith('.run') && forceSuffix
    ? `"${file}"${forceSuffix}`
    : file;

  return joinCommands(chmodCmd, runTarget);
}

/**
 * Command line build class
 * Supports command generation in the form of a b --key=value
 */
export class Command {
  private _options: Record<string, unknown> = {};
  private _subCommand: Command | null = null;
  private _args: string[] = [];

  constructor(
    public name: string,
    private config?: CommandStringConfig,
  ) { }

  /**
   * Add option parameters
   * @param key parameter name
   * @param value parameter value
   */
  public addOption(key: string, value: unknown): Command {
    this._options[key] = value;

    return this;
  }

  /**
   * Bulk add options
   * @param options option object
   */
  public addOptions(options: Record<string, unknown>): Command {
    Object.assign(this._options, options);

    return this;
  }

  /**
   * Add positional parameters
   * @param arg parameter value
   */
  public addArgument(arg: string): Command {
    if (arg) {
      this._args.push(arg);
    }

    return this;
  }

  /**
   * Set subcommand
   * @param cmd subcommand object or name
   */
  public setSubCommand(cmd: Command | string): Command {
    if (typeof cmd === 'string') {
      this._subCommand = new Command(cmd);

      return this._subCommand;
    }

    this._subCommand = cmd;

    return cmd;
  }

  /**
   * Create and return subcommands
   * @param name subcommand name
   * @param config subcommand configuration
   */
  public sub(name: string, config?: CommandStringConfig): Command {
    const subCmd = new Command(name, config);

    this._subCommand = subCmd;

    return subCmd;
  }

  /**
   * Generate complete command string
   */
  public toString(): string {
    const parts = [this.name];

    // 1. Your own options
    const optionsStr = objectToCommandString(
      this._options as Record<
        string,
        string | number | boolean | (string | number)[]
      >,
      this.config,
    );

    if (optionsStr) {
      parts.push(optionsStr);
    }

    // 2. Positional parameters
    if (this._args.length) {
      parts.push(this._args.join(' '));
    }

    // 3. Subcommand (recursively generated)
    if (this._subCommand) {
      parts.push(this._subCommand.toString());
    }

    return parts.join(' ');
  }
}

/**
 * Handle advanced parameters
 * @param advance_param advanced parameter array
 * @returns formatted parameter string
 */
export function getAdvanceCmd(advance_param: unknown): string {
  if (
    !Array.isArray(advance_param)
    || !advance_param.length
  ) {
    return '';
  }

  return (advance_param as Array<{ name: string;
    value: string }>)
    .filter((item) => item.name)
    .map((item) => `--${item.name}${item.value ? `=${item.value}` : ''}`)
    .join(' ');
}
