import { t } from 'i18next';
import { getOpRunPath } from '@plugin/domain/utils/op-util';
import {
  joinCommands,
  getExecutableCommand,
  Command,
  shouldAddDebugBuildType,
} from '@plugin/domain/utils/command-utils';
import { OpRecord } from '@plugin/domain/models/model';
import { joinIdeConfigRelative } from '@plugin/helpers/ide-config-dir';
import { ProfilerFactory } from '../profiler-service';
import {
  CommandStrategy,
  BaseContext,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
} from './types';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { getConfigById } from '@plugin/domain/services/configuration';
import { ConfigService } from '@plugin/service/config-service';
import { resolveAscendEnv } from '@plugin/domain/utils/ascend-util';
import { applyOperatorNamesPlaceholder } from '@plugin/domain/utils/operator-script-placeholders';
import {
  normalizeBlockId,
  normalizeLogLevel,
  normalizeMaxDebuglogSize,
  addSanitizerToolOptions,
  normalizeSanitizerCommand,
} from './sanitizer-option-guards';

/**
 * Ascend type command strategy
 */
export class AscendCommandStrategy implements CommandStrategy {
  buildCommandContext(baseContext: BaseContext): CommandContext {
    const {
      config, project, operator,
    } = baseContext;

    // Ascend type uses ascend_env_script as environment script
    const sourceCannCmd =
      project && project.ascend_env_script
        ? `. ${project.ascend_env_script}`
        : '';

    let runPath: string;

    if (operator) {
      runPath = getOpRunPath(operator, config);
    }
    else {
      // If the operator cannot be found but there is a configuration script, use the project path as the running path
      if (config.script && project) {
        runPath = project.project_path;
      }
      else {
        throw new Error(`Operator not found: ${config.op}`);
      }
    }

    const cdCmd = `cd ${runPath}`;
    const cdBuildCmd = `mkdir -p ${runPath}/build && cd ${runPath}/build`;

    return {
      config,
      project,
      operator,
      sourceCannCmd,
      cdCmd,
      cdBuildCmd,
    };
  }

  buildRunCommand(context: CommandContext): string {
    const {
      config, sourceCannCmd, cdCmd,
    } = context;
    const run_cmd = getExecutableCommand(config.target_file || '', { execute: true });

    return joinCommands(sourceCannCmd, cdCmd, run_cmd);
  }

  buildOpCommand(params: CommandBuildParams): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames,
    } = params;

    const scriptField = params.scriptField || 'script';

    const userOptions = (config.user_options as Record<string, unknown> | null | undefined) || {};

    const script = applyOperatorNamesPlaceholder(
      userOptions[scriptField] as string || '',
      operatorNames,
    );

    const cmd = new Command(script);

    if (shouldAddDebugBuildType(scriptField, script, compileOption, advance_cmd)) {
      cmd.addArgument('--build-type=Debug');
    }

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    const deploy_cmd = getExecutableCommand(config.target_file || '', { execute: true });

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString(), deploy_cmd);
  }

  buildExampleCommand(params: CommandBuildParams): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames,
    } = params;

    const options = (config.user_options as Record<string, unknown> | null | undefined) || {};
    // `exampleMode` (resolved per operator from which example file ships) wins over the
    // plugin-wide `execution_mode` setting — see operator-example-mode.ts / #171.
    const mode = params.exampleMode || (options.execution_mode as string) || 'eager';
    const pkg_mode = 'cust';
    // If operatorNames is provided, it takes precedence; otherwise config.op is used
    const op = operatorNames || '';

    const script = config.script || '';

    const cmd = new Command(script);

    // Only append the positional `<op> <mode> <pkg>` for the ops-math `--run_example`
    // interface; other example interfaces would be corrupted by appending eager/graph/cust.
    if (op && /--run_example\b/.test(script)) {
      cmd.addArgument(op);
      cmd.addArgument(mode);
      cmd.addArgument(pkg_mode);
    }

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (params.buildExampleOnly
      && /--run_example\b/.test(script)
      && !/\B--noexec\b/.test([
        script,
        compileOption,
        advance_cmd,
      ]
        .filter(Boolean)
        .join(' '))) {
      cmd.addArgument('--noexec');
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildUtTestCommand(params: CommandBuildParams): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames,
    } = params;

    const script = applyOperatorNamesPlaceholder(config.script || '', operatorNames);

    const cmd = new Command(script);

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildSanitizerCommand(
    config: ConfigRecord,
    operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string,
  ): string {
    const options = (config.user_options as Record<string, unknown> | null | undefined) || {};
    const commandName = normalizeSanitizerCommand(options.toolType ?? options.sanitizerTool);
    const command = new Command(commandName);

    if (exampleTargetFile) {
      command.addArgument(exampleTargetFile);
    }

    const toolOptions = (options.tool as Record<string, unknown> | undefined) || {};

    addSanitizerToolOptions(command, toolOptions, commandName);

    if (commandName !== 'npu-check') {
      if (toolOptions.memcheck) {
        const memcheckOptions = (options.memcheckOption as Record<string, unknown> | undefined) || {};

        Object.keys(memcheckOptions)
          .forEach((key) => {
            if (memcheckOptions[key]) {
              command.addOption(key, 'yes');
            }
          });
      }

      command.addOption('log-level', normalizeLogLevel(options.logLevel));
      command.addOption('max-debuglog-size', normalizeMaxDebuglogSize(options.maxDebuglogSize));
      command.addOption('block-id', normalizeBlockId(options.blockId));
    }

    command.addOption(
      'log-file',
      `${operator?.op_path}/${joinIdeConfigRelative('mindstudio_sanitizer_log')}/mssanitizer_${new Date()
        .valueOf()}.log`,
    );

    return joinCommands(sourceCannCmd, cdCmd, command.toString());
  }

  buildSimulateCommand(params: ProfilerCommandParams): string {
    const {
      config, project, operator, sourceCannCmd, cdBuildCmd, exampleTargetFile,
    } = params;

    // If the operator record is not found but the project path is available, create a temporary operator object
    let effectiveOperator = operator;

    if (!effectiveOperator) {
      if (!project || !project.project_path) {
        throw new Error(t('cann.cannotGenerateSimulateCommand', { op: config.op }));
      }

      // Create a temporary operator object, using the project path as op_path
      effectiveOperator = {
        id: 0,
        project_id: config.project_id,
        op_name: config.op,
        op_type: 'ascend',
        op_path: project.project_path,
      } as OpRecord;
    }

    const simulatorCmd = ProfilerFactory.getStrategy('simulator')
      .generate(
        config,
        effectiveOperator,
        exampleTargetFile,
      );

    return joinCommands(sourceCannCmd, cdBuildCmd, simulatorCmd);
  }

  buildOnBoardCommand(params: ProfilerCommandParams): string {
    const {
      config, project, operator, sourceCannCmd, cdBuildCmd, exampleTargetFile,
    } = params;

    // If the operator record is not found but the project path is available, create a temporary operator object
    let effectiveOperator = operator;

    if (!effectiveOperator) {
      if (!project || !project.project_path) {
        throw new Error(t('cann.cannotGenerateOnBoardCommand', { op: config.op }));
      }

      // Create a temporary operator object, using the project path as op_path
      effectiveOperator = {
        id: 0,
        project_id: config.project_id,
        op_name: config.op,
        op_type: 'ascend',
        op_path: project.project_path,
      } as OpRecord;
    }

    const onboardCannSoc = resolveAscendEnv({ isSimulator: false }).socVersion;
    const opprofCmd = ProfilerFactory.getStrategy('onboard')
      .generate(
        config,
        effectiveOperator,
        exampleTargetFile,
        { onboardCannSoc },
      );

    return joinCommands(sourceCannCmd, cdBuildCmd, opprofCmd);
  }

  getRunTargetFile(_config: ConfigRecord, _operator: OpRecord | null): string {
    return ConfigService.readBuildOpDeployTargetFromWorkspace() || '';
  }

  // FIXME: Profiler/msprof/mssanitizer target still comes from legacy configs.json (build_example.target_file), not workspace settings.
  getProfilerTargetFile(_config: ConfigRecord, _operator: OpRecord | null, exampleConfigId: number): string {
    const exConfig = getConfigById(exampleConfigId) as ConfigRecord | null;

    return exConfig?.target_file || '';
  }
}
