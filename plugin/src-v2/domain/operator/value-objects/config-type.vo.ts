/**
 * Config type value object
 * Avoids magic strings via value object pattern
 */
export class ConfigType {
  static readonly BUILD_OP = new ConfigType('build_op');
  static readonly BUILD_EXAMPLE = new ConfigType('build_example');
  static readonly SIMULATE = new ConfigType('simulate');
  static readonly ON_BOARD = new ConfigType('on_board');
  static readonly SANITIZER = new ConfigType('sanitizer');

  private constructor(public readonly value: string) {}

  equals(other: ConfigType): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  /**
   * Create ConfigType from string
   */
  static fromString(value: string): ConfigType | undefined {
    switch (value) {
      case 'build_op':
        return ConfigType.BUILD_OP;
      case 'build_example':
        return ConfigType.BUILD_EXAMPLE;
      case 'simulate':
        return ConfigType.SIMULATE;
      case 'on_board':
        return ConfigType.ON_BOARD;
      case 'sanitizer':
        return ConfigType.SANITIZER;
      default:
        return undefined;
    }
  }
}
