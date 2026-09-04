import { t } from 'i18next';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { ConfigService } from '@plugin/service/config-service';
import type {
  BuildOpConfig,
  BuildExampleConfig,
  UtTestConfig,
  SimulateConfig,
  OnBoardConfig,
  SanitizerConfig,
} from '@plugin/service/config-service';
import {
  getAdvanceCmd, getExecutableCommand, isRunPackageTarget, joinCommands,
} from '@plugin/domain/utils/command-utils';
import {
  CommandStrategyFactory,
  BaseContext,
  CommandContext,
  SectionConfig,
  BuildableConfig,
  ProfilerTargetConfig,
} from './command-strategy';
import {
  resolveExampleMode,
  toExampleMatcher,
  ExampleMode,
  ExampleMatchers,
  DEFAULT_EXAMPLE_MATCHERS,
  isExampleTarget,
  rewriteExampleTarget,
} from '@plugin/domain/utils/operator-example-mode';

/**
 * Resolve the op_type used for the synthesized operator record when no ops.json row
 * exists. Mirrors the row-driven strategy routing: ascend/standard-custom projects
 * build with the Ascend strategy, pyasc/triton with
 * their own, everything else (cann, torch-library, unknown) with the cann strategy.
 * This closes the regression where operator=null fell through to the cann strategy,
 * stripping ascend/standard-custom projects of their deploy/run tails.
 */
function resolveOperatorOpType(projectType: string | null | undefined): string {
  if (projectType === 'standard-custom' || projectType === 'ascend') {
    return 'ascend';
  }

  if (projectType === 'pyasc') {
    return 'pyasc';
  }

  if (projectType === 'triton') {
    return 'triton';
  }

  return 'cann';
}

/**
 * Shared resolution for the per-section base-context resolvers: the project
 * record (throwing when the project does not exist), the operator record —
 * the first name of the sidebar selection, falling back to the build_op
 * `operatorNameToCompile` setting (`operatorNames?.first || config.op`), then
 * the project root operator — and the section config produced by the
 * caller-supplied factory. The full comma-separated selection is NOT consumed
 * here: builders receive it separately and embed it into scripts / target
 * rewriting.
 *
 * @param projectPath workspace project path
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @param configFactory section config factory, invoked with the resolved op name
 * @returns BaseContext base context object
 * @throws Error if the project does not exist
 */
function resolveSectionBaseContext<TConfig extends SectionConfig>(
  projectPath: string,
  operatorNames: string | undefined,
  configFactory: (opName: string)=> TConfig,
): BaseContext<TConfig> {
  const selectionOp = operatorNames?.split(',')[0]?.trim() || '';

  const project = getProjectByPath(projectPath);

  if (!project) {
    throw new Error(t('command.configNotFound'));
  }

  // The config is resolved with the raw selection first, so a config-carried
  // operator name (build_op `operatorNameToCompile`) can backfill an empty
  // selection — the resolution chain reads the row's `op` the same way. The
  // config-carried name WINS when present: a standard-custom collection
  // carries the ROOT name in its single config set (the row `op` is the
  // project name, and the concrete operators are selected only via the
  // `--ops={operatorNames}` placeholder).
  const config = configFactory(selectionOp);
  const configOp = typeof (config as unknown as { op?: unknown }).op === 'string'
    ? (config as { op?: string }).op as string
    : '';
  const opName = configOp || selectionOp;

  const operator = resolveOpRecord(projectPath, opName) ?? {
    op_name: opName,
    op_type: resolveOperatorOpType(project.project_type),
    op_path: project.project_path,
  };

  return {
    config,
    project,
    operator,
    op: opName,
  };
}

/**
 * Resolve the build_op base context (project, operator and runtime config row)
 * for one command build. Callers resolve once and pass the result to the
 * builders — the builders never fetch anything themselves.
 *
 * @param projectPath workspace project path
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @returns BaseContext base context object
 * @throws Error if the project does not exist
 */
export function resolveBuildOpBaseContext(projectPath: string, operatorNames?: string): BaseContext<BuildOpConfig> {
  return resolveSectionBaseContext(projectPath, operatorNames, (opName) => ConfigService.getBuildOpConfig());
}

/**
 * Resolve the build_example base context (project, operator and runtime config
 * row) for one command build. Callers resolve once and pass the result to the
 * builders — the builders never fetch anything themselves.
 *
 * @param projectPath workspace project path
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @returns BaseContext base context object
 * @throws Error if the project does not exist
 */
export function resolveBuildExampleBaseContext(projectPath: string, operatorNames?: string): BaseContext<BuildExampleConfig> {
  return resolveSectionBaseContext(projectPath, operatorNames, (opName) => ConfigService.getBuildExampleConfig());
}

/**
 * Resolve the ut_test base context (project, operator and runtime config row)
 * for one command build. Callers resolve once and pass the result to the
 * builders — the builders never fetch anything themselves.
 *
 * @param projectPath workspace project path
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @returns BaseContext base context object
 * @throws Error if the project does not exist
 */
export function resolveUtTestBaseContext(projectPath: string, operatorNames?: string): BaseContext<UtTestConfig> {
  return resolveSectionBaseContext(projectPath, operatorNames, (opName) => ConfigService.getUtTestConfig());
}

/**
 * Resolve the simulate base context (project, operator and runtime config row)
 * for one command build. Callers resolve once and pass the result to the
 * builders — the builders never fetch anything themselves.
 *
 * @param projectPath workspace project path
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @returns BaseContext base context object
 * @throws Error if the project does not exist
 */
export function resolveSimulateBaseContext(projectPath: string, operatorNames?: string): BaseContext<SimulateConfig> {
  return resolveSectionBaseContext(projectPath, operatorNames, (opName) => ConfigService.getSimulateConfig(projectPath));
}

/**
 * Resolve the on_board base context (project, operator and runtime config row)
 * for one command build. Callers resolve once and pass the result to the
 * builders — the builders never fetch anything themselves.
 *
 * @param projectPath workspace project path
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @returns BaseContext base context object
 * @throws Error if the project does not exist
 */
export function resolveOnBoardBaseContext(projectPath: string, operatorNames?: string): BaseContext<OnBoardConfig> {
  return resolveSectionBaseContext(projectPath, operatorNames, (opName) => ConfigService.getOnBoardConfig(projectPath));
}

/**
 * Resolve the sanitizer base context (project, operator and runtime config row)
 * for one command build. Callers resolve once and pass the result to the
 * builders — the builders never fetch anything themselves.
 *
 * @param projectPath workspace project path
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @returns BaseContext base context object
 * @throws Error if the project does not exist
 */
export function resolveSanitizerBaseContext(projectPath: string, operatorNames?: string): BaseContext<SanitizerConfig> {
  return resolveSectionBaseContext(projectPath, operatorNames, (opName) => ConfigService.getSanitizerConfig(projectPath, opName));
}

/**
 * Generate operator compilation command
 *
 * @param baseContext resolved command context (see {@link resolveBuildOpBaseContext})
 * @param compileOption compilation parameters --debug: debug mode; --mssanitizer: anomaly detection mode
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @param scriptField script field, specifies which field to use as the command line script, script | cpu_debug_script | npu_debug_script
 * @returns complete shell execution command string
 */
export function getBuildOpCommand(baseContext: BaseContext<BuildableConfig>, compileOption?: string, operatorNames?: string, scriptField?: string) {
  try {
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    // Build the complete context
    const context = strategy.buildCommandContext(baseContext);

    // Only the simulate/on-board/sanitizer sections carry advance_param; build_op itself
    // never had one (its user_options carried no advance_param row).
    const advance_cmd = 'advanceParam' in context.config ? getAdvanceCmd(context.config.advanceParam) : '';

    return strategy.buildOpCommand({
      config: context.config,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      compileOption,
      advance_cmd,
      operatorNames,
      scriptField,
      op: context.op,
    });
  }
  catch (e: unknown) {
    throw new Error(t('command.getBuildCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate operator running command
 *
 * @param baseContext resolved command context (see {@link resolveBuildOpBaseContext});
 *   build_example contexts are accepted too — both sections carry `targetFile`, and
 *   buildRunCommand reads only it
 * @returns complete shell execution command string
 */
export function getRunCommand(baseContext: BaseContext<BuildOpConfig | BuildExampleConfig>) {
  try {
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // Use strategies to get the correct target_file
    const targetFile = strategy.getRunTargetFile(context.op, context.operator, context.project);

    // Update target_file in context
    context.config.targetFile = targetFile;

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
 *
 * Profiler/sanitizer contexts carry no example settings in their config rows, so the
 * `eagerExamplePattern`-presence guard keeps them on the fallback path: eager mode +
 * the default example-filename matchers + the on-disk example scan.
 */
function resolveModeFromContext(
  context: CommandContext<BuildExampleConfig | ProfilerTargetConfig>,
  operatorNames?: string,
): { mode: ExampleMode;
  exampleFound: boolean;
  opName: string } {
  const globalMode: ExampleMode = 'eagerExamplePattern' in context.config && context.config.executionMode === 'graph' ? 'graph' : 'eager';
  const opName = operatorNames?.trim() || context.op || '';
  const projectRoot = context.project?.project_path || '';

  if (!projectRoot || !opName) {
    return {
      mode: globalMode,
      exampleFound: true,
      opName,
    };
  }

  // Example-filename matchers default to the build.sh contract but are overridable per
  // project via settings (RegExp strings, surfaced into the build_example DAO).
  const matchers: ExampleMatchers = {
    eager: toExampleMatcher('eagerExamplePattern' in context.config ? context.config.eagerExamplePattern : undefined, DEFAULT_EXAMPLE_MATCHERS.eager),
    graph: toExampleMatcher('graphExamplePattern' in context.config ? context.config.graphExamplePattern : undefined, DEFAULT_EXAMPLE_MATCHERS.graph),
  };

  const {
    mode, exampleFound,
  } = resolveExampleMode(projectRoot, opName, globalMode, false, matchers);

  return {
    mode,
    exampleFound,
    opName,
  };
}

/**
 * Resolve the run_example mode for a config without building the command, so the caller
 * (e.g. the example-build action) can surface a warning when the operator ships no example.
 */
export function resolveExampleModeForBaseContext(
  baseContext: BaseContext<BuildExampleConfig>,
  operatorNames?: string,
): { mode: ExampleMode;
  exampleFound: boolean;
  opName: string } {
  const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);
  const context = strategy.buildCommandContext(baseContext);

  return resolveModeFromContext(context, operatorNames);
}

/**
 * Repoints the stored example target at the operator being profiled, in the mode that operator
 * actually ships. The mode lookup walks the operator's `examples/` dir, so it runs only for a
 * target that names a build.sh example binary in the first place — cann, pyasc and triton point
 * at their own build output and pass through untouched.
 *
 * The mode is resolved against the *example* config, the one the pre-build ran with: only that
 * config carries `execution_mode` and the example-filename patterns in its `user_options`
 * (config-service surfaces the settings per config type), so reading them off the
 * profiler/sanitizer config would silently fall back to `eager` and to the default patterns.
 * The caller resolves the example context explicitly via
 * {@link resolveBuildExampleBaseContext} and passes it in.
 */
function rewriteExampleTargetForExample(
  targetFile: string,
  exampleBaseContext: BaseContext<BuildExampleConfig>,
  operatorNames?: string,
): string {
  if (!operatorNames || !isExampleTarget(targetFile)) {
    return targetFile;
  }

  const mode = resolveExampleModeForBaseContext(exampleBaseContext, operatorNames).mode;

  return rewriteExampleTarget(targetFile, operatorNames, mode);
}

/**
 * Generate sample compilation commands
 *
 * @param baseContext resolved command context (see {@link resolveBuildExampleBaseContext})
 * @param compileOption compile option
 * @param operatorNames Operator names, multiple separated by commas (used in scenarios such as standard custom operators)
 * @param exampleMode explicit run_example mode; when omitted it is auto-detected from the operator's example files
 * @param buildExampleOnly standard-custom only: build an existing run_example target without executing it
 * @returns complete shell execution command string
 */
export function getBuildExampleCommand(
  baseContext: BaseContext<BuildExampleConfig>,
  compileOption?: string,
  operatorNames?: string,
  exampleMode?: ExampleMode,
  buildExampleOnly = false,
) {
  try {
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // `exampleMode`, when supplied, is the per-operator mode already resolved by the caller
    // (the run_example action resolves it up front to warn about a missing example).
    // Otherwise resolve it here, so every pre-build builds the example the operator
    // actually ships instead of the configured one.
    return strategy.buildExampleCommand({
      config: context.config,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      compileOption,
      operatorNames,
      exampleMode: exampleMode ?? resolveModeFromContext(context, operatorNames).mode,
      buildExampleOnly,
      op: context.op,
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
 * @param baseContext resolved command context (see {@link resolveSimulateBaseContext})
 * @param exampleBaseContext resolved build_example context, used to repoint example targets
 * @param operatorNames Operator names, multiple separated by commas (for standard custom operator scenarios)
 * @returns complete shell execution command string
 */
export function getSimulateCommand(
  baseContext: BaseContext<SimulateConfig>,
  exampleBaseContext: BaseContext<BuildExampleConfig>,
  operatorNames?: string,
) {
  try {
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // Use strategies to get the correct target_file
    let targetFile = strategy.getProfilerTargetFile(context.config, context.operator, context.op, context.project);

    targetFile = rewriteExampleTargetForExample(targetFile, exampleBaseContext, operatorNames);

    return strategy.buildSimulateCommand({
      config: context.config,
      project: context.project,
      operator: context.operator,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      exampleTargetFile: targetFile,
      cdBuildCmd: context.cdBuildCmd,
      op: context.op,
    });
  }
  catch (e: unknown) {
    throw new Error(t('command.getSimulateCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate board command
 *
 * @param baseContext resolved command context (see {@link resolveOnBoardBaseContext})
 * @param exampleBaseContext resolved build_example context, used to repoint example targets
 * @param operatorNames Operator names, multiple separated by commas (for standard custom operator scenarios)
 * @returns complete shell execution command string
 */
export function getOnBoardCommand(
  baseContext: BaseContext<OnBoardConfig>,
  exampleBaseContext: BaseContext<BuildExampleConfig>,
  operatorNames?: string,
) {
  try {
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // Use strategies to get the correct target_file
    let targetFile = strategy.getProfilerTargetFile(context.config, context.operator, context.op, context.project);

    targetFile = rewriteExampleTargetForExample(targetFile, exampleBaseContext, operatorNames);

    return strategy.buildOnBoardCommand({
      config: context.config,
      project: context.project,
      operator: context.operator,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      exampleTargetFile: targetFile,
      cdBuildCmd: context.cdBuildCmd,
      op: context.op,
    });
  }
  catch (e: unknown) {
    throw new Error(t('command.getOnBoardCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Generate Sanitizer (anomaly detection) command
 *
 * @param baseContext resolved command context (see {@link resolveSanitizerBaseContext})
 * @param exampleBaseContext resolved build_example context, used to repoint example targets
 * @param operatorNames Operator names, multiple separated by commas (for standard custom operator scenarios)
 * @returns complete shell execution command string
 */
export function getSanitizerCommand(
  baseContext: BaseContext<SanitizerConfig>,
  exampleBaseContext: BaseContext<BuildExampleConfig>,
  operatorNames?: string,
) {
  try {
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    // Use strategies to get the correct target_file
    let targetFile = strategy.getProfilerTargetFile(context.config, context.operator, context.op, context.project);

    targetFile = rewriteExampleTargetForExample(targetFile, exampleBaseContext, operatorNames);

    return strategy.buildSanitizerCommand(context, targetFile);
  }
  catch (e: unknown) {
    throw new Error(t('command.getSanitizerCommandFailed', { error: (e as Error).message }));
  }
}

/**
 * Build UT test command
 *
 * @param baseContext resolved command context (see {@link resolveUtTestBaseContext})
 * @param operatorNames operator names, comma-separated (e.g. standard custom operators)
 * @param compileOption compile option
 * @returns full shell command string
 */
export function getUtTestCommand(
  baseContext: BaseContext<UtTestConfig>,
  operatorNames?: string,
  compileOption?: string,
) {
  try {
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);

    const context = strategy.buildCommandContext(baseContext);

    return strategy.buildUtTestCommand({
      config: context.config,
      sourceCannCmd: context.sourceCannCmd,
      cdCmd: context.cdCmd,
      operatorNames,
      compileOption,
      op: context.op,
    });
  }
  catch (e: unknown) {
    throw new Error(`Failed to build UT test command: ${(e as Error).message}`);
  }
}

/**
 * Standard-custom `.run` deploy tail (`RUN_FILE ... --force`) without the
 * source-cann/cd prefix — for embedding into an existing build command
 * (e.g. the simulate/on-board pre-build). Shares target resolution with
 * getStandardCustomDeployCommand.
 */
export function getStandardCustomDeployTail(): string {
  // The deploy tail reads the workspace deploy setting directly —
  // unset means the bare `build_out/*.run` default, never an operator-plugin path.
  const configuredTarget = ConfigService.readBuildOpDeployTargetFromWorkspace() || '';
  const deployTarget = isRunPackageTarget(configuredTarget)
    ? configuredTarget
    : 'build_out/*.run';

  return getExecutableCommand(deployTarget, { execute: true });
}

/**
 * Generate standard-custom `.run` deploy command after build_example succeeds.
 * Uses build_op target_file when it references a .run package; otherwise `build_out/*.run`.
 */
export function getStandardCustomDeployCommand(baseContext: BaseContext<BuildOpConfig>) {
  try {
    const strategy = CommandStrategyFactory.getStrategy(baseContext.operator?.op_type);
    const context = strategy.buildCommandContext(baseContext);

    return joinCommands(context.sourceCannCmd, context.cdCmd, getStandardCustomDeployTail());
  }
  catch (e: unknown) {
    throw new Error(`Failed to build standard custom deploy command: ${(e as Error).message}`);
  }
}
