import { t } from 'i18next';
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
 * Get basic context information (does not include policy-specific processing)
 *
 * @param configId configuration ID
 * @returns BaseContext base context object
 * @throws Error if the configuration does not exist
 */
function getBaseContext(configId: number): BaseContext {
  const config = getConfigById(configId) as unknown as ConfigRecord;

  if (!config) {
    throw new Error(t('command.configNotFound'));
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
 * Generate operator compilation command
 *
 * @param config_id configuration ID
 * @param compileOption compilation parameters --debug: debug mode; --mssanitizer: anomaly detection mode
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @param scriptField script field, specifies which field to use as the command line script, script | cpu_debug_script | npu_debug_script
 * @returns complete shell execution command string
 */
export function getBuildOpCommand(config_id: number, compileOption?: string, operatorNames?: string, scriptField?: string) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    // Build the complete context
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
      scriptField
    });
  }
  catch (e: unknown) {
    throw new Error(t('command.getBuildCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate operator running command
 *
 * @param config_id configuration ID
 * @returns complete shell execution command string
 */
export function getRunCommand(config_id: number) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // Use strategies to get the correct target_file
    const targetFile = strategy.getRunTargetFile(context.config, context.operator);

    // Update target_file in context
    context.config.target_file = targetFile;

    return strategy.buildRunCommand(context);
  }
  catch (e: unknown) {
    throw new Error(t('command.getRunCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate sample compilation commands
 *
 * @param config_id configuration ID
 * @param compileOption compile option
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @returns complete shell execution command string
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
    throw new Error(t('command.getBuildCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate simulation commands
 *
 * Example:
 * msprof op --output=$home/projects/output $home/projects/MyApp/out/main blockdim 1
 * msprof op simulator --soc-version=Ascendxxxyy --output=...
 *
 * @param config_id configuration ID
 * @param example_config_id example configuration ID
 * @param operatorNames Operator names, multiple separated by commas (for standard custom operator scenarios)
 * @returns complete shell execution command string
 */
export function getSimulateCommand(
  config_id: number,
  example_config_id: number,
  operatorNames?: string,
) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // Use strategies to get the correct target_file
    let targetFile = strategy.getProfilerTargetFile(context.config, context.operator, example_config_id);

    // If operatorNames is provided, use the separator test_aclnn_ to split the path and take the prefix + test_aclnn_ + operatorNames
    if (operatorNames && targetFile) {
      const delimiter = 'test_aclnn_';
      const parts = targetFile.split(delimiter);
      if (parts.length >= 2) {
        targetFile = `${parts[0]}${delimiter}${operatorNames}`;
      }
    }

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
    throw new Error(t('command.getSimulateCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate board command
 *
 * @param config_id configuration ID
 * @param example_config_id example configuration ID
 * @param operatorNames Operator names, multiple separated by commas (for standard custom operator scenarios)
 * @returns complete shell execution command string
 */
export function getOnBoardCommand(
  config_id: number,
  example_config_id: number,
  operatorNames?: string,
) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // Use strategies to get the correct target_file
    let targetFile = strategy.getProfilerTargetFile(context.config, context.operator, example_config_id);

    // If operatorNames is provided, use the separator test_aclnn_ to split the path and take the prefix + test_aclnn_ + operatorNames
    if (operatorNames && targetFile) {
      const delimiter = 'test_aclnn_';
      const parts = targetFile.split(delimiter);
      if (parts.length >= 2) {
        targetFile = `${parts[0]}${delimiter}${operatorNames}`;
      }
    }

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
    throw new Error(t('command.getOnBoardCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate Sanitizer (anomaly detection) command
 *
 * @param sanitizerConfigId Sanitizer configuration ID
 * @param example_config_id example configuration ID
 * @param operatorNames Operator names, multiple separated by commas (for standard custom operator scenarios)
 * @returns complete shell execution command string
 */
export function getSanitizerCommand(
  sanitizerConfigId: number,
  example_config_id: number,
  operatorNames?: string,
) {
  try {
    const baseContext = getBaseContext(sanitizerConfigId);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // Use strategies to get the correct target_file
    let targetFile = strategy.getProfilerTargetFile(context.config, context.operator, example_config_id);

    // If operatorNames is provided, use the separator test_aclnn_ to split the path and take the prefix + test_aclnn_ + operatorNames
    if (operatorNames && targetFile) {
      const delimiter = 'test_aclnn_';
      const parts = targetFile.split(delimiter);
      if (parts.length >= 2) {
        targetFile = `${parts[0]}${delimiter}${operatorNames}`;
      }
    }

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
    throw new Error(t('command.getSanitizerCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Build UT test command
 *
 * @param config_id configuration ID
 * @param operatorNames operator names, comma-separated (e.g. standard custom operators)
 * @returns full shell command string
 */
export function getUtTestCommand(
  config_id: number,
  operatorNames?: string,
) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    const userOptions = context.config.user_options as Record<string, unknown> | null | undefined;
    const advance_cmd = getAdvanceCmd(userOptions?.advance_param);

    return strategy.buildUtTestCommand({
      config: context.config,
      operator: context.operator,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      advance_cmd,
      operatorNames,
    });
  }
  catch (e: unknown) {
    throw new Error(`Failed to build UT test command: ${(e as Error).message}`);
  }
}

// Export strategy types and factory for registering new strategies externally
export { CommandStrategyFactory } from './command-strategy';

export type { CommandStrategy } from './command-strategy';
