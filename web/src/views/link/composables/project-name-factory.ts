/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the LICENSE file in the root directory of this source tree.
 */

/**
 * 项目名称工厂
 * 使用工厂模式生成默认项目名称
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

