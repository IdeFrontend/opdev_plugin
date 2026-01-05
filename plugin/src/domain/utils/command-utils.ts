/**
 * 命令生成配置选项
 */
export interface CommandStringConfig {
  /**
   * 指定某些 key 的数组值应该用什么分隔符连接。
   * 默认情况下，数组会生成多个 --key=val。
   * 如果指定了分隔符，则生成 --key=val1,val2 (假设分隔符是 ,)
   */
  separators?: Record<string, string>;
}

/**
 * 将对象转换为命令行参数字符串
 *
 * 示例:
 * { pkg: true, soc: 'Ascend310' } -> "--pkg --soc=Ascend310"
 * { tool: ['memcheck', 'leak'] } -> "--tool=memcheck --tool=leak"
 * { metrics: ['A', 'B'] }, { separators: { metrics: ',' } } -> "--metrics=A,B"
 *
 * 规则:
 * - value === true: --key
 * - value === false | undefined | null: 忽略
 * - value 是数组:
 *   - 如果在 config.separators 中指定了分隔符: --key=item1,item2
 *   - 否则: --key=item1 --key=item2 ...
 * - 其他: --key=value
 */
export function objectToCommandString(
  options: Record<
    string,
    string | number | boolean | undefined | null | (string | number)[]
  >,
  config?: CommandStringConfig,
): string {
  return Object.entries(options)
    .filter(
      ([_, value]) => value !== undefined && value !== null && value !== false,
    )
    .map(([key, value]) => {
      if (value === true) {
        return `--${key}`;
      }

      if (Array.isArray(value)) {
        const separator = config?.separators?.[key];

        if (separator) {
          return `--${key}=${value.join(separator)}`;
        }

        return value.map((v) => `--${key}=${v}`).join(' ');
      }

      return `--${key}=${value}`;
    })
    .join(' ');
}

/**
 * 连接多个命令，过滤掉空命令
 * @param commands 命令列表
 * @returns 连接后的命令字符串
 */
export function joinCommands(
  ...commands: (string | undefined | null)[]
): string {
  return commands.filter(Boolean).join(' && ');
}

export interface PermissionConfig {
  read?: boolean;
  write?: boolean;
  execute?: boolean;
}

/**
 * 生成 chmod 命令
 *
 * @param file 目标文件
 * @param mode 权限配置对象，默认 { execute: true }
 * @returns chmod 命令字符串
 */
export function generateChmodCommand(
  file: string,
  mode: PermissionConfig = { execute: true },
): string {
  if (!file) {
    return '';
  }

  const parts: string[] = [];

  if (mode.read) parts.push('r');
  if (mode.write) parts.push('w');
  if (mode.execute) parts.push('x');

  if (parts.length === 0) {
    return '';
  }

  const modeStr = '+' + parts.join('');

  return `chmod ${modeStr} ${file}`;
}

/**
 * 生成带 chmod 的运行命令
 * @param file 可执行文件路径
 * @param mode 权限配置对象，默认 { execute: true }
 * @returns 完整的运行命令
 */
export function getExecutableCommand(
  file: string,
  mode: PermissionConfig = { execute: true },
): string {
  if (!file) {
    return '';
  }

  return joinCommands(generateChmodCommand(file, mode), file);
}

/**
 * 命令行构建类
 * 支持 a b --key=value 形式的命令生成
 */
export class Command {
  private _options: Record<string, any> = {};
  private _subCommand: Command | null = null;
  private _args: string[] = [];

  constructor(
    public name: string,
    private config?: CommandStringConfig,
  ) {}

  /**
   * 添加选项参数
   * @param key 参数名
   * @param value 参数值
   */
  public addOption(key: string, value: any): Command {
    this._options[key] = value;

    return this;
  }

  /**
   * 批量添加选项
   * @param options 选项对象
   */
  public addOptions(options: Record<string, any>): Command {
    Object.assign(this._options, options);

    return this;
  }

  /**
   * 添加位置参数
   * @param arg 参数值
   */
  public addArgument(arg: string): Command {
    if (arg) {
      this._args.push(arg);
    }

    return this;
  }

  /**
   * 设置子命令
   * @param cmd 子命令对象或名称
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
   * 创建并返回子命令
   * @param name 子命令名称
   * @param config 子命令配置
   */
  public sub(name: string, config?: CommandStringConfig): Command {
    const subCmd = new Command(name, config);

    this._subCommand = subCmd;

    return subCmd;
  }

  /**
   * 生成完整的命令字符串
   */
  public toString(): string {
    const parts = [this.name];

    // 1. 自身的选项
    const optionsStr = objectToCommandString(this._options, this.config);

    if (optionsStr) parts.push(optionsStr);

    // 2. 位置参数
    if (this._args.length) parts.push(this._args.join(' '));

    // 3. 子命令 (递归生成)
    if (this._subCommand) {
      parts.push(this._subCommand.toString());
    }

    return parts.join(' ');
  }
}


/**
 * 处理高级参数
 * @param advance_param 高级参数数组
 * @returns 格式化后的参数字符串
 */
export function getAdvanceCmd(advance_param: any): string {
  if (!Array.isArray(advance_param) || !advance_param.length) {
    return '';
  }

  return advance_param
    .filter((item: any) => item.name)
    .map((item: any) => `--${item.name}${item.value ? `=${item.value}` : ''}`)
    .join(' ');
}
