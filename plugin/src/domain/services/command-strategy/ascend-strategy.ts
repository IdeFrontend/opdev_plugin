import { t } from 'i18next';
import { soc_version } from '@plugin/domain/utils/ascend-util';
import { parse_cmd_options } from '@plugin/domain/utils/aicore-utils';
import { getOpRunPath } from '@plugin/domain/utils/op-util';
import {
  joinCommands,
  getExecutableCommand,
  Command,
  objectToCommandString,
} from '@plugin/domain/utils/command-utils';
import { OpRecord } from '@plugin/domain/models/model';
import { ProfilerFactory } from '../profiler-service';
import {
  CommandStrategy,
  BaseContext,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
} from './types';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import {
  getConfig, getConfigById,
} from '../../services/configuration';
import { getProjectById } from '@plugin/domain/models/project-model';
import { getEnvironmentSocVersionFromWorkspace } from '@plugin/helpers/operator-project-workspace-config';

/**
 * Ascend type command strategy
 */
export class AscendCommandStrategy implements CommandStrategy {
  /**
   * Replace `{soc_version}` using `op-devtools.environment.socVersion` (workspace) first,
   * then project storage, then runtime default.
   */
  private replaceSocVersion(script: string, projectId: number): string {
    const fromWorkspace = getEnvironmentSocVersionFromWorkspace().trim();
    if (fromWorkspace) {
      return script.replace(/{soc_version}/g, fromWorkspace);
    }
    if (projectId) {
      const project = getProjectById(projectId);
      if (project?.soc_version) {
        return script.replace(/{soc_version}/g, project.soc_version);
      }
    }
    return script.replace(/{soc_version}/g, soc_version);
  }

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

    let script = userOptions[scriptField] as string || '';
    // Replace {soc_version} with the project-configured soc_version
    script = this.replaceSocVersion(script, config.project_id);

    const cmd = new Command(script);

    const options: Record<string, unknown> = {};

    // Add ops parameter only if operatorNames exists and is not empty
    if (operatorNames && operatorNames.trim()) {
      options.ops = operatorNames;
    }

    cmd.addOptions(options);

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
    const mode = options.execution_mode as string || 'eager';
    const pkg_mode = 'cust';
    // If operatorNames is provided, it takes precedence; otherwise config.op is used
    const op = operatorNames || '';

    let script = config.script || '';
    // Replace {soc_version} with the project-configured soc_version
    script = this.replaceSocVersion(script, config.project_id);

    const cmd = new Command(script);

    cmd.addArgument(op);
    cmd.addArgument(mode);
    cmd.addArgument(pkg_mode);

    if (compileOption) {
    // Replace {soc_version} with the project-configured soc_version
      cmd.addArgument(this.replaceSocVersion(compileOption, config.project_id));
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildUtTestCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, advance_cmd, operatorNames } = params;

    let script = config.script || '';
    // Replace {soc_version} with the project-configured soc_version
    script = this.replaceSocVersion(script, config.project_id);

    // Replace {operatorNames} with the incoming operator names
    if (operatorNames) {
      script = script.replace('{operatorNames}', operatorNames);
    } else {
      script = script.replace('{operatorNames}', '');
    }

    const cmd = new Command(script);

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
    // Replace {soc_version} with the project-configured soc_version
    let script = config.script || '';
    script = this.replaceSocVersion(script, config.project_id);

    const mssanitizer = new Command('mssanitizer');

    // Add target file
    if (exampleTargetFile) {
      mssanitizer.addArgument(exampleTargetFile);
    }

    // Handle configuration options
    const options = (config.user_options as Record<string, unknown> | null | undefined) || {};
    const toolOptions = (options.tool as Record<string, unknown> | undefined) || {};
    const tools = Object.keys(toolOptions)
      .filter((key) => toolOptions[key]);

    mssanitizer.addOption('tool', tools);

    if (toolOptions.memcheck) {
      const memcheckOptions = (options.memcheckOption as Record<string, unknown> | undefined) || {};

      Object.keys(memcheckOptions)
        .forEach((key) => {
          if (memcheckOptions[key]) {
            mssanitizer.addOption(key, 'yes');
          }
        });
    }

    mssanitizer.addOption('log-level', options.logLevel as string | undefined);
    mssanitizer.addOption('max-debuglog-size', options.maxDebuglogSize as string | undefined);
    mssanitizer.addOption('block-id', options.blockId as string | number | undefined);
    mssanitizer.addOption(
      'log-file',
      `${operator?.op_path}/.vscode/mindstudio_sanitizer_log/mssanitizer_${new Date()
        .valueOf()}.log`,
    );

    return joinCommands(sourceCannCmd, cdCmd, mssanitizer.toString());
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

    const opprofCmd = ProfilerFactory.getStrategy('onboard')
      .generate(
        config,
        effectiveOperator,
        exampleTargetFile,
      );

    return joinCommands(sourceCannCmd, cdBuildCmd, opprofCmd);
  }

  getRunTargetFile(config: ConfigRecord, operator: OpRecord | null): string {
    // ascend type: use the currently configured target_file
    return config.target_file || '';
  }

  getProfilerTargetFile(config: ConfigRecord, operator: OpRecord | null, exampleConfigId: number): string {
    // ascend type: target_file using example configuration
    const exConfig = getConfigById(exampleConfigId) as unknown as ConfigRecord;

    return exConfig?.target_file || '';
  }
}
