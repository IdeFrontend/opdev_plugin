import { t } from 'i18next';
import { message } from 'ant-design-vue';
import { checkPathExists } from '@web/apis';

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

export interface ValidationStrategy {
  validate(value: unknown, rule?: unknown): Promise<void> | void;
}

/**
 * 项目名称
 */
export class ProjectNameValidationStrategy implements ValidationStrategy {
  validate(value: unknown): void {
    const strValue = value as string;

    if (!strValue || strValue.trim() === '') {
      throw new Error(t('web.link.validation.projectNameRequired'));
    }
    if (!/^[a-zA-Z0-9_]+$/.test(strValue)) {
      throw new Error(t('web.link.validation.projectNameChars'));
    }
    if (!/^[a-zA-Z]/.test(strValue)) {
      throw new Error(t('web.link.validation.projectNameStart'));
    }
    if (CPP_KEYWORDS.includes(strValue.toLowerCase())) {
      throw new Error(t('web.link.validation.projectNameKeyword'));
    }
  }
}

/**
 * 项目路径验证
 */
export class ProjectPathValidationStrategy implements ValidationStrategy {
  async validate(value: unknown): Promise<void> {
    const strValue = value as string;

    if (!strValue) {
      throw new Error(t('web.link.validation.projectPathRequired'));
    }
    const pathExists = await checkPathExists({ path: strValue });
    if (!pathExists) {
      throw new Error(t('web.link.validation.dirNotExist'));
    }
  }
}

/**
 * 环境变量脚本
 */
export class ProjectSHValidationStrategy implements ValidationStrategy {
  async validate(value: unknown): Promise<void> {
    const strValue = value as string;

    if (!strValue) return;
    const pathExists = await checkPathExists({ path: strValue, mustFile: true });
    if (!pathExists) {
      throw new Error(t('web.link.validation.scriptNotExist'));
    }
  }
}

/**
 * 这个后面业务再加算子的其他字段和校验规则 可以在这个类里搞（单例模式：确保每种策略只有一个实例）
 */
export class ValidationStrategyFactory {
  private static strategies: Map<string, ValidationStrategy> = new Map([
    [
      'projectName',
      new ProjectNameValidationStrategy(),
    ],
    [
      'projectPath',
      new ProjectPathValidationStrategy(),
    ],
    [
      'projectSH',
      new ProjectSHValidationStrategy(),
    ],
  ]);

  /**
   * 根据字段获取对应的策略
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
    }
    catch (error: unknown) {
      const messageText =
        error instanceof Error ? error.message : (error as string) || t('web.link.validation.failed');

      message.error(messageText);

      return false;
    }
  }
}
