
/**
 * 将对象转换为命令行参数字符串
 *
 * 示例:
 * { pkg: true, soc: 'Ascend310', output: undefined } -> "--pkg --soc=Ascend310"
 * { tool: ['memcheck', 'leak'] } -> "--tool=memcheck --tool=leak"
 *
 * 规则:
 * - value === true: --key
 * - value === false | undefined | null: 忽略
 * - value 是数组: --key=item1 --key=item2 ...
 * - 其他: --key=value
 */
export function objectToCommandString(
  options: Record<string, string | number | boolean | undefined | null | (string | number)[]>
): string {
  return Object.entries(options)
    .filter(([_, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => {
      if (value === true) {
        return `--${key}`;
      }
      if (Array.isArray(value)) {
        return value.map((v) => `--${key}=${v}`).join(' ');
      }
      return `--${key}=${value}`;
    })
    .join(' ');
}
