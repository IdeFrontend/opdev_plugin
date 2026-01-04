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

/**
 * 生成 chmod 命令
 *
 * @param file 目标文件
 * @param mode 权限模式，默认为 '+x'
 * @returns chmod 命令字符串
 */
export function generateChmodCommand(
  file: string,
  mode: string = '+x',
): string {
  if (!file) {
    return '';
  }

  return `chmod ${mode} ${file}`;
}

/**
 * 生成带 chmod 的运行命令
 * @param file 可执行文件路径
 * @param mode 权限模式，默认为 '+x'
 * @returns 完整的运行命令
 */
export function getExecutableCommand(
  file: string,
  mode: string = '+x',
): string {
  if (!file) {
    return '';
  }

  return joinCommands(generateChmodCommand(file, mode), file);
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
