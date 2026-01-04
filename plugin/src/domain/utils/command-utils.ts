
/**
 * 将对象转换为命令行参数字符串
 * Convert object to command line argument string
 *
 * Example:
 * { pkg: true, soc: 'Ascend310', output: undefined } -> "--pkg --soc=Ascend310"
 * { tool: ['memcheck', 'leak'] } -> "--tool=memcheck --tool=leak"
 *
 * Rules:
 * - value === true: --key
 * - value === false | undefined | null: ignored
 * - value is Array: --key=item1 --key=item2 ...
 * - other: --key=value
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
