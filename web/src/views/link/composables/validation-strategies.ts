/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the LICENSE file in the root directory of this source tree.
 */

import { message } from 'ant-design-vue';
import { checkPathExists } from '@/apis';

/**
 * C++ 关键字列表
 */
export const CPP_KEYWORDS = [
  'alignas',
  'alignof',
  'and',
  'and_eq',
  'asm',
  'auto',
  'bitand',
  'bitor',
  'bool',
  'break',
  'case',
  'catch',
  'char',
  'char16_t',
  'char32_t',
  'class',
  'compl',
  'const',
  'constexpr',
  'const_cast',
  'continue',
  'decltype',
  'default',
  'delete',
  'do',
  'double',
  'dynamic_cast',
  'else',
  'enum',
  'explicit',
  'export',
  'extern',
  'false',
  'float',
  'for',
  'friend',
  'goto',
  'if',
  'inline',
  'int',
  'long',
  'mutable',
  'namespace',
  'new',
  'noexcept',
  'not',
  'not_eq',
  'nullptr',
  'operator',
  'or',
  'or_eq',
  'private',
  'protected',
  'public',
  'register',
  'reinterpret_cast',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'static_assert',
  'static_cast',
  'struct',
  'switch',
  'template',
  'this',
  'thread_local',
  'throw',
  'true',
  'try',
  'typedef',
  'typeid',
  'typename',
  'union',
  'unsigned',
  'using',
  'virtual',
  'void',
  'volatile',
  'wchar_t',
  'while',
  'xor',
  'xor_eq',
];

/**
 * 验证策略接口
 */
export interface ValidationStrategy {
  validate(value: any, rule?: any): Promise<void> | void;
}

/**
 * 项目名称验证策略
 */
export class ProjectNameValidationStrategy implements ValidationStrategy {
  validate(value: string): void {
    if (!value || value.trim() === '') {
      throw new Error('请输入算子工程名称');
    }

    // 规则1: 只能使用字母、数字和下划线
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      throw new Error('算子工程名称只能包含字母、数字和下划线');
    }

    // 规则2: 首字母必须是字母
    if (!/^[a-zA-Z]/.test(value)) {
      throw new Error('算子工程名称必须以字母开头');
    }

    // 规则3: 不能是C++关键字
    if (CPP_KEYWORDS.includes(value.toLowerCase())) {
      throw new Error('算子工程名称不能是C++关键字');
    }
  }
}

/**
 * 项目路径验证策略
 */
export class ProjectPathValidationStrategy implements ValidationStrategy {
  async validate(value: string): Promise<void> {
    if (!value) {
      throw new Error('请输入算子工程位置');
    }

    const pathExists = await checkPathExists({ path: value });

    if (!pathExists) {
      throw new Error('目录不存在，请先创建目录');
    }
  }
}

/**
 * 环境变量脚本验证策略
 */
export class ProjectSHValidationStrategy implements ValidationStrategy {
  async validate(value: string): Promise<void> {
    if (!value) {
      return; // 允许为空
    }

    const pathExists = await checkPathExists({
      path: value,
      mustFile: true,
    });

    if (!pathExists) {
      throw new Error('脚本文件不存在，请确认');
    }
  }
}

/**
 * 验证策略工厂
 * 使用工厂模式创建验证策略实例
 */
export class ValidationStrategyFactory {
  private static strategies: Map<string, ValidationStrategy> = new Map([
    ['projectName', new ProjectNameValidationStrategy()],
    ['projectPath', new ProjectPathValidationStrategy()],
    ['projectSH', new ProjectSHValidationStrategy()],
  ]);

  /**
   * 获取验证策略
   */
  static getStrategy(key: string): ValidationStrategy | undefined {
    return this.strategies.get(key);
  }

  /**
   * 验证项目名称（带消息提示）
   */
  static validateProjectName(projectName: string): boolean {
    try {
      const strategy = this.getStrategy('projectName');
      if (strategy) {
        strategy.validate(projectName);
        return true;
      }
      return false;
    } catch (error: any) {
      message.error(error.message || '验证失败');
      return false;
    }
  }
}

