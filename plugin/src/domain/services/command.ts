import { getOpByProjectIdAndOpName } from './ops';
import { getProjectById } from '@plugin/domain';
import {
  getConfigById,
  getConfig,
} from './configuration';
import { getAdvanceCmd } from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import {
  CommandStrategyFactory,
  BaseContext,
} from './command-strategy';

/**
 * 获取基础上下文信息（不包含策略特定的处理）
 *
 * @param configId 配置ID
 * @returns BaseContext 基础上下文对象
 * @throws Error 如果配置不存在
 */
function getBaseContext(configId: number): BaseContext {
  const config = getConfigById(configId) as unknown as ConfigRecord;

  if (!config) {
    throw new Error('配置不存在');
  }

  const project = getProjectById(config.project_id);
  const operator = getOpByProjectIdAndOpName(config.project_id, config.op);

  return {
    config,
    project,
    operator,
  };
}

/**
 * 生成算子编译命令
 *
 * @param config_id 配置ID
 * @param compileOption 编译参数 --debug: debug模式 ；  --mssanitizer: 异常检测模式
 * @param operatorNames 算子名称，多个用逗号分隔（用于标准自定义算子等场景）
 * @returns 完整的shell执行命令字符串
 */
export function getBuildOpCommand(config_id: number, compileOption?: string, operatorNames?: string) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    // 构建完整上下文
    const context = strategy.buildCommandContext(baseContext);

    const userOptions = context.config.user_options as Record<string, unknown> | null | undefined;
    const advance_cmd = getAdvanceCmd(userOptions?.advance_param);

    return strategy.buildOpCommand({
      config: context.config,
      operator: context.operator,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      compileOption,
      advance_cmd,
      operatorNames,
    });
  }
  catch (e: unknown) {
    throw new Error(`生成编译命令失败:${(e as Error).message}`);
  }
}

/**
 * 生成算子运行命令
 *
 * @param config_id 配置ID
 * @returns 完整的shell执行命令字符串
 */
export function getRunCommand(config_id: number) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // 使用策略来获取正确的 target_file
    const targetFile = strategy.getRunTargetFile(context.config, context.operator);

    // 更新上下文中的 target_file
    context.config.target_file = targetFile;

    return strategy.buildRunCommand(context);
  }
  catch (e: unknown) {
    throw new Error(`生成运行命令失败:${(e as Error).message}`);
  }
}

/**
 * 生成示例编译命令
 *
 * @param config_id 配置ID
 * @param compileOption 编译选项
 * @param operatorNames 算子名称，多个用逗号分隔（用于标准自定义算子等场景）
 * @returns 完整的shell执行命令字符串
 */
export function getBuildExampleCommand(
  config_id: number,
  compileOption?: string,
  operatorNames?: string,
) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    const userOptions = context.config.user_options as Record<string, unknown> | null | undefined;
    const advance_cmd = getAdvanceCmd(userOptions?.advance_param);

    return strategy.buildExampleCommand({
      config: context.config,
      operator: context.operator,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      compileOption,
      advance_cmd,
      operatorNames,
    });
  }
  catch (e: unknown) {
    throw new Error(`生成编译命令失败:${(e as Error).message}`);
  }
}

/**
 * 生成仿真命令
 *
 * 示例:
 * msprof op --output=$home/projects/output $home/projects/MyApp/out/main blockdim 1
 * msprof op simulator --soc-version=Ascendxxxyy --output=...
 *
 * @param config_id 配置ID
 * @param example_config_id 示例配置ID
 * @returns 完整的shell执行命令字符串
 */
export function getSimulateCommand(
  config_id: number,
  example_config_id: number,
) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // 使用策略来获取正确的 target_file
    const targetFile = strategy.getProfilerTargetFile(context.config, context.operator, example_config_id);

    return strategy.buildSimulateCommand({
      config: context.config,
      project: context.project,
      operator: context.operator,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      exampleTargetFile: targetFile,
      cdBuildCmd: context.cdBuildCmd,
    });
  }
  catch (e: unknown) {
    throw new Error(`获取仿真命令失败 ${(e as Error).message}`);
  }
}

/**
 * 生成上板命令
 *
 * @param config_id 配置ID
 * @param example_config_id 示例配置ID
 * @returns 完整的shell执行命令字符串
 */
export function getOnBoardCommand(
  config_id: number,
  example_config_id: number,
) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // 使用策略来获取正确的 target_file
    const targetFile = strategy.getProfilerTargetFile(context.config, context.operator, example_config_id);

    return strategy.buildOnBoardCommand({
      config: context.config,
      project: context.project,
      operator: context.operator,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      exampleTargetFile: targetFile,
      cdBuildCmd: context.cdBuildCmd,
    });
  }
  catch (e: unknown) {
    throw new Error(`获取上板命令失败 ${(e as Error).message}`);
  }
}

/**
 * 生成Sanitizer(异常检测)命令
 *
 * @param sanitizerConfigId Sanitizer配置ID
 * @param example_config_id 示例配置ID
 * @returns 完整的shell执行命令字符串
 */
export function getSanitizerCommand(
  sanitizerConfigId: number,
  example_config_id: number,
) {
  try {
    const baseContext = getBaseContext(sanitizerConfigId);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // 使用策略来获取正确的 target_file
    const targetFile = strategy.getProfilerTargetFile(context.config, context.operator, example_config_id);

    return strategy.buildSanitizerCommand(
      context.config,
      context.operator,
      context.sourceCannCmd,
      context.cdCmd,
      targetFile,
      context.cdBuildCmd,
    );
  }
  catch (e: unknown) {
    throw new Error(`生成异常检测命令失败: ${(e as Error).message}`);
  }
}

// 导出策略相关类型和工厂，以便外部注册新策略
export { CommandStrategyFactory } from './command-strategy';

export type { CommandStrategy } from './command-strategy';
