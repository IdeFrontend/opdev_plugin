import { t } from 'i18next';
import { getOpByProjectIdAndOpName } from './ops';
import { getProjectById } from '@plugin/domain';
import { ConfigService } from '@plugin/service/config-service';
import {
  getAdvanceCmd, getExecutableCommand, isRunPackageDeployTarget, joinCommands,
} from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import {
  CommandStrategyFactory,
  BaseContext,
  CommandContext,
} from './command-strategy';
import {
  resolveExampleMode,
  toExampleMatcher,
  ExampleMode,
  ExampleMatchers,
  DEFAULT_EXAMPLE_MATCHERS,
} from '@plugin/domain/utils/operator-example-mode';

/**
 * Get basic context information (does not include policy-specific processing)
 *
 * @param configId configuration ID
 * @returns BaseContext base context object
 * @throws Error if the configuration does not exist
 */
function getBaseContext(configId: number): BaseContext {
  const config = ConfigService.getRuntimeConfigById(configId) as unknown as ConfigRecord;

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
      scriptField,
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
 * Resolve the run_example mode for an operator from the example files present on disk,
 * using the plugin-wide `execution_mode` setting only as a tiebreaker. Returns the
 * resolved op name and whether any example was found so callers can warn the user.
 *
 * When the project path or operator name is unknown we cannot inspect the tree, so we keep
 * the configured mode and do not claim the example is missing.
 */
function resolveModeFromContext(
  context: CommandContext,
  operatorNames?: string,
): { mode: ExampleMode; exampleFound: boolean; opName: string } {
  const userOptions = context.config.user_options as Record<string, unknown> | null | undefined;
  const globalMode: ExampleMode = userOptions?.execution_mode === 'graph' ? 'graph' : 'eager';
  const configOp = typeof userOptions?.op === 'string' ? userOptions.op : context.config.op;
  const opName = operatorNames?.trim() || configOp || '';
  const projectRoot = context.project?.project_path || '';

  if (!projectRoot || !opName) {
    return { mode: globalMode, exampleFound: true, opName };
  }

  // Example-filename matchers default to the build.sh contract but are overridable per
  // project via settings (RegExp strings, surfaced into user_options by config-service).
  const matchers: ExampleMatchers = {
    eager: toExampleMatcher(userOptions?.eager_example_pattern as string | undefined, DEFAULT_EXAMPLE_MATCHERS.eager),
    graph: toExampleMatcher(userOptions?.graph_example_pattern as string | undefined, DEFAULT_EXAMPLE_MATCHERS.graph),
  };

  const { mode, exampleFound } = resolveExampleMode(projectRoot, opName, globalMode, false, matchers);

  return { mode, exampleFound, opName };
}

/**
 * Resolve the run_example mode for a config without building the command, so the caller
 * (e.g. the example-build action) can surface a warning when the operator ships no example.
 */
export function resolveExampleModeForConfig(
  config_id: number,
  operatorNames?: string,
): { mode: ExampleMode; exampleFound: boolean; opName: string } {
  const baseContext = getBaseContext(config_id);
  const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);
  const context = strategy.buildCommandContext(baseContext);

  return resolveModeFromContext(context, operatorNames);
}

/**
 * Generate sample compilation commands
 *
 * @param config_id configuration ID
 * @param compileOption compile option
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @param exampleMode explicit run_example mode; when omitted it is auto-detected from the operator's example files
 * @returns complete shell execution command string
 */
export function getBuildExampleCommand(
  config_id: number,
  compileOption?: string,
  operatorNames?: string,
  exampleMode?: ExampleMode,
) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    const userOptions = context.config.user_options as Record<string, unknown> | null | undefined;
    const advance_cmd = getAdvanceCmd(userOptions?.advance_param);

    // `exampleMode`, when supplied, is the per-operator mode resolved by the caller (the
    // run_example action — see resolveExampleModeForConfig / #171). When omitted, the
    // strategy keeps its existing `execution_mode`-or-`eager` behavior, so the
    // profiler/sanitizer example pre-builds are unaffected.
    return strategy.buildExampleCommand({
      config: context.config,
      operator: context.operator,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      compileOption,
      advance_cmd,
      operatorNames,
      exampleMode,
    });
  }
  catch (e: unknown) {
    throw new Error(t('command.getBuildCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate simulation commands
 *
 * Example (simulator directory for --soc-version, not CANN slug):
 * msprof op simulator --soc-version=Ascend910B3 --output=... --aic-metrics=... ./app
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
  compileOption?: string,
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
      compileOption,
    });
  }
  catch (e: unknown) {
    throw new Error(`Failed to build UT test command: ${(e as Error).message}`);
  }
}

/**
 * Generate standard-custom `.run` deploy command after build_example succeeds.
 * Uses build_op target_file when it references a .run package; otherwise `build_out/*.run`.
 */
export function getStandardCustomDeployCommand(config_id: number) {
  try {
    const baseContext = getBaseContext(config_id);
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);
    const context = strategy.buildCommandContext(baseContext);

    const configuredTarget = strategy.getRunTargetFile(context.config, context.operator);
    const deployTarget = isRunPackageDeployTarget(configuredTarget)
      ? configuredTarget
      : 'build_out/*.run';
    const deployCmd = getExecutableCommand(deployTarget, {
      execute: true,
      mode: 'deploy',
    });

    return joinCommands(context.sourceCannCmd, context.cdCmd, deployCmd);
  }
  catch (e: unknown) {
    throw new Error(`Failed to build standard custom deploy command: ${(e as Error).message}`);
  }
}

// Export strategy types and factory for registering new strategies externally
export { CommandStrategyFactory } from './command-strategy';

export type { CommandStrategy } from './command-strategy';
