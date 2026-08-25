import {
  joinCommands,
  getExecutableCommand,
  Command,
  shouldAddDebugBuildType,
} from '@plugin/domain/utils/command-utils';
import {
  OpRecord,
  resolveFallbackOperatorName,
} from '@plugin/domain/models/op-record';
import { ProjectRecord } from '@plugin/domain/models/project-model';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import { getFirstWorkspaceFolderPath } from '@plugin/helpers/operator-project-workspace-config';
import {
  CommandStrategy,
  BaseContext,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
  SectionConfig,
  ProfilerTargetConfig,
} from './types';
import type {
  BuildOpConfig,
  BuildExampleConfig,
  UtTestConfig,
  SimulateConfig,
  OnBoardConfig,
  SanitizerConfig,
} from '@plugin/service/config-service';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { applyOperatorNamesPlaceholder } from '@plugin/domain/utils/operator-script-placeholders';
import {
  normalizeBlockId,
  normalizeLogLevel,
  normalizeMaxDebuglogSize,
  normalizeSanitizerTools,
} from './sanitizer-option-guards';
import {
  buildPythonOnBoardCommand,
  buildPythonSimulateCommand,
} from './python-operator-strategy-shared';

/** The sanitizer tool keys the section DAO carries (a truthy subset feeds `--tool`). */
const SANITIZER_TOOL_KEYS = [
  'memcheck',
  'racecheck',
  'initcheck',
] as const;

/** The sanitizer memcheck sub-options the section DAO carries (truthy subset feeds `--<key>=yes`). */
const SANITIZER_MEMCHECK_OPTION_KEYS = [
  'leak-check',
  'check-unused-memory',
] as const;

/**
 * Ascend type command strategy
 */
export class AscendCommandStrategy implements CommandStrategy {
  buildCommandContext<TConfig extends SectionConfig>(baseContext: BaseContext<TConfig>): CommandContext<TConfig> {
    const {
      config, project, operator, op,
    } = baseContext;

    // Ascend type uses ascend_env_script as environment script
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
    const cdBuildCmd = `mkdir -p ${runPath}/build && cd ${runPath}/build`;

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
      config, sourceCannCmd, cdCmd,
    } = context;
    const run_cmd = getExecutableCommand(config.targetFile || '', { execute: true });

    return joinCommands(sourceCannCmd, cdCmd, run_cmd);
  }

  buildOpCommand(params: CommandBuildParams<BuildOpConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames,
    } = params;

    const scriptField = params.scriptField || 'script';

    const scriptValue = scriptField === 'cpu_debug_script'
      ? config.cpuDebugScript
      : scriptField === 'npu_debug_script'
        ? config.npuDebugScript
        : config.script;

    const script = applyOperatorNamesPlaceholder(
      scriptValue || '',
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

    // The deploy tail belongs to the build_op section — the simulate/on-board/sanitizer
    // pre-builds resolve their OWN section DAO (no targetFile field), so their command
    // ends after the compile step (target_file stays undefined for those sections).
    const sectionTarget = 'targetFile' in config ? config.targetFile || '' : '';
    const deploy_cmd = getExecutableCommand(sectionTarget, { execute: true });

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString(), deploy_cmd);
  }

  buildExampleCommand(params: CommandBuildParams<BuildExampleConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames,
    } = params;

    // `exampleMode` (resolved per operator from which example file ships) wins over the
    // plugin-wide `execution_mode` setting — see operator-example-mode.ts.
    const mode = params.exampleMode || config.executionMode;
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

  buildUtTestCommand(params: CommandBuildParams<UtTestConfig>): string {
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

  buildSanitizerCommand(context: CommandContext<SanitizerConfig>, exampleTargetFile?: string): string {
    const {
      config, operator, sourceCannCmd, cdCmd,
    } = context;
    const mssanitizer = new Command('mssanitizer');

    // Add target file
    if (exampleTargetFile) {
      mssanitizer.addArgument(exampleTargetFile);
    }

    // Handle configuration options — partial DAOs carry only the fields the
    // user set, so every read is guarded with `|| {}`.
    const tool = config.tool ?? {};
    const tools = normalizeSanitizerTools(SANITIZER_TOOL_KEYS
      .filter((key) => tool[key]));

    if (tools.length > 0) {
      mssanitizer.addOption('tool', tools);
    }

    if (tool.memcheck) {
      const memcheckOption = config.memcheckOption ?? {};

      SANITIZER_MEMCHECK_OPTION_KEYS.forEach((key) => {
        if (memcheckOption[key]) {
          mssanitizer.addOption(key, 'yes');
        }
      });
    }

    mssanitizer.addOption('log-level', normalizeLogLevel(config.logLevel));
    mssanitizer.addOption('max-debuglog-size', normalizeMaxDebuglogSize(config.maxDebuglogSize));
    mssanitizer.addOption('block-id', normalizeBlockId(config.blockId));
    // Sanitizer logs live under the workspace root — the reader only looks
    // there, and a per-operator copy would be lost (cann parity).
    const workspacePath = getFirstWorkspaceFolderPath() ?? operator?.op_path ?? process.cwd();

    mssanitizer.addOption(
      'log-file',
      `${joinIdeConfigPath(workspacePath, 'mindstudio_sanitizer_log', `mssanitizer_${new Date()
        .valueOf()}.log`)}`,
    );

    return joinCommands(sourceCannCmd, cdCmd, mssanitizer.toString());
  }

  buildSimulateCommand(params: ProfilerCommandParams<SimulateConfig>): string {
    return buildPythonSimulateCommand(params, 'ascend');
  }

  buildOnBoardCommand(params: ProfilerCommandParams<OnBoardConfig>): string {
    return buildPythonOnBoardCommand(params, 'ascend');
  }

  getRunTargetFile(op: string, operator: OpRecord | null = null, _project: ProjectRecord | null = null): string {
    // The workspace deploy target is the per-op seed; when it is unset (the
    // multi-operator seeder leaves it empty) fall back to the operator default
    // .run package so a run never degrades to a bare `cd`.
    return ConfigService.readBuildOpDeployTargetFromWorkspace()
      || OperatorPluginRegistry.getDefaultPaths({
        op_type: 'ascend',
        op_path: operator?.op_path || '',
        op_name: resolveFallbackOperatorName(operator, op),
      }).targetOpFile;
  }

  getProfilerTargetFile(config: ProfilerTargetConfig, operator: OpRecord | null, op: string, _project: ProjectRecord | null = null): string {
    return ConfigService.readBuildExampleTargetFromWorkspace()
      || OperatorPluginRegistry.getDefaultPaths({
        op_type: 'ascend',
        op_path: operator?.op_path || '',
        op_name: resolveFallbackOperatorName(operator, op),
      }).targetExampleFile;
  }
}
