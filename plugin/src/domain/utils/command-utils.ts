import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';

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
  /**
   * Join option keys and values with a space (`--key value`) instead of `=`
   * (`--key=value`). Needed for tools whose CLI only accepts the space form
   * (e.g. npu-check).
   */
  spaceSeparated?: boolean;
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
 * - Others: --key=value (or "--key value" when config.spaceSeparated is set)
 */
export function objectToCommandString(
  options: Record<
    string,
    string | number | boolean | undefined | null | (string | number)[]
  >,
  config?: CommandStringConfig,
): string {
  // The filter above only excludes nullish/false at runtime — the entry value
  // type is not narrowed, so the pair formatter accepts the full union.
  const formatPair = (key: string, value: string | number | boolean | undefined | null): string => (
    config?.spaceSeparated ? `--${key} ${value}` : `--${key}=${value}`
  );

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
          return formatPair(key, value.join(separator));
        }

        return value.map((v) => formatPair(key, v))
          .join(' ');
      }

      return formatPair(key, value);
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

const SIMPLE_ARGUMENT_PATTERN = /"[^"`$\r\n]*"|'[^'\r\n]*'|[^\s"'\\`$;&|#<>()]+/g;
const SIMPLE_FRAGMENT_PATTERN = /^[ \t]*(?:(?:"[^"`$\r\n]*"|'[^'\r\n]*'|[^\s"'\\`$;&|#<>()]+)(?:[ \t]+(?:"[^"`$\r\n]*"|'[^'\r\n]*'|[^\s"'\\`$;&|#<>()]+))*)?[ \t]*$/;
const DIRECT_BUILD_SCRIPT_PATTERN = /^\s*(?:(?:bash|bash\.exe)[ \t]+)?(?:"(?:[^"`$\r\n]*[/\\])?build\.sh"|'(?:[^'\r\n]*[/\\])?build\.sh'|(?:[^\s"'\\`$;&|#<>()]*\/)?build\.sh)((?:[ \t]+(?:"[^"`$\r\n]*"|'[^'\r\n]*'|[^\s"'\\`$;&|#<>()]+))*)[ \t]*$/;

function simpleArguments(fragment: string): string[] {
  return (fragment.match(SIMPLE_ARGUMENT_PATTERN) || [])
    .map((argument) => /^(['"]).*\1$/.test(argument) ? argument.slice(1, -1) : argument);
}

export function isSupportedSimpleCommandFragment(fragment = ''): boolean {
  return SIMPLE_FRAGMENT_PATTERN.test(fragment)
    && simpleArguments(fragment)
      .every((argument) => argument !== '--');
}

export function isDirectBuildScriptCommand(command: string): boolean {
  const match = command.match(DIRECT_BUILD_SCRIPT_PATTERN);

  return Boolean(match
    && match[0].length === command.length
    && isSupportedSimpleCommandFragment(match[1]));
}

export function hasExplicitBuildTypeArgument(...fragments: (string | undefined)[]): boolean {
  if (!fragments.every((fragment) => isSupportedSimpleCommandFragment(fragment))) {
    return false;
  }

  const args = fragments.flatMap((fragment) => simpleArguments(fragment || ''));

  return args.some((argument, index) => (
    (argument.startsWith('--build-type=') && argument.length > '--build-type='.length)
    || (argument === '--build-type' && Boolean(args[index + 1]))
  ));
}

export function shouldAddDebugBuildType(
  scriptField: string,
  script: string,
  ...fragments: (string | undefined)[]
): boolean {
  return (scriptField === 'cpu_debug_script' || scriptField === 'npu_debug_script')
    && isDirectBuildScriptCommand(script)
    && fragments.every((fragment) => isSupportedSimpleCommandFragment(fragment))
    && !hasExplicitBuildTypeArgument(script, ...fragments);
}

export interface PermissionConfig {
  read?: boolean;
  write?: boolean;
  execute?: boolean;
}

/** True when target_file refers to a .run installer (not a shell command string). */
export function isRunPackageTarget(file: string): boolean {
  if (!file || isCommand(file)) {
    return false;
  }

  return file.includes('.run');
}

/**
 * Build a `.run` installer command that discovers `--force` support from the
 * installer itself. Help may be written to stderr or return non-zero, so both
 * streams are captured and probe failures fall back to execution without it.
 */
function buildRunPackageCommand(file: string): string {
  const resolveRunFile = file.includes('*')
    ? `RUN_FILE=$(find ${file})`
    : `RUN_FILE=${shellQuoteBash(file)}`;

  // Keep the match deliberately loose because installer help may decorate the
  // option with ANSI colors or punctuation that is invisible in the terminal.
  return joinCommands(
    resolveRunFile,
    'chmod +x "$RUN_FILE"',
    'RUN_FILE_HELP=$("$RUN_FILE" --help 2>&1 || true)',
    'case "$RUN_FILE_HELP" in *--force*) "$RUN_FILE" --force ;; *) "$RUN_FILE" ;; esac',
  );
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
  options: PermissionConfig = { execute: true },
): string {
  if (!file) {
    return '';
  }

  if (isRunPackageTarget(file)) {
    return buildRunPackageCommand(file);
  }

  // Wildcards: resolve with find, then chmod + execute (path only — no flags in `file`)
  if (file.includes('*')) {
    return `RUN_FILE=$(find ${file}) && chmod +x "$RUN_FILE" && "$RUN_FILE"`;
  }

  // Commands (e.g. python ../run.py): return as-is without chmod
  if (isCommand(file)) {
    return file;
  }

  const chmodCmd = generateChmodCommand(file, options);

  return joinCommands(chmodCmd, file);
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
