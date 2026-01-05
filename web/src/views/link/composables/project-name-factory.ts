/**
 * 这个时给新建算子的时候加给名称（业务要求的）
 */
export class ProjectNameFactory {
  /**
   * 生成默认算子工程名称 op_XXXXXX（随机六位数字）
   */
  static generateDefaultProjectName(): string {
    const num = Math.floor(100000 + Math.random() * 900000);

    return `op_${num}`;
  }
}
