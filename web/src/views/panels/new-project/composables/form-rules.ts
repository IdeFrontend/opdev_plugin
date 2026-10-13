/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import {
  ProjectNameValidationStrategy,
  ProjectPathValidationStrategy,
  ProjectSHValidationStrategy,
} from './validation-strategies';

export class FormRulesFactory {
  static createProjectPathRule() {
    return [
      {
        required: true,
        message: t('web.link.validation.projectPathRequired'),
        trigger: 'blur',
      },
      {
        trigger: 'blur',
        validator: async (_rule: unknown, value: string) => {
          if (!value) {
            return Promise.resolve();
          }

          const strategy = new ProjectPathValidationStrategy();

          try {
            await strategy.validate(value);

            return Promise.resolve();
          }
          catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            return Promise.reject(message);
          }
        },
      },
    ];
  }

  static createProjectNameRule() {
    return [
      {
        required: true,
        message: t('web.link.validation.projectNameRequired'),
        trigger: 'blur',
      },
      {
        validator: (_rule: unknown, value: string) => {
          if (!value) {
            return Promise.resolve();
          }

          const strategy = new ProjectNameValidationStrategy();

          try {
            strategy.validate(value);

            return Promise.resolve();
          }
          catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            return Promise.reject(message);
          }
        },
        trigger: 'blur',
      },
    ];
  }

  static createProjectSHRule() {
    return [
      {
        trigger: 'blur',
        validator: async (_rule: unknown, value: string) => {
          const strategy = new ProjectSHValidationStrategy();

          try {
            await strategy.validate(value);

            return Promise.resolve();
          }
          catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            return Promise.reject(message);
          }
        },
      },
    ];
  }

  static createFormRules(): Record<string, Array<{ required?: boolean;
    message?: string;
    trigger?: string;
    validator?: (_rule: unknown, value: string)=> Promise<void> }>> {
    return {
      projectPath: this.createProjectPathRule(),
      projectName: this.createProjectNameRule(),
      projectSH: this.createProjectSHRule(),
    };
  }
}
