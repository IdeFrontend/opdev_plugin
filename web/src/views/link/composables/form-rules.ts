/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the LICENSE file in the root directory of this source tree.
 */

import { checkPathExists } from '@/apis';
import {
  ValidationStrategyFactory,
  ProjectNameValidationStrategy,
  ProjectPathValidationStrategy,
  ProjectSHValidationStrategy,
} from './validation-strategies';

/**
 * 表单校验规则生成器
 * 使用策略模式生成表单校验规则
 */
export class FormRulesFactory {
  /**
   * 生成项目路径校验规则
   */
  static createProjectPathRule() {
    return [
      { required: true, message: '请输入算子工程位置', trigger: 'blur' },
      {
        trigger: 'blur',
        validator: async (rule: any, value: string) => {
          const strategy = new ProjectPathValidationStrategy();
          try {
            await strategy.validate(value);
            return Promise.resolve();
          } catch (error: any) {
            return Promise.reject(error.message);
          }
        },
      },
    ];
  }

  /**
   * 生成项目名称校验规则
   */
  static createProjectNameRule() {
    return [
      { required: true, message: '请输入算子工程名称', trigger: 'blur' },
      {
        validator: (rule: any, value: string) => {
          if (!value) {
            return Promise.resolve();
          }
          const strategy = new ProjectNameValidationStrategy();
          try {
            strategy.validate(value);
            return Promise.resolve();
          } catch (error: any) {
            return Promise.reject(error.message);
          }
        },
        trigger: 'blur',
      },
    ];
  }

  /**
   * 生成环境变量脚本校验规则
   */
  static createProjectSHRule() {
    return [
      {
        trigger: 'blur',
        validator: async (rule: any, value: string) => {
          const strategy = new ProjectSHValidationStrategy();
          try {
            await strategy.validate(value);
            return Promise.resolve();
          } catch (error: any) {
            return Promise.reject(error.message);
          }
        },
      },
    ];
  }

  /**
   * 生成完整的表单校验规则
   */
  static createFormRules() {
    return {
      projectPath: this.createProjectPathRule(),
      projectName: this.createProjectNameRule(),
      projectSH: this.createProjectSHRule(),
    };
  }
}

