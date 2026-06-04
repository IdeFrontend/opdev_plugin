import { t } from 'i18next';
import * as vscode from 'vscode';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { getOpRunPath } from '@plugin/domain/utils/op-util';
import {
  joinCommands,
  getExecutableCommand,
  Command,
} from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { OpRecord } from '@plugin/domain/models/model';
import { ProfilerFactory } from '../profiler-service';
import {
  CommandStrategy,
  BaseContext,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
} from './types';
import { getConfig } from '@plugin/domain/services/configuration';
import { ConfigService } from '@plugin/service/config-service';
import { resolveAscendEnv } from '@plugin/domain/utils/ascend-util';
import { applyOperatorNamesPlaceholder } from '@plugin/domain/utils/operator-script-placeholders';

/**
 * CANN type command strategy
 * CANN (Compute Architecture for Neural Networks) is Huawei’s AI computing architecture
 */
export class CannCommandStrategy implements CommandStrategy {
  buildCommandContext(baseContext: BaseContext): CommandContext {
    const {
      config, project, operator,
    } = baseContext;

    // CANN type uses ascend_env_script as environment script
    const sourceCannCmd =
      project && project.ascend_env_script
        ? `. ${project.ascend_env_script}`
        : '';

    let runPath: string;

    if (operator) {
      runPath = getOpRunPath(operator);
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
    const cdBuildCmd = `mkdir -p  ${runPath}/build && cd ${runPath}/build`;

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
      config, sourceCannCmd, cdBuildCmd,
    } = context;
    const run_cmd = getExecutableCommand(config.target_file || '', { execute: true });

    return joinCommands(sourceCannCmd, cdBuildCmd, run_cmd);
  }

  buildOpCommand(params: CommandBuildParams): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames,
    } = params;

    const scriptField = params.scriptField || 'script';

    const userOptions = config.user_options as Record<string, unknown> | null | undefined;

    if (!userOptions || !userOptions[scriptField]) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }

    const script = applyOperatorNamesPlaceholder(
      userOptions[scriptField] as string,
      operatorNames,
    );
    const cmd = new Command(script);

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildExampleCommand(params: CommandBuildParams): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd,
    } = params;

    if (!config.script) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }

    const cmd = new Command(config.script || '');

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
    cdBuildCmd?: string,
  ): string {
    const mssanitizer = new Command('mssanitizer');

    // Add target file
    if (exampleTargetFile) {
      mssanitizer.addArgument(exampleTargetFile);
    }

    // Handle configuration options
    const options =
      (config.user_options as Record<string, unknown> | null | undefined) || {};
    const toolOptions =
      (options.tool as Record<string, unknown> | undefined) || {};
    const tools = Object.keys(toolOptions)
      .filter((key) => toolOptions[key]);

    mssanitizer.addOption('tool', tools);

    if (toolOptions.memcheck) {
      const memcheckOptions =
        (options.memcheckOption as Record<string, unknown> | undefined) || {};

      Object.keys(memcheckOptions)
        .forEach((key) => {
          if (memcheckOptions[key]) {
            mssanitizer.addOption(key, 'yes');
          }
        });
    }

    mssanitizer.addOption('log-level', options.logLevel as string | undefined);
    mssanitizer.addOption(
      'max-debuglog-size',
      options.maxDebuglogSize as string | undefined,
    );
    mssanitizer.addOption(
      'block-id',
      options.blockId as string | number | undefined,
    );

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspacePath = workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const logFilePath = joinIdeConfigPath(
      workspacePath,
      'mindstudio_sanitizer_log',
      `mssanitizer_${new Date()
        .valueOf()}.log`,
    );

    mssanitizer.addOption('log-file', logFilePath);

    return joinCommands(sourceCannCmd, cdBuildCmd, mssanitizer.toString());
  }

  buildSimulateCommand(params: ProfilerCommandParams): string {
    const {
      config,
      project,
      operator,
      sourceCannCmd,
      cdBuildCmd,
      exampleTargetFile,
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
        op_type: 'cann',
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
      config,
      project,
      operator,
      sourceCannCmd,
      cdBuildCmd,
      exampleTargetFile,
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
        op_type: 'cann',
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

  // FIXME: Profiler/sanitizer target still comes from legacy configs.json (build_op.target_file), not workspace settings.
  getProfilerTargetFile(config: ConfigRecord, _operator: OpRecord | null, _exampleConfigId: number): string {
    const buildOpConfigs = getConfig(config.project_id, 'build_op', config.op);
    const buildOpConfig = buildOpConfigs.length > 0 ? buildOpConfigs[0] : null;
    return buildOpConfig?.target_file || '';
  }

  buildUtTestCommand(params: CommandBuildParams): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames,
    } = params;

    const userOptions = config.user_options as Record<string, unknown> | null | undefined;

    if (!userOptions || !userOptions.script) {
      throw new Error(`配置缺少脚本信息，且找不到算子记录: ${config.op}`);
    }

    const script = applyOperatorNamesPlaceholder(userOptions.script as string, operatorNames);

    const cmd = new Command(script);

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }
}
