import {
  ProjectPathValidationStrategy,
  ProjectSHValidationStrategy,
} from '../../new-project/composables/validation-strategies';

/**
 * 打开项目表单校验规则工厂
 */
export class OpenProjectFormRulesFactory {
  /**
   * 项目路径校验规则
   */
  static createProjectPathRule() {
    return [
      {
        required: true,
        message: '请输入算子工程位置',
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

  /**
   * 环境变量脚本校验规则
   */
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

  /**
   * 生成完整的表单校验规则（不包含 projectName）
   */
  static createFormRules(): Record<string, Array<{ required?: boolean;
    message?: string;
    trigger?: string;
    validator?: (_rule: unknown, value: string)=> Promise<void> }>> {
    return {
      projectPath: this.createProjectPathRule(),
      projectSH: this.createProjectSHRule(),
    };
  }
}
