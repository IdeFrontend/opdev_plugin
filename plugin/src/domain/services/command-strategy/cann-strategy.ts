import { t } from 'i18next';
import * as vscode from 'vscode';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import {
  joinCommands,
  getExecutableCommand,
  Command,
  shouldAddDebugBuildType,
} from '@plugin/domain/utils/command-utils';
import type {
  BuildOpConfig,
  BuildExampleConfig,
  UtTestConfig,
  SimulateConfig,
  OnBoardConfig,
  SanitizerConfig,
} from '@plugin/service/config-service';
import {
  OpRecord,
  resolveDefaultPathOpType,
  resolveFallbackOperatorName,
} from '@plugin/domain/models/op-record';
import { ProjectRecord } from '@plugin/domain/models/project-model';
import {
  CommandStrategy,
  BaseContext,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
  SectionConfig,
  ProfilerTargetConfig,
} from './types';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  normalizeBlockId,
  normalizeLogLevel,
  normalizeMaxDebuglogSize,
  addSanitizerToolOptions,
  normalizeSanitizerCommand,
  buildSanitizerLogFileName,
} from './sanitizer-option-guards';
import {
  applyOperatorNamesPlaceholder,
  ensureStandardCustomSocFlag,
} from '@plugin/domain/utils/operator-script-placeholders';
import {
  buildPythonOnBoardCommand,
  buildPythonSimulateCommand,
} from './python-operator-strategy-shared';

/** The sanitizer memcheck sub-options the section DAO carries (truthy subset feeds `--<key>=yes`). */
const SANITIZER_MEMCHECK_OPTION_KEYS = [
  'leak-check',
  'check-unused-memory',
] as const;

/**
 * CANN type command strategy
 * CANN (Compute Architecture for Neural Networks) is Huawei’s AI computing architecture
 */
export class CannCommandStrategy implements CommandStrategy {
  buildCommandContext<TConfig extends SectionConfig>(baseContext: BaseContext<TConfig>): CommandContext<TConfig> {
    const {
      config, project, operator, op,
    } = baseContext;

    // CANN type uses ascend_env_script as environment script
    const sourceCannCmd =
      project && project.ascend_env_script
        ? `. ${project.ascend_env_script}`
        : '';

    let runPath: string;

    if (operator) {
      runPath = operator.op_path;
    }
    else {
      // If the operator cannot be found but there is a configuration script, use the project path as the running path
      if (config.script && project) {
        runPath = project.project_path;
      }
      else {
        throw new Error(`Operator not found: ${op}`);
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
      op,
    };
  }

  buildRunCommand(context: CommandContext<BuildOpConfig>): string {
    const {
      config, sourceCannCmd, cdBuildCmd,
    } = context;
    const run_cmd = getExecutableCommand(config.targetFile || '', { execute: true });

    return joinCommands(sourceCannCmd, cdBuildCmd, run_cmd);
  }

  buildOpCommand(params: CommandBuildParams<BuildOpConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames, op,
    } = params;

    const scriptField = params.scriptField || 'script';

    const scriptValue = scriptField === 'cpu_debug_script'
      ? config.cpuDebugScript
      : scriptField === 'npu_debug_script'
        ? config.npuDebugScript
        : config.script;

    if (!scriptValue) {
      throw new Error(t('cann.configMissingScript', { op }));
    }

    const script = applyOperatorNamesPlaceholder(
      scriptValue,
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

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildExampleCommand(params: CommandBuildParams<BuildExampleConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames, op,
    } = params;

    if (!config.script) {
      throw new Error(t('cann.configMissingScript', { op }));
    }

    // build.sh `--run_example` reads the example name + mode from POSITIONAL args
    // (`<op> <mode> <pkg_mode>`), NOT from flags: a field run with `--ops=abs` still
    // printed "Start to run examples, name:  mode:" empty and dumped usage. Match
    // AscendCommandStrategy.buildExampleCommand (same build.sh interface for the
    // same standard-custom operator), with two strict improvements it lacks: the
    // `config.op` fallback its own comment promises, and an empty-op guard so `mode`
    // never shifts into the name slot.
    const exampleOp = operatorNames?.trim() || op || '';
    // `exampleMode` (resolved per operator from which example file ships) wins over the
    // plugin-wide `execution_mode` setting — see operator-example-mode.ts.
    const mode = params.exampleMode || config.executionMode;
    const pkgMode = 'cust';

    // `--soc` sets the compile COMPUTE_UNIT (-DASCEND_COMPUTE_UNIT): the original failing
    // run without it had no COMPUTE_UNIT. Inject it when the script lacks `--soc` and
    // compileOption doesn't already supply it (the simulate-example flow passes
    // "--simulator <dir> --soc=<soc>" there, which must not be duplicated).
    let script = config.script;

    if (!/\B--soc=/.test(compileOption || '')) {
      script = ensureStandardCustomSocFlag(script);
    }

    const cmd = new Command(script);

    // Only append the positional `<op> <mode> <pkg>` for the ops-math `--run_example`
    // interface. Other CANN repos expose examples differently (e.g. cann-ops uses
    // `-e|--example` with no eager/graph), so appending them there would corrupt the
    // command. The operator is still required.
    if (exampleOp && /--run_example\b/.test(script)) {
      cmd.addArgument(exampleOp);
      cmd.addArgument(mode);
      cmd.addArgument(pkgMode);
    }

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildSanitizerCommand(context: CommandContext<SanitizerConfig>, exampleTargetFile?: string): string {
    const {
      config, sourceCannCmd, cdBuildCmd,
    } = context;
    const commandName = normalizeSanitizerCommand(config.toolType);
    const command = new Command(commandName);

    // Add target file
    if (exampleTargetFile) {
      command.addArgument(exampleTargetFile);
    }

    // Handle configuration options — partial DAOs carry only the fields the
    // user set, so every read is guarded with `|| {}`.
    const tool = config.tool ?? {};

    addSanitizerToolOptions(command, tool, commandName);

    // npu-check takes none of the mssanitizer-only flags below.
    if (commandName !== 'npu-check') {
      if (tool.memcheck) {
        const memcheckOption = config.memcheckOption ?? {};

        SANITIZER_MEMCHECK_OPTION_KEYS.forEach((key) => {
          if (memcheckOption[key]) {
            command.addOption(key, 'yes');
          }
        });
      }

      command.addOption('log-level', normalizeLogLevel(config.logLevel));
      command.addOption(
        'max-debuglog-size',
        normalizeMaxDebuglogSize(config.maxDebuglogSize),
      );
      command.addOption('block-id', normalizeBlockId(config.blockId));
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspacePath = workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const logFilePath = joinIdeConfigPath(
      workspacePath,
      'mindstudio_sanitizer_log',
      buildSanitizerLogFileName(commandName),
    );

    command.addOption('log-file', logFilePath);

    return joinCommands(sourceCannCmd, cdBuildCmd, command.toString());
  }

  buildSimulateCommand(params: ProfilerCommandParams<SimulateConfig>): string {
    return buildPythonSimulateCommand(params, 'cann');
  }

  buildOnBoardCommand(params: ProfilerCommandParams<OnBoardConfig>): string {
    return buildPythonOnBoardCommand(params, 'cann');
  }

  getRunTargetFile(op: string, operator: OpRecord | null = null, project: ProjectRecord | null = null): string {
    // The workspace deploy target is the per-op seed; when it is unset (the
    // multi-operator seeder leaves it empty) fall back to the operator default
    // target so a run never degrades to a bare `cd`.
    return ConfigService.readBuildOpDeployTargetFromWorkspace()
      || OperatorPluginRegistry.getDefaultPaths({
        op_type: resolveDefaultPathOpType(project?.project_type, operator?.op_type || 'cann'),
        op_path: operator?.op_path || '',
        op_name: resolveFallbackOperatorName(operator, op),
      }).targetOpFile;
  }

  getProfilerTargetFile(config: ProfilerTargetConfig, operator: OpRecord | null, op: string, project: ProjectRecord | null = null): string {
    // The cann profiler target is the build_op row target (the workspace deploy
    // setting is the current form of it) — for a standard-custom sub-op that is
    // the packaged `.run` artifact, not the example binary.
    return ConfigService.readBuildOpDeployTargetFromWorkspace()
      || OperatorPluginRegistry.getDefaultPaths({
        op_type: resolveDefaultPathOpType(project?.project_type, operator?.op_type || 'cann'),
        op_path: operator?.op_path || '',
        op_name: resolveFallbackOperatorName(operator, op),
      }).targetOpFile;
  }

  buildUtTestCommand(params: CommandBuildParams<UtTestConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames, op,
    } = params;

    if (!config.script) {
      throw new Error(`配置缺少脚本信息，且找不到算子记录: ${op}`);
    }

    const script = applyOperatorNamesPlaceholder(config.script, operatorNames);

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
