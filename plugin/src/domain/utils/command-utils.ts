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
  
  // Wildcards indicate a path that needs special handling
  if (str.includes('*')) {
    return true;
  }

  // If it starts with a common command prefix, treat it as a command
  const commandPrefixes = ['python', 'bash', 'sh', 'node', 'npm', 'yarn', 'java', 'perl', 'ruby'];
  const firstWord = str.split(' ')[0].split('/').pop() || '';
  return commandPrefixes.some(prefix => firstWord.startsWith(prefix));
}

/**
 * Generate run command with chmod
 * @param file executable file path or command
 * @param mode permission configuration object, default { execute: true }
 * @returns complete run command
 */
export function getExecutableCommand(
  file: string,
  mode: PermissionConfig = { execute: true },
): string {
  if (!file) {
    return '';
  }

  // Wildcards: resolve with find, then chmod + execute
  if (file.includes('*')) {
    return `RUN_FILE=$(find ${file}) && chmod +x "$RUN_FILE" && "$RUN_FILE"`;
  }

  // Commands (e.g. python ../run.py): return as-is without chmod
  if (isCommand(file)) {
    return file;
  }

  return joinCommands(generateChmodCommand(file, mode), file);
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
